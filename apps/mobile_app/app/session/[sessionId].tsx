import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  StatusBar,
  Dimensions,
} from "react-native";
import { Card, Text, ActivityIndicator } from "react-native-paper";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LineChart } from "react-native-chart-kit";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import { useSharedValue, runOnJS } from "react-native-reanimated";
import { supabase } from "../../lib/supabase";
import { useAppTheme } from "../theme";

import {
  initBleDb,
  listSets as listSqliteSets,
  listSamplesForSet,
} from "../sqlite/bleDb";

const screenWidth = Dimensions.get("window").width;
const CHART_POINTS = 120;

const LINE_COLORS: ((o: number) => string)[] = [
  (o) => `rgba(59,130,246,${o})`,
  (o) => `rgba(249,115,22,${o})`,
  (o) => `rgba(34,197,94,${o})`,
  (o) => `rgba(168,85,247,${o})`,
  (o) => `rgba(239,68,68,${o})`,
  (o) => `rgba(20,184,166,${o})`,
  (o) => `rgba(234,179,8,${o})`,
  (o) => `rgba(236,72,153,${o})`,
];

function resample(pts: { t: number; v: number }[], n: number, maxT: number): number[] {
  if (pts.length === 0) return new Array(n).fill(0);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * maxT;
    if (t <= pts[0].t) { out.push(pts[0].v); continue; }
    if (t >= pts[pts.length - 1].t) { out.push(pts[pts.length - 1].v); continue; }
    let lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid].t <= t) lo = mid; else hi = mid; }
    const r = (t - pts[lo].t) / (pts[hi].t - pts[lo].t + 1e-9);
    out.push(pts[lo].v + r * (pts[hi].v - pts[lo].v));
  }
  return out;
}

type SupabaseSetRow = {
  id: string;
  session_id: string;
  created_at: string;
  label?: string | null;
};

type LocalSetRow = {
  id: string;
  session_id: string;
  started_at?: number | null;
  label?: string | null;
};

type DisplaySetRow = {
  id: string;
  session_id: string;
  created_at_text: string;
  label?: string | null;
};

