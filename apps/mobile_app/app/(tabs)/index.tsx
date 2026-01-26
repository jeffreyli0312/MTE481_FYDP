import React, { useEffect, useMemo, useState } from "react";
import { useTheme } from "../context/ThemeContext";

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
import { supabase } from "../../lib/supabase";

const screenWidth = Dimensions.get("window").width;

type SessionRow = {
  id: string;
  label: string | null;
  created_at: string;
};

type SampleRow = {
  time: number; // change to "t: number" if your column is t
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

function formatDate(iso: string) {
  // simple readable timestamp (local device time)
  const d = new Date(iso);
  return d.toLocaleString();
}

function buildSeries(samples: SampleRow[]): Series {
  const labels = samples.map((r) => r.time.toFixed(2)); // or r.t.toFixed(2)
  return {
    labels,
    roll: samples.map((r) => r.roll),
    pitch: samples.map((r) => r.pitch),
    yaw: samples.map((r) => r.yaw),
    ax: samples.map((r) => r.ax),
    ay: samples.map((r) => r.ay),
    az: samples.map((r) => r.az),
  };
}

export default function Index() {
  const { theme } = useTheme();
  const dark = theme === "dark";

  const [loadingSessions, setLoadingSessions] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // per-session state (lazy-loaded when expanded)
  const [sessionLoading, setSessionLoading] = useState<Record<string, boolean>>(
    {}
  );
  const [sessionError, setSessionError] = useState<Record<string, string>>({});
  const [sessionSeries, setSessionSeries] = useState<Record<string, Series>>(
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

    // If opening and we don't have data yet, fetch samples
    if (nextOpen && !sessionSeries[sessionId] && !sessionLoading[sessionId]) {
      setSessionLoading((prev) => ({ ...prev, [sessionId]: true }));
      setSessionError((prev) => {
        const copy = { ...prev };
        delete copy[sessionId];
        return copy;
      });

      try {
        // Fetch a lot, but not "infinite". Adjust if needed.
        const N = 600;

        const { data, error } = await supabase
          .from("imu_samples")
          .select("time, roll, pitch, yaw, ax, ay, az") // change "time" -> "t" if needed
          .eq("session_id", sessionId)
          .order("time", { ascending: true }) // change "time" -> "t" if needed
          .limit(N);

        if (error) throw error;

        const rows = (data ?? []) as SampleRow[];
        const series = buildSeries(rows);

        setSessionSeries((prev) => ({ ...prev, [sessionId]: series }));
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
        Dashboard
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
            FYDP Data Monitor
          </Text>
          <Text
            style={[
              styles.appSubtitle,
              { color: dark ? "#9ca3af" : "#6b7280" },
            ]}
          >
            Sessions (tap to expand)
          </Text>
        </View>

        {loadingSessions ? (
          <View style={{ padding: 16 }}>
            <ActivityIndicator />
            <Text
              style={{ marginTop: 10, color: dark ? "#9ca3af" : "#6b7280" }}
            >
              Loading sessions…
            </Text>
          </View>
        ) : errMsg ? (
          <View style={{ padding: 16 }}>
            <Text style={{ color: dark ? "#fff" : "#111827", fontWeight: "600" }}>
              Couldn’t load sessions
            </Text>
            <Text
              style={{ marginTop: 6, color: dark ? "#9ca3af" : "#6b7280" }}
            >
              {errMsg}
            </Text>
          </View>
        ) : sessions.length === 0 ? (
          <View style={{ padding: 16 }}>
            <Text style={{ color: dark ? "#fff" : "#111827", fontWeight: "600" }}>
              No sessions yet
            </Text>
            <Text
              style={{ marginTop: 6, color: dark ? "#9ca3af" : "#6b7280" }}
            >
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
                  {/* Session header card */}
                  <Pressable
                    onPress={() => toggleSession(s.id)}
                    style={[
                      styles.sessionHeader,
                      {
                        backgroundColor: dark ? "#1e2128" : "#ffffff",
                        borderColor: dark ? "#2b2f3a" : "#e5e7eb",
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          color: dark ? "#e5e7eb" : "#111827",
                          fontWeight: "700",
                          fontSize: 14,
                        }}
                      >
                        {s.label?.trim() ? s.label : `Session ${sessions.length - idx}`}
                      </Text>
                      <Text
                        style={{
                          marginTop: 4,
                          color: dark ? "#9ca3af" : "#6b7280",
                          fontSize: 12,
                        }}
                      >
                        {formatDate(s.created_at)}
                      </Text>
                    </View>

                    <Text
                      style={{
                        color: dark ? "#60a5fa" : "#2563eb",
                        fontWeight: "700",
                        fontSize: 12,
                      }}
                    >
                      {open ? "Hide" : "View"}
                    </Text>
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
                      ) : !series || series.labels.length === 0 ? (
                        <View style={{ padding: 12 }}>
                          <Text
                            style={{
                              color: dark ? "#9ca3af" : "#6b7280",
                            }}
                          >
                            No samples found for this session.
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

                          <View style={{ marginTop: 6, paddingHorizontal: 4 }}>
                            <Text
                              style={{
                                fontSize: 12,
                                color: dark ? "#9ca3af" : "#6b7280",
                              }}
                            >
                              {series.labels.length} samples loaded
                            </Text>
                          </View>
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
  // Reduce label clutter
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
      dark ? `rgba(200, 200, 200, ${opacity})` : `rgba(55, 65, 81, ${opacity})`,
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

  sessionHeader: {
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
  },

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
