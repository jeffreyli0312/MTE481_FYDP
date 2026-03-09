import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  Dimensions,
  Pressable,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, Text, Button, ActivityIndicator } from "react-native-paper";
import { useLocalSearchParams, router, Stack } from "expo-router";
import { LineChart } from "react-native-chart-kit";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { useAppTheme } from "../theme";
import {
  initBleDb,
  listSamplesForSet,
  getLatestCalibration,
  getBaselineOffsets,
} from "../sqlite/bleDb";
import { useAuth } from "../context/AuthContext";
import { movingAverageSmooth } from "../utils/format";

const screenWidth = Dimensions.get("window").width;

type SampleRow = {
  time: number;
  emg_left_tricep?: number | null;
  emg_left_pec?: number | null;
  emg_right_tricep?: number | null;
  emg_right_pec?: number | null;
  l_roll?: number | null;
  l_pitch?: number | null;
  l_yaw?: number | null;
  r_roll?: number | null;
  r_pitch?: number | null;
  r_yaw?: number | null;
};

type Point = { time: number; value: number };

type EmgChannelKey = "emg_left_tricep" | "emg_left_pec" | "emg_right_tricep" | "emg_right_pec";

const EMG_CHANNELS: { key: EmgChannelKey; label: string }[] = [
  { key: "emg_left_tricep", label: "L Tricep" },
  { key: "emg_left_pec", label: "L Pec" },
  { key: "emg_right_tricep", label: "R Tricep" },
  { key: "emg_right_pec", label: "R Pec" },
];

type ImuAxisKey = "l_roll" | "l_pitch" | "l_yaw" | "r_roll" | "r_pitch" | "r_yaw";
type ImuSide = "left" | "right";

const IMU_AXES: { axis: string; leftKey: ImuAxisKey; rightKey: ImuAxisKey; label: string; color: string }[] = [
  { axis: "roll",  leftKey: "l_roll",  rightKey: "r_roll",  label: "Roll",  color: "rgba(59,130,246,1)" },
  { axis: "pitch", leftKey: "l_pitch", rightKey: "r_pitch", label: "Pitch", color: "rgba(249,115,22,1)" },
  { axis: "yaw",   leftKey: "l_yaw",   rightKey: "r_yaw",   label: "Yaw",   color: "rgba(34,197,94,1)" },
];

type MetricKey = "force" | "imu";