function formatDateOnly(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateFromMs(ms?: number | null) {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDurationFromMs(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return "\u2014";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s}s`;
}

export default function SessionSetsScreen() {
  const { colors, dark } = useAppTheme();

  const { sessionId, source, title } = useLocalSearchParams<{
    sessionId: string;
    source?: string;
    title?: string;
  }>();

  const isSqlite = source === "sqlite";

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrMsg] = useState<string | null>(null);

  const [sets, setSets] = useState<DisplaySetRow[]>([]);
  const [setDuration, setSetDuration] = useState<Record<string, string>>({});

  // ── Graph state (SQLite only) ────────────────────────────────────────────
  type SetLine = { label: string; data: number[] };
  const [setLines, setSetLines] = useState<SetLine[]>([]);
  const [maxDurationMs, setMaxDurationMs] = useState(0);
  // IMU: one SetLine per gyro axis (gyrx, gyry, gyrz), each set averaged
  const [imuLines, setImuLines] = useState<{ gyrx: SetLine[]; gyry: SetLine[]; gyrz: SetLine[] }>(
    { gyrx: [], gyry: [], gyrz: [] }
  );
  const [imuMaxDurationMs, setImuMaxDurationMs] = useState(0);
  // ────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function loadSets() {
      setLoading(true);
      setErrMsg(null);

      try {
        if (!sessionId) throw new Error("Missing sessionId");

        if (isSqlite) {
          initBleDb();

          const sqliteSets = listSqliteSets(sessionId) as LocalSetRow[];

          const mappedSets: DisplaySetRow[] = sqliteSets.map((st) => ({
            id: st.id,
            session_id: st.session_id,
            created_at_text: formatDateFromMs(st.started_at ?? null),
            label: st.label ?? null,
          }));

          const nextDur: Record<string, string> = {};

          for (const st of sqliteSets) {
            const samples = listSamplesForSet(st.id, 1000);

            if (samples.length === 0) {
              nextDur[st.id] = "\u2014";
              continue;
            }

            let minReceivedAt: number | null = null;
            let maxReceivedAt: number | null = null;

            for (const smp of samples) {
              const receivedAt = smp.received_at ?? null;
              if (receivedAt == null) continue;

              if (minReceivedAt == null || receivedAt < minReceivedAt) {
                minReceivedAt = receivedAt;
              }
              if (maxReceivedAt == null || receivedAt > maxReceivedAt) {
                maxReceivedAt = receivedAt;
              }
            }

            nextDur[st.id] =
              minReceivedAt != null && maxReceivedAt != null
                ? formatDurationFromMs(maxReceivedAt - minReceivedAt)
                : "\u2014";
          }

          if (!cancelled) {
            setSets(mappedSets);
            setSetDuration(nextDur);
            setLoading(false);

            // Build per-set overlay lines using emg_left_pec
            const allSetLines: { label: string; pts: { t: number; v: number }[] }[] = [];
            for (const st of sqliteSets) {
              const smp = listSamplesForSet(st.id, 500);
              if (smp.length < 2) continue;
              const t0 = smp[0].t_ms;
              const pts = smp
                .map((s) => ({ t: s.t_ms - t0, v: Number(s.emg_left_pec ?? 0) }))
                .sort((a, b) => a.t - b.t);
              allSetLines.push({ label: st.label ?? `Set ${allSetLines.length + 1}`, pts });
            }
            if (allSetLines.length >= 1) {
              const maxT = Math.max(...allSetLines.map((s) => s.pts[s.pts.length - 1]?.t ?? 0));
              setSetLines(
                allSetLines.map((s) => ({
                  label: s.label,
                  data: resample(s.pts, CHART_POINTS, maxT),
                }))
              );
              setMaxDurationMs(maxT);
            }

            // Build per-set IMU lines: l_roll, l_pitch, l_yaw
            type AxisLines = { label: string; pts: { t: number; v: number }[] }[];
            const rollLines: AxisLines = [], pitchLines: AxisLines = [], yawLines: AxisLines = [];
            for (const st of sqliteSets) {
              const smp = listSamplesForSet(st.id, 500);
              if (smp.length < 2) continue;
              const t0 = smp[0].t_ms;
              const label = st.label ?? `Set ${rollLines.length + 1}`;
              rollLines.push({  label, pts: smp.map((s) => ({ t: s.t_ms - t0, v: Number(s.l_roll  ?? 0) })) });
              pitchLines.push({ label, pts: smp.map((s) => ({ t: s.t_ms - t0, v: Number(s.l_pitch ?? 0) })) });
              yawLines.push({   label, pts: smp.map((s) => ({ t: s.t_ms - t0, v: Number(s.l_yaw   ?? 0) })) });
            }
            if (rollLines.length >= 1) {
              const imuMaxT = Math.max(...rollLines.map((s) => s.pts[s.pts.length - 1]?.t ?? 0));
              const build = (lines: AxisLines) =>
                lines.map((s) => ({ label: s.label, data: resample(s.pts, CHART_POINTS, imuMaxT) }));
              setImuLines({ gyrx: build(rollLines), gyry: build(pitchLines), gyrz: build(yawLines) });
              setImuMaxDurationMs(imuMaxT);
            }
          }

          return;
        }

        const { data: setsData, error: setsErr } = await supabase
          .from("sets")
          .select("id, session_id, created_at, label")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true });

        if (setsErr) throw setsErr;

        const setRows = (setsData ?? []) as SupabaseSetRow[];

        const mappedSets: DisplaySetRow[] = setRows.map((st) => ({
          id: st.id,
          session_id: st.session_id,
          created_at_text: formatDateOnly(st.created_at),
          label: st.label ?? null,
        }));

        const setIds = setRows.map((s) => s.id);

        if (setIds.length === 0) {
          if (!cancelled) {
            setSets(mappedSets);
            setLoading(false);
          }
          return;
        }

        const { data: imuTimes, error: imuErr } = await supabase
          .from("imu_samples")
          .select("set_id, time")
          .in("set_id", setIds);

        if (imuErr) throw imuErr;

        const minBy: Record<string, number> = {};
        const maxBy: Record<string, number> = {};

        for (const r of (imuTimes ?? []) as any[]) {
          const id = String(r.set_id);
          const t = Number(r.time);
          if (!Number.isFinite(t)) continue;
          if (minBy[id] === undefined || t < minBy[id]) minBy[id] = t;
          if (maxBy[id] === undefined || t > maxBy[id]) maxBy[id] = t;
        }

        const nextDur: Record<string, string> = {};
        for (const id of setIds) {
          const mn = minBy[id];
          const mx = maxBy[id];
          nextDur[id] =
            Number.isFinite(mn) && Number.isFinite(mx) && mx >= mn
              ? formatDurationFromMs(mx - mn)
              : "\u2014";
        }

        if (!cancelled) {
          setSets(mappedSets);
          setSetDuration(nextDur);
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setErrMsg(e?.message ?? "Failed to load sets");
          setLoading(false);
        }
      }
    }

    loadSets();
    return () => {
      cancelled = true;
    };
  }, [sessionId, isSqlite]);

  // ── Graph chart data (SQLite only) ──────────────────────────────────────
  const chartData = useMemo(() => {
    if (setLines.length === 0) return null;
    const labelStep = Math.max(1, Math.floor(CHART_POINTS / 6));
    const totalS = maxDurationMs / 1000;
    const labels = Array.from({ length: CHART_POINTS }, (_, i) =>
      i % labelStep === 0 ? ((i / (CHART_POINTS - 1)) * totalS).toFixed(1) + "s" : ""
    );
    const datasets = setLines.slice(0, LINE_COLORS.length).map((line, idx) => ({
      data: line.data,
      color: LINE_COLORS[idx % LINE_COLORS.length],
      strokeWidth: 2,
    }));
    return { labels, datasets };
  }, [setLines, maxDurationMs]);

  const chartConfig = useMemo(() => ({
    backgroundGradientFrom: colors.surface,
    backgroundGradientTo: colors.surface,
    decimalPlaces: 0,
    color: (opacity = 1) => dark ? `rgba(255,255,255,${opacity})` : `rgba(0,0,0,${opacity})`,
    labelColor: (opacity = 1) => dark ? `rgba(156,163,175,${opacity})` : `rgba(107,114,128,${opacity})`,
    propsForBackgroundLines: { strokeDasharray: "4 6", stroke: dark ? "#374151" : "#e5e7eb" },
    propsForDots: { r: "0" },
    useShadowColorFromDataset: true,
  }), [dark, colors.surface]);
  // ────────────────────────────────────────────────────────────────────────

  // ── Pinch-to-zoom (EMG) ──────────────────────────────────────
  const BASE_WIDTH = screenWidth - 48;
  const [zoomScale, setZoomScale] = useState(1);
  const savedScale = useSharedValue(1);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      const next = Math.min(Math.max(savedScale.value * e.scale, 1), 10);
      runOnJS(setZoomScale)(next);
    })
    .onEnd(() => { savedScale.value = zoomScale; });

  // ── Pinch-to-zoom (IMU) ──────────────────────────────────────
  const [imuZoomScale, setImuZoomScale] = useState(1);
  const imuSavedScale = useSharedValue(1);

  const imuPinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      const next = Math.min(Math.max(imuSavedScale.value * e.scale, 1), 10);
      runOnJS(setImuZoomScale)(next);
    })
    .onEnd(() => { imuSavedScale.value = imuZoomScale; });

  // ── IMU chart data ───────────────────────────────────────────
  const imuChartData = useMemo(() => {
    if (imuLines.gyrx.length === 0) return null;
    const labelStep = Math.max(1, Math.floor(CHART_POINTS / 6));
    const totalS = imuMaxDurationMs / 1000;
    const labels = Array.from({ length: CHART_POINTS }, (_, i) =>
      i % labelStep === 0 ? ((i / (CHART_POINTS - 1)) * totalS).toFixed(1) + "s" : ""
    );
    // For each set, add gyrx (blue), gyry (orange), gyrz (green)
    const datasets: { data: number[]; color: (o: number) => string; strokeWidth: number }[] = [];
    const n = Math.min(imuLines.gyrx.length, 3); // cap at 3 sets for clarity
    for (let i = 0; i < n; i++) {
      const alpha = 1 - i * 0.25; // fade older sets slightly
      datasets.push(
        { data: imuLines.gyrx[i].data, color: (o) => `rgba(59,130,246,${o * alpha})`,  strokeWidth: 2 },
        { data: imuLines.gyry[i].data, color: (o) => `rgba(249,115,22,${o * alpha})`, strokeWidth: 2 },
        { data: imuLines.gyrz[i].data, color: (o) => `rgba(34,197,94,${o * alpha})`,  strokeWidth: 2 }
      );
    }
    return { labels, datasets };
  }, [imuLines, imuMaxDurationMs]);
  // ──────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle={dark ? "light-content" : "dark-content"} />

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

        <Text
          variant="headlineSmall"
          style={{ color: colors.onSurface, marginTop: 8 }}
        >
          {title ?? "Session"}
        </Text>
        <Text
          variant="bodySmall"
          style={{ color: colors.onSurfaceVariant, marginTop: 2 }}
        >
          Tap a set to view charts
        </Text>
      </View>

      {loading ? (
        <View style={{ padding: 16, alignItems: "center" }}>
          <ActivityIndicator />
          <Text
            variant="bodySmall"
            style={{ marginTop: 10, color: colors.onSurfaceVariant }}
          >
            Loading sets...
          </Text>
        </View>
      ) : errorMsg ? (
        <View style={{ padding: 16 }}>
          <Text variant="titleSmall" style={{ color: colors.onSurface }}>
            Couldn't load sets
          </Text>
          <Text
            variant="bodySmall"
            style={{ marginTop: 6, color: colors.onSurfaceVariant }}
          >
            {errorMsg}
          </Text>
        </View>
      ) : sets.length === 0 ? (
        <View style={{ padding: 16 }}>
          <Text variant="titleSmall" style={{ color: colors.onSurface }}>
            No sets found
          </Text>
          <Text
            variant="bodySmall"
            style={{ marginTop: 6, color: colors.onSurfaceVariant }}
          >
            This session has no sets in the database yet.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
          {/* Overlay graph – SQLite sessions only */}
          {isSqlite && chartData && (
            <Card style={styles.chartCard} mode="outlined">
              <Card.Content>
                <Text variant="titleSmall" style={{ marginBottom: 8 }}>
                  Left Pectoral EMG
                </Text>

                {/* Legend */}
                <View style={styles.legend}>
                  {setLines.slice(0, LINE_COLORS.length).map((line, idx) => (
                    <View key={idx} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: LINE_COLORS[idx](1) }]} />
                      <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant }}>
                        {line.label}
                      </Text>
                    </View>
                  ))}
                </View>

                <GestureDetector gesture={pinchGesture}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <LineChart
                      data={chartData}
                      width={Math.max(BASE_WIDTH, BASE_WIDTH * zoomScale)}
                      height={200}
                      withDots={false}
                      withShadow={false}
                      withInnerLines
                      withOuterLines={false}
                      renderDotContent={() => null}
                      chartConfig={chartConfig}
                      style={{ borderRadius: 10 }}
                    />
                  </ScrollView>
                </GestureDetector>

                <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant, textAlign: "center", marginTop: 4 }}>
                  Time
                </Text>
              </Card.Content>
            </Card>
          )}

          {/* Left IMU – Gyroscope */}
          {isSqlite && imuChartData && (
            <Card style={styles.chartCard} mode="outlined">
              <Card.Content>
                <Text variant="titleSmall" style={{ marginBottom: 8 }}>
                  Left IMU – Gyroscope
                </Text>

                {/* Axis legend */}
                <View style={styles.legend}>
                  {[
                    { label: "Roll",  color: "rgba(59,130,246,1)" },
                    { label: "Pitch", color: "rgba(249,115,22,1)" },
                    { label: "Yaw",   color: "rgba(34,197,94,1)" },
                  ].map((item) => (
                    <View key={item.label} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                      <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant }}>
                        {item.label}
                      </Text>
                    </View>
                  ))}
                </View>

                <GestureDetector gesture={imuPinchGesture}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <LineChart
                      data={imuChartData}
                      width={Math.max(BASE_WIDTH, BASE_WIDTH * imuZoomScale)}
                      height={200}
                      withDots={false}
                      withShadow={false}
                      withInnerLines
                      withOuterLines={false}
                      renderDotContent={() => null}
                      chartConfig={chartConfig}
                      style={{ borderRadius: 10 }}
                    />
                  </ScrollView>
                </GestureDetector>

                <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant, textAlign: "center", marginTop: 4 }}>
                  Time
                </Text>
              </Card.Content>
            </Card>
          )}

          {/* Sets list */}
          {sets.map((st, idx) => {
            const displayName = st.label?.trim() || `Set ${idx + 1}`;

            return (
              <Card
                key={st.id}
                style={styles.card}
                mode="outlined"
                onPress={() =>
                  router.push({
                    pathname: "/set/[setId]" as const,
                    params: { setId: st.id, source: isSqlite ? "sqlite" : "supabase" },
                  })
                }
              >
                <Card.Content>
                  <View style={styles.topRow}>
                    <View style={styles.inlineRow}>
                      <Text style={{ color: colors.onSurfaceVariant }}>
                        {"\uD83D\uDCC5"}
                      </Text>
                      <Text
                        variant="labelMedium"
                        style={{ color: colors.onSurfaceVariant }}
                      >
                        {st.created_at_text}
                      </Text>
                    </View>

                    <View style={styles.inlineRow}>
                      <Text style={{ color: colors.onSurfaceVariant }}>
                        {"\uD83D\uDD52"}
                      </Text>
                      <Text
                        variant="labelMedium"
                        style={{ color: colors.onSurfaceVariant }}
                      >
                        {setDuration[st.id] ?? "\u2014"}
                      </Text>
                    </View>
                  </View>

                  <View style={{ marginTop: 10 }}>
                    <Text
                      variant="headlineSmall"
                      style={{ color: colors.onSurface, fontWeight: "800" }}
                    >
                      {displayName}
                    </Text>
                    <Text
                      variant="bodySmall"
                      style={{ marginTop: 2, color: colors.onSurfaceVariant }}
                    >
                      Tap to view analytics
                    </Text>
                  </View>
                </Card.Content>
              </Card>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  card: {
    borderRadius: 16,
    marginBottom: 16,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  inlineRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  chartCard: { borderRadius: 14, marginBottom: 20, overflow: "hidden" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
});