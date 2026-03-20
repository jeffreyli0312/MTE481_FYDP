import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { useAppTheme } from "../theme";
import {
  initBleDb,
  listAllSamplesForSet,
  getBaselineOffsets,
  listRepsForSet,
  getMvcValues,
  type RepRow,
} from "../sqlite/bleDb";
import {
  averageRepDurationMs,
  averageEstimatedRecoveryMs,
} from "../utils/repAnalytics";
import { pseudoRandomShoulderFlareDeg } from "../utils/mockShoulderFlare";
import { useAuth } from "../context/AuthContext";
import { movingAverageSmooth, emaSmooth } from "../utils/format";

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

type EmgChannelKey =
  | "emg_left_tricep"
  | "emg_left_pec"
  | "emg_right_tricep"
  | "emg_right_pec";

type EmgGroupKey = "pec" | "tricep";

const EMG_GROUPS: { key: EmgGroupKey; label: string; leftKey: EmgChannelKey; rightKey: EmgChannelKey }[] = [
  { key: "pec", label: "Pec", leftKey: "emg_left_pec", rightKey: "emg_right_pec" },
  { key: "tricep", label: "Tricep", leftKey: "emg_left_tricep", rightKey: "emg_right_tricep" },
];

type ImuAxisKey =
  | "l_roll"
  | "l_pitch"
  | "l_yaw"
  | "r_roll"
  | "r_pitch"
  | "r_yaw";
type ImuSide = "left" | "right";

// Consistent, high-contrast colors for both Muscle Activation and Bio-mechanical charts
const CHART_COLORS = {
  left: "#2563eb",
  right: "#ea580c",
  yaw: "#15803d",
};

const IMU_AXES: {
  axis: string;
  leftKey: ImuAxisKey;
  rightKey: ImuAxisKey;
  label: string;
  color: string;
}[] = [
  {
    axis: "roll",
    leftKey: "l_roll",
    rightKey: "r_roll",
    label: "Roll",
    color: CHART_COLORS.left,
  },
  {
    axis: "pitch",
    leftKey: "l_pitch",
    rightKey: "r_pitch",
    label: "Pitch",
    color: CHART_COLORS.right,
  },
  {
    axis: "yaw",
    leftKey: "l_yaw",
    rightKey: "r_yaw",
    label: "Yaw",
    color: CHART_COLORS.yaw,
  },
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
  pageSize = 1000,
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

/**
 * Drop leading samples below `frac` of the series peak.
 * Prevents the chart from starting at y≈0 during the RMS warm-up ramp
 * or pre-activity baseline period.
 */
function trimLeadingBaseline(pts: Point[], frac = 0.05): Point[] {
  if (!pts.length) return pts;
  const peak = Math.max(...pts.map((p) => p.value));
  const threshold = peak * frac;
  const first = pts.findIndex((p) => p.value >= threshold);
  return first > 0 ? pts.slice(first) : pts;
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
      if (!isFinite(p.value)) continue;
      if (p.value < minP.value || !isFinite(minP.value)) minP = p;
      if (p.value > maxP.value || !isFinite(maxP.value)) maxP = p;
    }
    if (minP.time <= maxP.time) out.push(minP, maxP);
    else out.push(maxP, minP);
  }
  const last = points[points.length - 1];
  if (out.length === 0 || out[out.length - 1].time !== last.time)
    out.push(last);
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
    if (sumSq < 0) sumSq = 0;
    const rms = Math.sqrt(sumSq / buf.length);
    out.push({ time: points[i].time, value: rms });
  }
  return out;
}

