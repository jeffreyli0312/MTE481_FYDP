import React, { useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  StyleSheet,
  Dimensions,
  StatusBar,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { LineChart } from "react-native-chart-kit";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../../lib/supabase";

const screenWidth = Dimensions.get("window").width;

type SessionRow = {
  id: string;
  label: string | null;
  created_at: string;
};

type SampleRow = {
  time: number; // milliseconds in DB
  roll: number;
  pitch: number;
  yaw: number;
  ax: number;
  ay: number;
  az: number;
};

type Series = {
  labels: string[];
  roll: number[];
  pitch: number[];
  yaw: number[];
  ax: number[];
  ay: number[];
  az: number[];
};

function formatDateOnly(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDurationFromMs(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s}s`;
}

function buildSeries(samples: SampleRow[]): Series {
  const clean = samples.filter(
    (r) =>
      Number.isFinite(r.time) &&
      Number.isFinite(r.roll) &&
      Number.isFinite(r.pitch) &&
      Number.isFinite(r.yaw) &&
      Number.isFinite(r.ax) &&
      Number.isFinite(r.ay) &&
      Number.isFinite(r.az)
  );

  // labels in seconds for readability
  const labels = clean.map((r) => (r.time / 1000).toFixed(2));

  return {
    labels,
    roll: clean.map((r) => r.roll),
    pitch: clean.map((r) => r.pitch),
    yaw: clean.map((r) => r.yaw),
    ax: clean.map((r) => r.ax),
    ay: clean.map((r) => r.ay),
    az: clean.map((r) => r.az),
  };
}

export default function HistoryScreen() {
  const { theme } = useTheme();
  const dark = theme === "dark";

  const [loadingSessions, setLoadingSessions] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [sessionLoading, setSessionLoading] = useState<Record<string, boolean>>(
    {}
  );
  const [sessionError, setSessionError] = useState<Record<string, string>>({});
  const [sessionSeries, setSessionSeries] = useState<Record<string, Series>>(
    {}
  );

  // duration shown on card, computed from first/last time in ms
  const [sessionDuration, setSessionDuration] = useState<Record<string, string>>(
    {}
  );

  useEffect(() => {
    let cancelled = false;

    async function loadSessions() {
      setLoadingSessions(true);
      setErrMsg(null);

      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;

        const userId = authData.user?.id;
        if (!userId) throw new Error("Not logged in");

        const { data, error } = await supabase
          .from("imu_sessions")
          .select("id,label,created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });

        if (error) throw error;

        if (!cancelled) {
          setSessions((data ?? []) as SessionRow[]);
          setLoadingSessions(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setErrMsg(e?.message ?? "Failed to load sessions");
          setLoadingSessions(false);
        }
      }
    }

    loadSessions();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggleSession(sessionId: string) {
    const nextOpen = !expanded[sessionId];
    setExpanded((prev) => ({ ...prev, [sessionId]: nextOpen }));

    if (nextOpen && !sessionSeries[sessionId] && !sessionLoading[sessionId]) {
      setSessionLoading((prev) => ({ ...prev, [sessionId]: true }));
      setSessionError((prev) => {
        const copy = { ...prev };
        delete copy[sessionId];
        return copy;
      });

      try {
        const N = 600;

        const { data, error } = await supabase
          .from("imu_samples")
          .select("time, roll, pitch, yaw, ax, ay, az")
          .eq("session_id", sessionId)
          .order("time", { ascending: true })
          .limit(N);

        if (error) throw error;

        const rows = ((data ?? []) as any[]).map((r) => ({
          time: Number(r.time),
          roll: Number(r.roll),
          pitch: Number(r.pitch),
          yaw: Number(r.yaw),
          ax: Number(r.ax),
          ay: Number(r.ay),
          az: Number(r.az),
        })) as SampleRow[];

        const series = buildSeries(rows);
        setSessionSeries((prev) => ({ ...prev, [sessionId]: series }));

        // Duration: last time - first time (time is in ms)
        if (rows.length >= 2 && Number.isFinite(rows[0].time) && Number.isFinite(rows[rows.length - 1].time)) {
          const durMs = rows[rows.length - 1].time - rows[0].time;
          setSessionDuration((prev) => ({
            ...prev,
            [sessionId]: formatDurationFromMs(durMs),
          }));
        } else {
          setSessionDuration((prev) => ({ ...prev, [sessionId]: "—" }));
        }
      } catch (e: any) {
        setSessionError((prev) => ({
          ...prev,
          [sessionId]: e?.message ?? "Failed to load session samples",
        }));
      } finally {
        setSessionLoading((prev) => ({ ...prev, [sessionId]: false }));
      }
    }
  }

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: dark ? "#14161c" : "#f5f5f5",
      }}
    >
      <StatusBar barStyle={dark ? "light-content" : "dark-content"} />

      <Text
        style={{
          color: dark ? "#fff" : "#000",
          fontSize: 22,
          fontWeight: "600",
          padding: 12,
        }}
      >
        History
      </Text>

      <SafeAreaView
        style={[
          styles.safeArea,
          { backgroundColor: dark ? "#14161c" : "#f5f5f5" },
        ]}
      >
        <View
          style={[
            styles.headerContainer,
            { borderBottomColor: dark ? "#2b2f3a" : "#e5e7eb" },
          ]}
        >
          <Text
            style={[styles.appTitle, { color: dark ? "#ffffff" : "#111827" }]}
          >
            Previous Sessions
          </Text>
          <Text
            style={[
              styles.appSubtitle,
              { color: dark ? "#9ca3af" : "#6b7280" },
            ]}
          >
            Tap a session to expand
          </Text>
        </View>

        {loadingSessions ? (
          <View style={{ padding: 16 }}>
            <ActivityIndicator />
            <Text style={{ marginTop: 10, color: dark ? "#9ca3af" : "#6b7280" }}>
              Loading sessions…
            </Text>
          </View>
        ) : errMsg ? (
          <View style={{ padding: 16 }}>
            <Text style={{ color: dark ? "#fff" : "#111827", fontWeight: "600" }}>
              Couldn’t load sessions
            </Text>
            <Text style={{ marginTop: 6, color: dark ? "#9ca3af" : "#6b7280" }}>
              {errMsg}
            </Text>
          </View>
        ) : sessions.length === 0 ? (
          <View style={{ padding: 16 }}>
            <Text style={{ color: dark ? "#fff" : "#111827", fontWeight: "600" }}>
              No sessions yet
            </Text>
            <Text style={{ marginTop: 6, color: dark ? "#9ca3af" : "#6b7280" }}>
              Insert mock sessions in Supabase to see them here.
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {sessions.map((s, idx) => {
              const open = !!expanded[s.id];
              const isLoading = !!sessionLoading[s.id];
              const err = sessionError[s.id];
              const series = sessionSeries[s.id];

              return (
                <View key={s.id} style={{ marginBottom: 16 }}>
                  {/* Session card (matches your screenshot layout) */}
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: "/session/[sessionId]",
                        params: { sessionId: s.id, created_at: s.created_at, label: s.label ?? "" },
                      })
                    }
                    style={[
                      styles.sessionCard,
                      {
                        backgroundColor: dark ? "#1e2128" : "#ffffff",
                        borderColor: dark ? "#2b2f3a" : "#e5e7eb",
                      },
                    ]}
                  >
                    <View style={styles.topRow}>
                      <View style={styles.inlineRow}>
                        <Text
                          style={[
                            styles.iconText,
                            { color: dark ? "#9ca3af" : "#6b7280" },
                          ]}
                        >
                          📅
                        </Text>
                        <Text
                          style={[
                            styles.metaText,
                            { color: dark ? "#9ca3af" : "#6b7280" },
                          ]}
                        >
                          {formatDateOnly(s.created_at)}
                        </Text>
                      </View>

                      <View style={styles.inlineRow}>
                        <Text
                          style={[
                            styles.iconText,
                            { color: dark ? "#9ca3af" : "#6b7280" },
                          ]}
                        >
                          🕒
                        </Text>
                        <Text
                          style={[
                            styles.metaText,
                            { color: dark ? "#9ca3af" : "#6b7280" },
                          ]}
                        >
                          {sessionDuration[s.id] ?? "—"}
                        </Text>
                      </View>
                    </View>

                    <View style={{ marginTop: 10 }}>
                      {/* Fix contrast in dark mode */}
                      <Text
                        style={[
                          styles.bigValue,
                          { color: dark ? "#ffffff" : "#111827" },
                        ]}
                      >
                        {s.label?.trim() ? s.label : `${sessions.length - idx}`}
                      </Text>
                      <Text
                        style={[
                          styles.smallLabel,
                          { color: dark ? "#9ca3af" : "#6b7280" },
                        ]}
                      >
                        Sets
                      </Text>
                    </View>
                  </Pressable>

                  {/* Expanded content */}
                  {open && (
                    <View style={{ marginTop: 10 }}>
                      {isLoading ? (
                        <View style={{ padding: 12 }}>
                          <ActivityIndicator />
                          <Text
                            style={{
                              marginTop: 10,
                              color: dark ? "#9ca3af" : "#6b7280",
                            }}
                          >
                            Loading session data…
                          </Text>
                        </View>
                      ) : err ? (
                        <View style={{ padding: 12 }}>
                          <Text
                            style={{
                              color: dark ? "#fff" : "#111827",
                              fontWeight: "600",
                            }}
                          >
                            Couldn’t load this session
                          </Text>
                          <Text
                            style={{
                              marginTop: 6,
                              color: dark ? "#9ca3af" : "#6b7280",
                            }}
                          >
                            {err}
                          </Text>
                        </View>
                      ) : !series || series.labels.length < 2 ? (
                        <View style={{ padding: 12 }}>
                          <Text style={{ color: dark ? "#9ca3af" : "#6b7280" }}>
                            Not enough samples to chart.
                          </Text>
                        </View>
                      ) : (
                        <>
                          <MetricCard
                            title="Roll (°)"
                            data={series.roll}
                            labels={series.labels}
                            dark={dark}
                          />
                          <MetricCard
                            title="Pitch (°)"
                            data={series.pitch}
                            labels={series.labels}
                            dark={dark}
                          />
                          <MetricCard
                            title="Yaw (°)"
                            data={series.yaw}
                            labels={series.labels}
                            dark={dark}
                          />
                          <MetricCard
                            title="Ax"
                            data={series.ax}
                            labels={series.labels}
                            dark={dark}
                          />
                          <MetricCard
                            title="Ay"
                            data={series.ay}
                            labels={series.labels}
                            dark={dark}
                          />
                          <MetricCard
                            title="Az"
                            data={series.az}
                            labels={series.labels}
                            dark={dark}
                          />
                        </>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}
      </SafeAreaView>
    </SafeAreaView>
  );
}

function MetricCard({
  title,
  data,
  labels,
  dark,
}: {
  title: string;
  data: number[];
  labels: string[];
  dark: boolean;
}) {
  const labelStep = Math.max(1, Math.floor(labels.length / 6));
  const sparseLabels = useMemo(
    () => labels.map((l, i) => (i % labelStep === 0 ? l : "")),
    [labels, labelStep]
  );

  const chartData = useMemo(
    () => ({
      labels: sparseLabels,
      datasets: [{ data, strokeWidth: 2 }],
    }),
    [data, sparseLabels]
  );

  const latest = data.length ? data[data.length - 1] : null;

  const chartConfig = {
    backgroundGradientFrom: dark ? "#1e2128" : "#ffffff",
    backgroundGradientTo: dark ? "#1e2128" : "#ffffff",
    decimalPlaces: 2,
    color: (opacity = 1) =>
      dark ? `rgba(80, 156, 255, ${opacity})` : `rgba(37, 99, 235, ${opacity})`,
    labelColor: (opacity = 1) =>
      dark
        ? `rgba(200, 200, 200, ${opacity})`
        : `rgba(55, 65, 81, ${opacity})`,
    propsForBackgroundLines: {
      strokeDasharray: "3 6",
      stroke: dark ? "#374151" : "#e5e7eb",
    },
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: dark ? "#1e2128" : "#ffffff",
          shadowOpacity: dark ? 0.25 : 0.1,
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: dark ? "#e5e7eb" : "#111827" }]}>
          {title}
        </Text>
        <Text style={[styles.cardValue, { color: dark ? "#60a5fa" : "#2563eb" }]}>
          Latest: {latest === null ? "—" : latest.toFixed(2)}
        </Text>
      </View>

      <LineChart
        data={chartData}
        width={screenWidth - 32}
        height={180}
        withInnerLines={true}
        withOuterLines={false}
        withDots={false}
        withShadow={false}
        fromZero={false}
        chartConfig={chartConfig}
        style={styles.chart}
        bezier
      />

      <View style={styles.footerRow}>
        <Text style={[styles.footerText, { color: dark ? "#9ca3af" : "#6b7280" }]}>
          {data.length} samples
        </Text>
        <Text
          style={[
            styles.footerTextMuted,
            { color: dark ? "#6b7280" : "#9ca3af" },
          ]}
        >
          Session chart
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  appTitle: { fontSize: 20, fontWeight: "700" },
  appSubtitle: { marginTop: 4, fontSize: 13 },

  scrollContent: { paddingHorizontal: 16, paddingBottom: 24, paddingTop: 8 },

  sessionCard: {
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconText: { fontSize: 14 },
  metaText: { fontSize: 13, fontWeight: "500" },
  bigValue: { fontSize: 28, fontWeight: "700", lineHeight: 32 },
  smallLabel: { fontSize: 13, marginTop: 2 },

  card: {
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 16,
    shadowColor: "#000",
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 4,
  },
  cardTitle: { fontSize: 14, fontWeight: "600" },
  cardValue: { fontSize: 13, fontWeight: "500" },
  chart: { marginTop: 4 },
  footerRow: { marginTop: 6, flexDirection: "row", justifyContent: "space-between" },
  footerText: { fontSize: 12 },
  footerTextMuted: { fontSize: 11 },
});