function formatDateOnly(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDurationFromMs(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "0m 0s";
  const sec = Math.floor(ms / 1000);
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

async function fetchAllPages<T>(
  makeQuery: (from: number, to: number) => ReturnType<typeof supabase.from>,
  pageSize = 1000
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = (await (makeQuery(from, to) as any)) as {
      data: T[] | null;
      error: any;
    };
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

function downsampleMinMax(points: Point[], maxPoints: number): Point[] {
  if (!Number.isFinite(maxPoints) || maxPoints === Infinity) return points;
  if (maxPoints <= 2 || points.length <= maxPoints) return points;
  const bucketCount = Math.max(1, Math.floor(maxPoints / 2));
  const n = points.length;
  const bucketSize = Math.ceil(n / bucketCount);
  const out: Point[] = [];
  for (let b = 0; b < bucketCount; b++) {
    const start = b * bucketSize;
    const end = Math.min(n, start + bucketSize);
    if (start >= end) break;
    let minP = points[start];
    let maxP = points[start];
    for (let i = start + 1; i < end; i++) {
      const p = points[i];
      if (p.value < minP.value) minP = p;
      if (p.value > maxP.value) maxP = p;
    }
    if (minP.time <= maxP.time) out.push(minP, maxP);
    else out.push(maxP, minP);
  }
  const last = points[points.length - 1];
  if (out.length === 0 || out[out.length - 1].time !== last.time) out.push(last);
  return out.length > maxPoints ? out.slice(0, maxPoints) : out;
}

function rmsEnvelope(points: Point[], windowSize = 25): Point[] {
  if (windowSize <= 1) return points;
  const out: Point[] = [];
  let sumSq = 0;
  const buf: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const v = points[i].value;
    const vv = v * v;
    buf.push(vv);
    sumSq += vv;
    if (buf.length > windowSize) sumSq -= buf.shift()!;
    const rms = Math.sqrt(sumSq / buf.length);
    out.push({ time: points[i].time, value: rms });
  }
  return out;
}

function emaSmooth(points: Point[], alpha = 0.2): Point[] {
  if (points.length === 0) return points;
  const a = Math.max(0.001, Math.min(0.999, alpha));
  const out: Point[] = [];
  let prev = points[0].value;
  out.push({ time: points[0].time, value: prev });
  for (let i = 1; i < points.length; i++) {
    const v = points[i].value;
    const s = a * v + (1 - a) * prev;
    prev = s;
    out.push({ time: points[i].time, value: s });
  }
  return out;
}


export default function SetAnalyticsScreen() {
  const { colors, dark } = useAppTheme();
  const { user } = useAuth();

  const { setId, label, created_at, source, mvcValue: mvcParam } = useLocalSearchParams<{
    setId: string;
    label?: string;
    created_at?: string;
    source?: string;
    mvcValue?: string;
  }>();

  const isSqlite = source === "sqlite";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [samples, setSamples] = useState<SampleRow[]>([]);
  const [duration, setDuration] = useState("0m 0s");
  const [emgChannelSeries, setEmgChannelSeries] = useState<Record<EmgChannelKey, Point[]>>({
    emg_left_tricep: [], emg_left_pec: [], emg_right_tricep: [], emg_right_pec: [],
  });
  const [imuAxisSeries, setImuAxisSeries] = useState<Record<ImuAxisKey, Point[]>>({
    l_roll: [], l_pitch: [], l_yaw: [],
    r_roll: [], r_pitch: [], r_yaw: [],
  });
  const [metric, setMetric] = useState<MetricKey>("force");
  const [selectedEmgChannel, setSelectedEmgChannel] = useState<EmgChannelKey>("emg_left_pec");
  const [selectedImuSide, setSelectedImuSide] = useState<ImuSide>("left");
  const [mvcValue, setMvcValue] = useState(0);

  const metricOptions: { key: MetricKey; label: string }[] = [
    { key: "force", label: "EMG" },
    { key: "imu", label: "IMU" },
  ];

  useEffect(() => {
  let cancelled = false;

  async function load() {
    try {
      setLoading(true);
      setErr(null);
      if (!setId) throw new Error("Missing setId");

      // Resolve MVC value: from param or from DB
      let mvc = mvcParam ? parseFloat(mvcParam) : 0;
      if (!mvc && isSqlite && user?.id) {
        const cal = getLatestCalibration(user.id, (label as string) ?? "Bench Press");
        if (cal) mvc = cal.mvc_value;
      }
      if (!cancelled) setMvcValue(mvc);

      if (isSqlite) {
        initBleDb();

        const baseline = getBaselineOffsets(setId);
        const sqliteRows = listSamplesForSet(setId, 5000);

        const rows: SampleRow[] = sqliteRows.map((r: any) => ({
          time: Number(r.t_ms),
          emg_left_tricep: Math.max(0, Number(r.emg_left_tricep ?? 0) - baseline.emg_left_tricep),
          emg_left_pec: Math.max(0, Number(r.emg_left_pec ?? 0) - baseline.emg_left_pec),
          emg_right_tricep: Math.max(0, Number(r.emg_right_tricep ?? 0) - baseline.emg_right_tricep),
          emg_right_pec: Math.max(0, Number(r.emg_right_pec ?? 0) - baseline.emg_right_pec),
          l_roll: Number(r.l_roll ?? 0),
          l_pitch: Number(r.l_pitch ?? 0),
          l_yaw: Number(r.l_yaw ?? 0),
          r_roll: Number(r.r_roll ?? 0),
          r_pitch: Number(r.r_pitch ?? 0),
          r_yaw: Number(r.r_yaw ?? 0),
        }));

        const buildChannel = (key: EmgChannelKey): Point[] =>
          rows
            .filter((r) => Number.isFinite(r.time) && Number.isFinite(r[key]))
            .map((r) => {
              const v = Number(r[key]);
              return { time: r.time, value: mvc > 0 ? (v / mvc) * 100 : v };
            })
            .sort((a, b) => a.time - b.time);

        const perChannel: Record<EmgChannelKey, Point[]> = {
          emg_left_tricep: buildChannel("emg_left_tricep"),
          emg_left_pec: buildChannel("emg_left_pec"),
          emg_right_tricep: buildChannel("emg_right_tricep"),
          emg_right_pec: buildChannel("emg_right_pec"),
        };

        const buildImuAxis = (key: ImuAxisKey): Point[] =>
          rows
            .filter((r) => Number.isFinite(r.time) && Number.isFinite(r[key]))
            .map((r) => ({ time: r.time, value: Number(r[key]) }))
            .sort((a, b) => a.time - b.time);

        const perImu: Record<ImuAxisKey, Point[]> = {
          l_roll: buildImuAxis("l_roll"), l_pitch: buildImuAxis("l_pitch"), l_yaw: buildImuAxis("l_yaw"),
          r_roll: buildImuAxis("r_roll"), r_pitch: buildImuAxis("r_pitch"), r_yaw: buildImuAxis("r_yaw"),
        };

        const times = Array.from(new Set(rows.map((r) => r.time))).sort(
          (a, b) => a - b
        );

        const firstTime = times[0];
        const lastTime = times[times.length - 1];
        const durMs =
          Number.isFinite(firstTime) &&
          Number.isFinite(lastTime) &&
          times.length >= 2
            ? lastTime - firstTime
            : 0;

        if (!cancelled) {
          setSamples(rows);
          setEmgChannelSeries(perChannel);
          setImuAxisSeries(perImu);
          setDuration(formatDurationFromMs(durMs));
        }

        return;
      }

      const emgData = await fetchAllPages<{ time: any; emg_value: any }>(
        (from, to) =>
          supabase
            .from("emg_samples")
            .select("time, emg_value")
            .eq("set_id", setId)
            .order("time", { ascending: true })
            .range(from, to) as any,
        1000
      );

      const imuData = await fetchAllPages<{ time: any; gyrx: any }>(
        (from, to) =>
          supabase
            .from("imu_samples")
            .select("time, gyrx")
            .eq("set_id", setId)
            .order("time", { ascending: true })
            .range(from, to) as any,
        1000
      );

      const emgAll: Point[] = (emgData ?? [])
        .map((r) => ({ time: Number(r.time), value: Number(r.emg_value) }))
        .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value))
        .sort((a, b) => a.time - b.time);

      const imuAll: Point[] = (imuData ?? [])
        .map((r) => ({ time: Number(r.time), value: Number(r.gyrx) }))
        .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value))
        .sort((a, b) => a.time - b.time);

      const emgMap = new Map<number, number>();
      for (const p of emgAll) emgMap.set(p.time, p.value);

      const imuMap = new Map<number, number>();
      for (const p of imuAll) imuMap.set(p.time, p.value);

      const times = Array.from(
        new Set<number>([
          ...emgAll.map((p) => p.time),
          ...imuAll.map((p) => p.time),
        ])
      ).sort((a, b) => a - b);

      const rows: SampleRow[] = times.map((t) => {
        const emgVal = emgMap.has(t) ? emgMap.get(t)! : null;
        const imuVal = imuMap.has(t) ? imuMap.get(t)! : null;
        return {
          time: t,
          emg_left_tricep: emgVal,
          emg_left_pec: emgVal,
          emg_right_tricep: emgVal,
          emg_right_pec: emgVal,
          l_roll: imuVal, l_pitch: imuVal, l_yaw: imuVal,
          r_roll: imuVal, r_pitch: imuVal, r_yaw: imuVal,
        };
      });

      const perChannel: Record<EmgChannelKey, Point[]> = {
        emg_left_tricep: emgAll,
        emg_left_pec: emgAll,
        emg_right_tricep: emgAll,
        emg_right_pec: emgAll,
      };

      const perImu: Record<ImuAxisKey, Point[]> = {
        l_roll: imuAll, l_pitch: imuAll, l_yaw: imuAll,
        r_roll: imuAll, r_pitch: imuAll, r_yaw: imuAll,
      };

      const firstTime = times[0];
      const lastTime = times[times.length - 1];
      const durMs =
        Number.isFinite(firstTime) &&
        Number.isFinite(lastTime) &&
        times.length >= 2
          ? lastTime - firstTime
          : 0;

      if (!cancelled) {
        setEmgChannelSeries(perChannel);
        setImuAxisSeries(perImu);
        setSamples(rows);
        setDuration(formatDurationFromMs(durMs));
      }
    } catch (e: any) {
      if (!cancelled) setErr(e?.message ?? "Failed to load set");
    } finally {
      if (!cancelled) setLoading(false);
    }
  }

  load();
  return () => {
    cancelled = true;
  };
}, [setId, isSqlite]);

  const baseWidth = screenWidth - 32;
  const displayMaxPoints = 300;

  const emgSeries = emgChannelSeries[selectedEmgChannel];

  const displayEmg = useMemo(() => {
    const smoothed = movingAverageSmooth(emgSeries, 10);
    const env = rmsEnvelope(smoothed, 25);
    return downsampleMinMax(env, displayMaxPoints);
  }, [emgSeries]);

  const processImuAxis = useCallback((key: ImuAxisKey) => {
    const smoothed = movingAverageSmooth(imuAxisSeries[key], 10);
    const env = emaSmooth(smoothed, 0.25);
    return downsampleMinMax(env, displayMaxPoints);
  }, [imuAxisSeries]);

  const imuSideKeys = useMemo(
    () => IMU_AXES.map((a) => (selectedImuSide === "left" ? a.leftKey : a.rightKey)),
    [selectedImuSide]
  );

  const displayImuAxes = useMemo(
    () => imuSideKeys.map((key) => processImuAxis(key)),
    [imuSideKeys, processImuAxis]
  );

  const imuReferenceAxis = useMemo(() => displayImuAxes[0] ?? [], [displayImuAxes]);

  const MAX_CHART_WIDTH = 2400;
  const emgChartWidth = useMemo(
    () => Math.min(MAX_CHART_WIDTH, Math.max(baseWidth, displayEmg.length * 4)),
    [baseWidth, displayEmg.length]
  );
  const imuChartWidth = useMemo(
    () => Math.min(MAX_CHART_WIDTH, Math.max(baseWidth, imuReferenceAxis.length * 4)),
    [baseWidth, imuReferenceAxis.length]
  );

  const emgSelectedSeries = useMemo(() => displayEmg.map((p) => p.value), [displayEmg]);

  const emgChartLabels = useMemo(() => {
    if (displayEmg.length === 0) return [];
    const t0 = displayEmg[0].time;
    const step = Math.max(1, Math.floor(displayEmg.length / 8));
    return displayEmg.map((p, i) => {
      if (i % step === 0 || i === displayEmg.length - 1) {
        return ((p.time - t0) / 1000).toFixed(1);
      }
      return "";
    });
  }, [displayEmg]);

  const imuChartLabels = useMemo(() => {
    if (imuReferenceAxis.length === 0) return [];
    const t0 = imuReferenceAxis[0].time;
    const step = Math.max(1, Math.floor(imuReferenceAxis.length / 8));
    return imuReferenceAxis.map((p, i) => {
      if (i % step === 0 || i === imuReferenceAxis.length - 1) {
        return ((p.time - t0) / 1000).toFixed(1);
      }
      return "";
    });
  }, [imuReferenceAxis]);

  const imuDatasets = useMemo(() => {
    const minLen = Math.min(...displayImuAxes.map((a) => a.length));
    if (minLen < 2) return null;
    return {
      labels: imuChartLabels,
      datasets: IMU_AXES.map((axis, i) => ({
        data: displayImuAxes[i].slice(0, minLen).map((p) => p.value),
        color: (opacity = 1) => axis.color.replace(",1)", `,${clamp01(opacity)})`),
        strokeWidth: 2,
      })),
    };
  }, [displayImuAxes, imuChartLabels]);

  const emgChannelLabel = EMG_CHANNELS.find((c) => c.key === selectedEmgChannel)?.label ?? "";
  const emgTitle = `${emgChannelLabel} ${mvcValue > 0 ? "(% MVC)" : "EMG"} Over Time`;
  const imuTitle = `${selectedImuSide === "left" ? "Left" : "Right"} IMU – Roll / Pitch / Yaw`;

  const channelValues = useMemo(
    () => emgSeries.map((p) => p.value).filter((v) => Number.isFinite(v)),
    [emgSeries]
  );

  const avgEmg = useMemo(() => {
    if (!channelValues.length) return 0;
    return channelValues.reduce((a, b) => a + b, 0) / channelValues.length;
  }, [channelValues]);

  const maxEmg = useMemo(() => {
    let mx = 0;
    for (let i = 0; i < channelValues.length; i++) {
      if (channelValues[i] > mx) mx = channelValues[i];
    }
    return mx;
  }, [channelValues]);

  const consistency = useMemo(() => {
    if (channelValues.length < 2) return 0;
    const mean = channelValues.reduce((a, b) => a + b, 0) / channelValues.length;
    if (mean === 0) return 0;
    const variance = channelValues.reduce((s, v) => s + (v - mean) ** 2, 0) / channelValues.length;
    const cv = (Math.sqrt(variance) / mean) * 100;
    const score = Math.max(0, Math.min(100, Math.round(100 - cv)));
    return score;
  }, [channelValues]);

  const consistencyLabel = consistency > 80 ? "Excellent" : consistency > 60 ? "Good" : "Needs Work";

  const chartConfig = useMemo(
    () => ({
      backgroundGradientFrom: colors.surface,
      backgroundGradientTo: colors.surface,
      decimalPlaces: 1,
      color: (opacity = 1) =>
        dark
          ? `rgba(96, 165, 250, ${clamp01(opacity)})`
          : `rgba(37, 99, 235, ${clamp01(opacity)})`,
      labelColor: (opacity = 1) =>
        dark
          ? `rgba(156, 163, 175, ${clamp01(opacity)})`
          : `rgba(107, 114, 128, ${clamp01(opacity)})`,
      propsForBackgroundLines: {
        strokeDasharray: "3 6",
        stroke: dark ? "#374151" : "#e5e7eb",
      },
    }),
    [dark, colors.surface]
  );

  if (loading) {
    return (
      <SafeAreaView edges={["top"]} style={[styles.center, { backgroundColor: colors.background, paddingHorizontal: 20 }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar barStyle={dark ? "light-content" : "dark-content"} />
        <ActivityIndicator />
        <Text variant="bodySmall" style={{ marginTop: 10, color: colors.onSurfaceVariant }}>
          Loading...
        </Text>
      </SafeAreaView>
    );
  }

  if (err) {
    return (
      <SafeAreaView edges={["top"]} style={[styles.center, { backgroundColor: colors.background, paddingHorizontal: 20 }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar barStyle={dark ? "light-content" : "dark-content"} />
        <Text variant="titleSmall" style={{ color: colors.onSurface }}>
          Couldn't load
        </Text>
        <Text variant="bodySmall" style={{ marginTop: 6, color: colors.onSurfaceVariant }}>
          {err}
        </Text>
        <Button mode="text" onPress={() => router.back()} style={{ marginTop: 12 }}>
          Go back
        </Button>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle={dark ? "light-content" : "dark-content"} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderColor: colors.outline }]}>
        <Pressable onPress={() => router.back()} style={styles.backRow}>
          <Ionicons name="arrow-back" size={18} color={colors.onSurface} />
          <Text variant="labelLarge" style={{ color: colors.onSurface }}>
            Back
          </Text>
        </Pressable>

        <View style={styles.headerRow}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text variant="headlineSmall" style={{ color: colors.onSurface }}>
              Set Analytics
            </Text>
            <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>
              {(label as string) ?? "Bench Press"} {"\u2022"} {formatDateOnly(created_at)}
            </Text>

            <Text variant="labelSmall" style={{ marginTop: 6, color: colors.onSurfaceVariant }}>
              Loaded{" "}
              <Text style={{ color: colors.onSurface, fontWeight: "800" }}>{samples.length}</Text>{" "}
              merged rows {"\u2022"} EMG{" "}
              <Text style={{ color: colors.onSurface, fontWeight: "800" }}>{emgSeries.length}</Text>{" "}
              {"\u2022"} IMU{" "}
              <Text style={{ color: colors.onSurface, fontWeight: "800" }}>{imuReferenceAxis.length}</Text>
            </Text>
          </View>

          <View style={[styles.badge, { backgroundColor: colors.success }]}>
            <Text style={styles.badgeText}>Completed</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 }}>
        {/* Overview Cards */}
        <View style={styles.statsGrid}>
          <StatCard title="Duration" value={duration} />
          <StatCard title="Channel" value={emgChannelLabel} />
          <StatCard title="Avg EMG" value={avgEmg.toFixed(2)} unit={mvcValue > 0 ? "%" : ""} />
          <StatCard title="Peak EMG" value={maxEmg.toFixed(2)} unit={mvcValue > 0 ? "%" : ""} />
        </View>

        {/* Chart type selector */}
        <Card style={styles.segment} mode="outlined">
          <Card.Content style={styles.segmentContent}>
            {metricOptions.map((opt) => {
              const active = metric === opt.key;
              return (
                <Button
                  key={opt.key}
                  mode={active ? "contained" : "outlined"}
                  onPress={() => setMetric(opt.key)}
                  compact
                  style={{ flex: 1 }}
                  buttonColor={active ? colors.primary : undefined}
                  textColor={active ? "#fff" : colors.onSurface}
                >
                  {opt.label}
                </Button>
              );
            })}
          </Card.Content>
        </Card>

        {/* EMG channel selector */}
        {metric === "force" && (
          <Card style={styles.segment} mode="outlined">
            <Card.Content style={styles.segmentContent}>
              {EMG_CHANNELS.map((ch) => {
                const active = selectedEmgChannel === ch.key;
                return (
                  <Button
                    key={ch.key}
                    mode={active ? "contained" : "outlined"}
                    onPress={() => setSelectedEmgChannel(ch.key)}
                    compact
                    style={{ flex: 1 }}
                    buttonColor={active ? colors.primary : undefined}
                    textColor={active ? "#fff" : colors.onSurface}
                    labelStyle={{ fontSize: 11 }}
                  >
                    {ch.label}
                  </Button>
                );
              })}
            </Card.Content>
          </Card>
        )}

        {/* IMU side selector */}
        {metric === "imu" && (
          <Card style={styles.segment} mode="outlined">
            <Card.Content style={styles.segmentContent}>
              {([["left", "Left IMU"], ["right", "Right IMU"]] as const).map(([side, lbl]) => {
                const active = selectedImuSide === side;
                return (
                  <Button
                    key={side}
                    mode={active ? "contained" : "outlined"}
                    onPress={() => setSelectedImuSide(side)}
                    compact
                    style={{ flex: 1 }}
                    buttonColor={active ? colors.primary : undefined}
                    textColor={active ? "#fff" : colors.onSurface}
                  >
                    {lbl}
                  </Button>
                );
              })}
            </Card.Content>
          </Card>
        )}

        {/* EMG Chart */}
        {metric === "force" && emgSelectedSeries.length >= 2 && (
          <Card style={styles.chartCard} mode="outlined">
            <Card.Content>
              <Text variant="titleSmall" style={{ marginBottom: 10 }}>
                {emgTitle}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator
                indicatorStyle={dark ? "white" : "black"}
                contentContainerStyle={{ paddingBottom: 6 }}
              >
                <View style={{ marginTop: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View style={{ width: 18, alignItems: "center", marginRight: 8 }}>
                      <Text
                        style={{
                          color: colors.onSurfaceVariant,
                          fontSize: 12,
                          transform: [{ rotate: "-90deg" }],
                          width: 220,
                          textAlign: "center",
                        }}
                      >
                        {mvcValue > 0 ? "% MVC" : "EMG (a.u.)"}
                      </Text>
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator
                      indicatorStyle={dark ? "white" : "black"}
                    >
                      <LineChart
                        data={{
                          labels: emgChartLabels,
                          datasets: [
                            { data: emgSelectedSeries as any },
                            { data: [100], withDots: false, color: () => "transparent" },
                          ],
                        }}
                        width={emgChartWidth}
                        height={220}
                        withDots={false}
                        withShadow={false}
                        withInnerLines
                        withOuterLines={false}
                        fromZero
                        segments={5}
                        yAxisSuffix={mvcValue > 0 ? "%" : ""}
                        chartConfig={{ ...chartConfig, paddingRight: 12 }}
                        style={{ borderRadius: 12 }}
                      />
                    </ScrollView>
                  </View>
                  <Text
                    variant="labelSmall"
                    style={{ marginTop: 10, color: colors.onSurfaceVariant, textAlign: "center" }}
                  >
                    Time (s)
                  </Text>
                </View>
              </ScrollView>
            </Card.Content>
          </Card>
        )}

        {/* IMU Chart – roll / pitch / yaw overlay */}
        {metric === "imu" && imuDatasets && (
          <Card style={styles.chartCard} mode="outlined">
            <Card.Content>
              <Text variant="titleSmall" style={{ marginBottom: 4 }}>
                {imuTitle}
              </Text>

              <View style={styles.imuLegend}>
                {IMU_AXES.map((a) => (
                  <View key={a.axis} style={styles.imuLegendItem}>
                    <View style={[styles.imuLegendDot, { backgroundColor: a.color }]} />
                    <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant }}>{a.label}</Text>
                  </View>
                ))}
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator
                indicatorStyle={dark ? "white" : "black"}
                contentContainerStyle={{ paddingBottom: 6 }}
              >
                <View style={{ marginTop: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View style={{ width: 18, alignItems: "center", marginRight: 8 }}>
                      <Text
                        style={{
                          color: colors.onSurfaceVariant,
                          fontSize: 12,
                          transform: [{ rotate: "-90deg" }],
                          width: 220,
                          textAlign: "center",
                        }}
                      >
                        Degrees
                      </Text>
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator
                      indicatorStyle={dark ? "white" : "black"}
                    >
                      <LineChart
                        data={imuDatasets}
                        width={imuChartWidth}
                        height={220}
                        withDots={false}
                        withShadow={false}
                        withInnerLines
                        withOuterLines={false}
                        chartConfig={{ ...chartConfig, paddingRight: 12 }}
                        style={{ borderRadius: 12 }}
                      />
                    </ScrollView>
                  </View>
                  <Text
                    variant="labelSmall"
                    style={{ marginTop: 10, color: colors.onSurfaceVariant, textAlign: "center" }}
                  >
                    Time (s)
                  </Text>
                </View>
              </ScrollView>
            </Card.Content>
          </Card>
        )}

        {/* Consistency */}
        <Card style={styles.consistencyCard}>
          <Card.Content>
            <Text style={styles.consistencyTitle}>
              {"\u26A1"} Consistency Score
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
              <View>
                <Text style={styles.consistencyValue}>{consistency}%</Text>
                <Text style={styles.consistencyLabel}>{consistencyLabel}</Text>
              </View>
              <Text style={styles.consistencySideText}>
                {emgChannelLabel} signal{"\n"}stability (CV)
              </Text>
            </View>
          </Card.Content>
        </Card>

        {/* Insights */}
        <Card
          style={[styles.insightCard, { borderColor: dark ? "#1d4ed8" : "#bfdbfe" }]}
          mode="outlined"
        >
          <Card.Content>
            <Text variant="titleSmall" style={{ marginBottom: 10 }}>
              {"\uD83D\uDCA1"} Performance Insights
            </Text>
            <Insight
              index={1}
              text="Your force output varied significantly. Focus on maintaining consistent form and tempo throughout the set."
            />
            <Insight
              index={2}
              text="If this set felt difficult, consider adding more rest time before your next set."
            />
            <Insight
              index={3}
              text="Prioritize technique first. Then scale load once your movement pattern stays stable."
            />
          </Card.Content>
        </Card>

        {/* Next Steps */}
        <Card
          style={[
            styles.nextCard,
            {
              backgroundColor: dark ? "#0b2b1a" : "#ecfdf5",
              borderColor: dark ? "#14532d" : "#bbf7d0",
            },
          ]}
          mode="outlined"
        >
          <Card.Content>
            <Text variant="titleSmall" style={{ color: dark ? "#d1fae5" : "#065f46", marginBottom: 8 }}>
              Next Steps
            </Text>
            <Bullet text="Rest 2\u20133 minutes before your next set if your goal is strength." color={dark ? "#d1fae5" : "#064e3b"} />
            <Bullet text="Keep a consistent tempo for cleaner comparisons across sets." color={dark ? "#d1fae5" : "#064e3b"} />
            <Bullet text="If you see major force drops, reduce load slightly or increase rest." color={dark ? "#d1fae5" : "#064e3b"} />
          </Card.Content>
        </Card>

      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({
  title,
  value,
  unit,
}: {
  title: string;
  value: string;
  unit?: string;
}) {
  const { colors } = useAppTheme();
  return (
    <Card style={styles.statCard} mode="outlined">
      <Card.Content>
        <Text variant="labelMedium" style={{ color: colors.onSurfaceVariant }}>
          {title}
        </Text>
        <Text variant="titleLarge" style={{ color: colors.onSurface, fontWeight: "800", marginTop: 6 }}>
          {value}
          {unit ? (
            <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant }}>
              {" "}
              {unit}
            </Text>
          ) : null}
        </Text>
      </Card.Content>
    </Card>
  );
}

function Insight({ index, text }: { index: number; text: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.insightRow}>
      <View style={styles.insightIndex}>
        <Text style={styles.insightIndexText}>{index}</Text>
      </View>
      <Text variant="bodySmall" style={{ flex: 1, color: colors.onSurface, lineHeight: 18 }}>
        {text}
      </Text>
    </View>
  );
}