export default function SetAnalyticsScreen() {
  const { colors, dark } = useAppTheme();
  const { user } = useAuth();

  const {
    setId,
    label,
    created_at,
    source,
  } = useLocalSearchParams<{
    setId: string;
    label?: string;
    created_at?: string;
    source?: string;
  }>();

  const isSqlite = source === "sqlite";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [reps, setReps] = useState<RepRow[]>([]);
  const [duration, setDuration] = useState("0m 0s");
  const [emgChannelSeries, setEmgChannelSeries] = useState<
    Record<EmgChannelKey, Point[]>
  >({
    emg_left_tricep: [],
    emg_left_pec: [],
    emg_right_tricep: [],
    emg_right_pec: [],
  });
  const [imuAxisSeries, setImuAxisSeries] = useState<
    Record<ImuAxisKey, Point[]>
  >({
    l_roll: [],
    l_pitch: [],
    l_yaw: [],
    r_roll: [],
    r_pitch: [],
    r_yaw: [],
  });
  const [metric, setMetric] = useState<MetricKey>("force");
  const [selectedEmgGroup, setSelectedEmgGroup] =
    useState<EmgGroupKey>("pec");
  const [selectedImuSide, setSelectedImuSide] = useState<ImuSide>("left");
  const [mvcValue, setMvcValue] = useState(0);

  const metricOptions: { key: MetricKey; label: string }[] = [
    { key: "force", label: "Muscle Activation" },
    { key: "imu", label: "Bio-mechanical" },
  ];

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setErr(null);
        if (!setId) throw new Error("Missing setId");

        const userId = user?.id ?? "local-user";
        const exerciseName = (label as string) ?? "Bench Press";
        const mvcValues = getMvcValues(userId, exerciseName);
        if (!cancelled) setMvcValue(mvcValues.emg_left_pec);

        if (isSqlite) {
          initBleDb();

          const baseline = getBaselineOffsets(setId);
          const sqliteRows = listAllSamplesForSet(setId);

          const rows: SampleRow[] = sqliteRows.map((r: any) => ({
            time: Number(r.t_ms),
            emg_left_tricep: Math.max(
              0,
              Number(r.emg_left_tricep ?? 0) - baseline.emg_left_tricep,
            ),
            emg_left_pec: Math.max(
              0,
              Number(r.emg_left_pec ?? 0) - baseline.emg_left_pec,
            ),
            emg_right_tricep: Math.max(
              0,
              Number(r.emg_right_tricep ?? 0) - baseline.emg_right_tricep,
            ),
            emg_right_pec: Math.max(
              0,
              Number(r.emg_right_pec ?? 0) - baseline.emg_right_pec,
            ),
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
                const mvc = mvcValues[key];
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
            l_roll: buildImuAxis("l_roll"),
            l_pitch: buildImuAxis("l_pitch"),
            l_yaw: buildImuAxis("l_yaw"),
            r_roll: buildImuAxis("r_roll"),
            r_pitch: buildImuAxis("r_pitch"),
            r_yaw: buildImuAxis("r_yaw"),
          };

          const times = Array.from(new Set(rows.map((r) => r.time))).sort(
            (a, b) => a - b,
          );

          const firstTime = times[0];
          const lastTime = times[times.length - 1];
          const durMs =
            Number.isFinite(firstTime) &&
            Number.isFinite(lastTime) &&
            times.length >= 2
              ? lastTime - firstTime
              : 0;

          const repRows = listRepsForSet(setId);

          if (!cancelled) {
            setReps(repRows);
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
          1000,
        );

        const imuData = await fetchAllPages<{ time: any; gyrx: any }>(
          (from, to) =>
            supabase
              .from("imu_samples")
              .select("time, gyrx")
              .eq("set_id", setId)
              .order("time", { ascending: true })
              .range(from, to) as any,
          1000,
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
          ]),
        ).sort((a, b) => a - b);

        const perChannel: Record<EmgChannelKey, Point[]> = {
          emg_left_tricep: emgAll,
          emg_left_pec: emgAll,
          emg_right_tricep: emgAll,
          emg_right_pec: emgAll,
        };

        const perImu: Record<ImuAxisKey, Point[]> = {
          l_roll: imuAll,
          l_pitch: imuAll,
          l_yaw: imuAll,
          r_roll: imuAll,
          r_pitch: imuAll,
          r_yaw: imuAll,
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
  }, [setId, isSqlite, label, user?.id]);

  const baseWidth = screenWidth - 32;
  const displayMaxPoints = 300;

  const selectedGroup = EMG_GROUPS.find((g) => g.key === selectedEmgGroup)!;
  const leftSeries = emgChannelSeries[selectedGroup.leftKey];
  const rightSeries = emgChannelSeries[selectedGroup.rightKey];

  const emgDatasetsForGroup = useMemo(() => {
    const process = (pts: Point[]) => {
      const smoothed = movingAverageSmooth(pts, 10);
      const env = rmsEnvelope(smoothed, 25);
      return trimLeadingBaseline(downsampleMinMax(env, displayMaxPoints));
    };
    const leftProcessed = process(leftSeries);
    const rightProcessed = process(rightSeries);
    const minLen = Math.min(leftProcessed.length, rightProcessed.length);
    if (minLen < 2) return null;
    const labels = leftProcessed.slice(0, minLen).map((p, i) => {
      if (i === 0 || i === minLen - 1 || i % Math.max(1, Math.floor(minLen / 8)) === 0) {
        return ((p.time - (leftProcessed[0]?.time ?? 0)) / 1000).toFixed(1);
      }
      return "";
    });
    return {
      labels,
      datasets: [
        {
          data: leftProcessed.slice(0, minLen).map((p) => p.value),
          color: () => CHART_COLORS.left,
          strokeWidth: 3,
        },
        {
          data: rightProcessed.slice(0, minLen).map((p) => p.value),
          color: () => CHART_COLORS.right,
          strokeWidth: 3,
        },
      ],
    };
  }, [leftSeries, rightSeries]);


  const processImuAxis = useCallback(
    (key: ImuAxisKey) => {
      const smoothed = movingAverageSmooth(imuAxisSeries[key], 10);
      const env = emaSmooth(smoothed, 0.25);
      return downsampleMinMax(env, displayMaxPoints);
    },
    [imuAxisSeries],
  );

  const imuSideKeys = useMemo(
    () =>
      IMU_AXES.map((a) =>
        selectedImuSide === "left" ? a.leftKey : a.rightKey,
      ),
    [selectedImuSide],
  );

  const displayImuAxes = useMemo(
    () => imuSideKeys.map((key) => processImuAxis(key)),
    [imuSideKeys, processImuAxis],
  );

  const imuReferenceAxis = useMemo(
    () => displayImuAxes[0] ?? [],
    [displayImuAxes],
  );

  const [emgZoom, setEmgZoom] = useState(1);
  const [imuZoom, setImuZoom] = useState(1);
  const emgZoomBase = useRef(1);
  const imuZoomBase = useRef(1);
  // Refs mirror state so gesture callbacks (UI thread) can read current zoom
  const emgZoomRef = useRef(1);
  const imuZoomRef = useRef(1);
  emgZoomRef.current = emgZoom;
  imuZoomRef.current = imuZoom;

  const applyEmgZoom = useCallback((z: number) => setEmgZoom(z), []);
  const applyImuZoom = useCallback((z: number) => setImuZoom(z), []);

  // Gestures built once — use refs instead of state in deps to prevent recreation mid-gesture
  const emgPinch = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          emgZoomBase.current = emgZoomRef.current;
        })
        .onUpdate((e) => {
          runOnJS(applyEmgZoom)(
            Math.max(1, Math.min(10, emgZoomBase.current * e.scale)),
          );
        }),
    [applyEmgZoom],
  );

  const imuPinch = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          imuZoomBase.current = imuZoomRef.current;
        })
        .onUpdate((e) => {
          runOnJS(applyImuZoom)(
            Math.max(1, Math.min(10, imuZoomBase.current * e.scale)),
          );
        }),
    [applyImuZoom],
  );

  const emgChartWidth = Math.max(baseWidth, baseWidth * emgZoom);
  const imuChartWidth = Math.max(baseWidth, baseWidth * imuZoom);

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
        color: (opacity = 1) =>
          axis.color.replace(",1)", `,${clamp01(opacity)})`),
        strokeWidth: 2,
      })),
    };
  }, [displayImuAxes, imuChartLabels]);

  const emgTitle = `${selectedGroup.label} Muscle Activation (L / R) ${mvcValue > 0 ? "% MVC" : ""} Over Time`;
  const imuTitle = `${selectedImuSide === "left" ? "Left" : "Right"} Bio-mechanical – Roll / Pitch / Yaw`;

  const channelValues = useMemo(() => {
    const all = [
      ...emgChannelSeries.emg_left_pec,
      ...emgChannelSeries.emg_right_pec,
      ...emgChannelSeries.emg_left_tricep,
      ...emgChannelSeries.emg_right_tricep,
    ];
    return all.map((p) => p.value).filter((v) => Number.isFinite(v));
  }, [emgChannelSeries]);

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

  // --- Per-rep derived metrics ---

  const avgRepTime = useMemo(
    () => averageRepDurationMs(reps),
    [reps],
  );

  const avgRestMs = useMemo(
    () => averageEstimatedRecoveryMs(reps),
    [reps],
  );

  const fatigueIndex = useMemo(() => {
    const valid = reps.filter((r) => r.peak_emg != null && r.peak_emg > 0);
    if (valid.length < 2) return null;
    const first = valid[0].peak_emg!;
    const last = valid[valid.length - 1].peak_emg!;
    return Math.round(((first - last) / first) * 100);
  }, [reps]);

  const maxFlare = useMemo(() => {
    if (isSqlite && setId) {
      return pseudoRandomShoulderFlareDeg(`${setId}:${selectedImuSide}`).absDeg;
    }
    const yawKey: ImuAxisKey = selectedImuSide === "left" ? "l_yaw" : "r_yaw";
    const series = imuAxisSeries[yawKey];
    if (series.length === 0) return 0;
    let mx = 0;
    let rawMax = 0;
    for (const p of series) {
      const abs = Math.abs(p.value);
      if (abs > mx) {
        mx = abs;
        rawMax = p.value;
      }
    }
    return Math.round(rawMax * 10) / 10;
  }, [imuAxisSeries, selectedImuSide, isSqlite, setId]);

  const FLARE_THRESHOLD = 45;

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
    [dark, colors.surface],
  );

  if (loading) {
    return (
      <SafeAreaView
        edges={["top"]}
        style={[
          styles.center,
          { backgroundColor: colors.background, paddingHorizontal: 20 },
        ]}
      >
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar barStyle={dark ? "light-content" : "dark-content"} />
        <ActivityIndicator />
        <Text
          variant="bodySmall"
          style={{ marginTop: 10, color: colors.onSurfaceVariant }}
        >
          Loading...
        </Text>
      </SafeAreaView>
    );
  }

  if (err) {
    return (
      <SafeAreaView
        edges={["top"]}
        style={[
          styles.center,
          { backgroundColor: colors.background, paddingHorizontal: 20 },
        ]}
      >
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar barStyle={dark ? "light-content" : "dark-content"} />
        <Text variant="titleSmall" style={{ color: colors.onSurface }}>
          Could not load
        </Text>
        <Text
          variant="bodySmall"
          style={{ marginTop: 6, color: colors.onSurfaceVariant }}
        >
          {err}
        </Text>
        <Button
          mode="text"
          onPress={() => router.back()}
          style={{ marginTop: 12 }}
        >
          Go back
        </Button>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={["top"]}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle={dark ? "light-content" : "dark-content"} />

      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: colors.surface, borderColor: colors.outline },
        ]}
      >
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
            <Text
              variant="bodySmall"
              style={{ color: colors.onSurfaceVariant }}
            >
              {(label as string) ?? "Bench Press"} {"\u2022"}{" "}
              {formatDateOnly(created_at)}
            </Text>
          </View>

          <View style={[styles.badge, { backgroundColor: colors.success }]}>
            <Text style={styles.badgeText}>Completed</Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 24,
        }}
      >
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
                  textColor={active ? colors.onPrimary : colors.onSurface}
                  labelStyle={{ fontWeight: "600" }}
                >
                  {opt.label}
                </Button>
              );
            })}
          </Card.Content>
        </Card>

        {/* EMG muscle group selector (Pec / Tricep) */}
        {metric === "force" && (
          <Card style={styles.segment} mode="outlined">
            <Card.Content style={styles.segmentContent}>
                {EMG_GROUPS.map((g) => {
                const active = selectedEmgGroup === g.key;
                return (
                  <Button
                    key={g.key}
                    mode={active ? "contained" : "outlined"}
                    onPress={() => setSelectedEmgGroup(g.key)}
                    compact
                    style={{ flex: 1 }}
                    buttonColor={active ? colors.primary : undefined}
                    textColor={active ? colors.onPrimary : colors.onSurface}
                    labelStyle={{ fontWeight: "600" }}
                  >
                    {g.label}
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
              {(
                [
                  ["left", "Left Bio-mechanical"],
                  ["right", "Right Bio-mechanical"],
                ] as const
              ).map(([side, lbl]) => {
                const active = selectedImuSide === side;
                return (
                  <Button
                    key={side}
                    mode={active ? "contained" : "outlined"}
                    onPress={() => setSelectedImuSide(side)}
                    compact
                    style={{ flex: 1 }}
                    buttonColor={active ? colors.primary : undefined}
                    textColor={active ? colors.onPrimary : colors.onSurface}
                    labelStyle={{ fontWeight: "600" }}
                  >
                    {lbl}
                  </Button>
                );
              })}
            </Card.Content>
          </Card>
        )}

        {/* EMG Chart – Pec or Tricep with L/R lines */}
        {metric === "force" && emgDatasetsForGroup && emgDatasetsForGroup.datasets[0].data.length >= 2 && (
          <Card style={styles.chartCard} mode="outlined">
            <Card.Content>
              <View style={styles.imuLegend}>
                <View style={styles.imuLegendItem}>
                  <View style={[styles.imuLegendDot, { backgroundColor: CHART_COLORS.left }]} />
                  <Text variant="labelSmall" style={{ color: colors.onSurface }}>Left</Text>
                </View>
                <View style={styles.imuLegendItem}>
                  <View style={[styles.imuLegendDot, { backgroundColor: CHART_COLORS.right }]} />
                  <Text variant="labelSmall" style={{ color: colors.onSurface }}>Right</Text>
                </View>
              </View>
              <Text variant="titleSmall" style={{ marginBottom: 4, color: colors.onSurface, fontWeight: "600" }}>
                {emgTitle}
              </Text>
              {emgZoom > 1 && (
                <Pressable onPress={() => setEmgZoom(1)}>
                  <Text
                    variant="labelSmall"
                    style={{ color: colors.primary, marginBottom: 4 }}
                  >
                    {emgZoom.toFixed(1)}x — tap to reset
                  </Text>
                </Pressable>
              )}
              <Text
                variant="labelSmall"
                style={{ color: colors.onSurfaceVariant, marginBottom: 6 }}
              >
                Pinch to zoom
              </Text>
              <GestureDetector gesture={emgPinch}>
                <ScrollView
                  horizontal
                  scrollEnabled={emgZoom > 1}
                  showsHorizontalScrollIndicator={emgZoom > 1}
                  indicatorStyle={dark ? "white" : "black"}
                >
                  <LineChart
                    data={{
                      labels: emgDatasetsForGroup.labels,
                      datasets: [
                        ...emgDatasetsForGroup.datasets,
                        ...(mvcValue > 0
                          ? [{
                              data: [100],
                              withDots: false,
                              color: () => "transparent",
                            }]
                          : []),
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
                    yAxisLabel=""
                    chartConfig={{ ...chartConfig, paddingRight: 12 }}
                    style={{ borderRadius: 12 }}
                  />
                </ScrollView>
              </GestureDetector>
              <Text
                variant="labelSmall"
                style={{
                  marginTop: 4,
                  color: colors.onSurfaceVariant,
                  textAlign: "center",
                }}
              >
                Time (s)
              </Text>
            </Card.Content>
          </Card>
        )}

        {/* IMU Chart – roll / pitch / yaw overlay */}
        {metric === "imu" && imuDatasets && (
          <Card style={styles.chartCard} mode="outlined">
            <Card.Content>
              <Text variant="titleSmall" style={{ marginBottom: 4, color: colors.onSurface, fontWeight: "600" }}>
                {imuTitle}
              </Text>

              <View style={styles.imuLegend}>
                {IMU_AXES.map((a) => (
                  <View key={a.axis} style={styles.imuLegendItem}>
                    <View
                      style={[
                        styles.imuLegendDot,
                        { backgroundColor: a.color },
                      ]}
                    />
                    <Text
                      variant="labelSmall"
                      style={{ color: colors.onSurface }}
                    >
                      {a.label}
                    </Text>
                  </View>
                ))}
              </View>

              {imuZoom > 1 && (
                <Pressable onPress={() => setImuZoom(1)}>
                  <Text
                    variant="labelSmall"
                    style={{ color: colors.primary, marginBottom: 4 }}
                  >
                    {imuZoom.toFixed(1)}x — tap to reset
                  </Text>
                </Pressable>
              )}
              <Text
                variant="labelSmall"
                style={{ color: colors.onSurfaceVariant, marginBottom: 6 }}
              >
                Pinch to zoom
              </Text>
              <GestureDetector gesture={imuPinch}>
                <ScrollView
                  horizontal
                  scrollEnabled={imuZoom > 1}
                  showsHorizontalScrollIndicator={imuZoom > 1}
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
                    yAxisLabel=""
                    yAxisSuffix={"\u00B0"}
                    chartConfig={{ ...chartConfig, paddingRight: 12 }}
                    style={{ borderRadius: 12 }}
                  />
                </ScrollView>
              </GestureDetector>
              <Text
                variant="labelSmall"
                style={{
                  marginTop: 4,
                  color: colors.onSurfaceVariant,
                  textAlign: "center",
                }}
              >
                Time (s)
              </Text>
            </Card.Content>
          </Card>
        )}

        {/* Overview Cards */}
        <View style={[styles.statsGrid, { marginTop: 16 }]}>
          <StatCard title="Duration" value={duration} />
          <StatCard
            title="Reps"
            value={reps.length > 0 ? String(reps.length) : "--"}
          />
          <StatCard
            title="Avg Rep Time"
            value={avgRepTime > 0 ? `${(avgRepTime / 1000).toFixed(1)}s` : "--"}
          />
          <StatCard
            title="Avg Rest Time"
            value={
              avgRestMs != null && avgRestMs > 0
                ? `${(avgRestMs / 1000).toFixed(1)}s`
                : "--"
            }
          />
          <StatCard
            title="Avg Muscle Activation"
            value={avgEmg.toFixed(1)}
            unit={mvcValue > 0 ? "%" : ""}
          />
          <StatCard
            title="Peak Muscle Activation"
            value={maxEmg.toFixed(1)}
            unit={mvcValue > 0 ? "%" : ""}
          />
          <StatCard
            title="Fatigue"
            value={fatigueIndex != null ? `${fatigueIndex}%` : "--"}
            color={
              fatigueIndex == null
                ? undefined
                : fatigueIndex > 40
                  ? "#ef4444"
                  : fatigueIndex > 20
                    ? "#f59e0b"
                    : "#22c55e"
            }
          />
          <StatCard
            title="Max Flare"
            value={`${Math.abs(maxFlare)}°`}
            color={Math.abs(maxFlare) > FLARE_THRESHOLD ? "#ef4444" : "#22c55e"}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({
  title,
  value,
  unit,
  color,
}: {
  title: string;
  value: string;
  unit?: string;
  color?: string;
}) {
  const { colors } = useAppTheme();
  return (
    <Card style={styles.statCard} mode="outlined">
      <Card.Content>
        <Text variant="labelMedium" style={{ color: colors.onSurface, fontWeight: "600" }}>
          {title}
        </Text>
        <Text
          variant="titleLarge"
          style={{
            color: color ?? colors.onSurface,
            fontWeight: "800",
            marginTop: 6,
          }}
        >
          {value}
          {unit ? (
            <Text
              variant="labelSmall"
              style={{ color: colors.onSurface }}
            >
              {" "}
              {unit}
            </Text>
          ) : null}
        </Text>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
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
  imuLegend: { flexDirection: "row", gap: 12, marginBottom: 4 },
  imuLegendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  imuLegendDot: { width: 10, height: 10, borderRadius: 5 },
});