function Bullet({ text, color }: { text: string; color: string }) {
  return (
    <View style={{ flexDirection: "row", marginTop: 8 }}>
      <Text style={{ marginRight: 8, color }}>{"\u2022"}</Text>
      <Text style={{ flex: 1, color, fontSize: 13 }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16 },
  header: { paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerRow: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  statCard: { borderRadius: 12, width: "48%" },
  segment: { marginTop: 16, borderRadius: 12 },
  segmentContent: { flexDirection: "row", gap: 6 },
  chartCard: { borderRadius: 12, marginTop: 16, overflow: "hidden" },
  consistencyCard: {
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: "#9333ea",
  },
  consistencyTitle: { color: "#fff", fontSize: 14, fontWeight: "700" },
  consistencyValue: { color: "#fff", fontSize: 44, fontWeight: "900", marginTop: 8 },
  consistencyLabel: { color: "#e9d5ff", fontSize: 12, marginTop: 2, fontWeight: "700" },
  consistencySideText: { color: "#e9d5ff", fontSize: 12, textAlign: "right" },
  insightCard: { borderRadius: 12, marginTop: 16 },
  insightRow: { flexDirection: "row", alignItems: "flex-start", marginTop: 10 },
  insightIndex: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    marginTop: 2,
  },
  insightIndexText: { color: "#1d4ed8", fontSize: 12, fontWeight: "800" },
  nextCard: { borderRadius: 12, marginTop: 16 },
  imuLegend: { flexDirection: "row", gap: 12, marginBottom: 4 },
  imuLegendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  imuLegendDot: { width: 10, height: 10, borderRadius: 5 },
});
