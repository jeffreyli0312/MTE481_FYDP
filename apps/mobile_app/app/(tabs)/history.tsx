import React, { useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import {
  SafeAreaView,
  ScrollView,
  View,
  StyleSheet,
  Dimensions,
  StatusBar,
} from "react-native";
import { Card, Text, ActivityIndicator } from "react-native-paper";
import { LineChart } from "react-native-chart-kit";
import { useAppTheme } from "../theme";
import { supabase } from "../../lib/supabase";

import {
  initBleDb,
  listSessions as listSqliteSessions,
  listSets as listSqliteSets,
  listSamplesForSet as listSqliteSamplesForSet,
  type SessionRow as SqliteSessionRow,
  type SetRow as SqliteSetRow,
} from "../hooks/bleDb";

const screenWidth = Dimensions.get("window").width;

type SessionRow = {
  id: string;
  label: string | null;
  created_at: string;
};

type LocalSessionCardRow = {
  id: string;
  label: string | null;
  created_at_ms: number | null;
  durationText: string;
  setCount: number;
};

type SampleRow = {
  time: number;
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

function formatDateFromMs(ms: number | null) {
  if (!ms) return "\u2014";
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, {
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
  const { colors, dark } = useAppTheme();

  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingLocalSessions, setLoadingLocalSessions] = useState(true);

  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [localErrMsg, setLocalErrMsg] = useState<string | null>(null);

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [localSessions, setLocalSessions] = useState<LocalSessionCardRow[]>([]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [sessionLoading, setSessionLoading] = useState<Record<string, boolean>>({});
  const [sessionError, setSessionError] = useState<Record<string, string>>({});
  const [sessionSeries, setSessionSeries] = useState<Record<string, Series>>({});
  const [sessionDuration, setSessionDuration] = useState<Record<string, string>>({});

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
          .from("sessions")
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

    async function loadLocalSessions() {
      setLoadingLocalSessions(true);
      setLocalErrMsg(null);

      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;

        const userId = authData.user?.id;
        if (!userId) throw new Error("Not logged in");

        initBleDb();

        const sqliteSessions = listSqliteSessions(userId) as SqliteSessionRow[];

        const localCards: LocalSessionCardRow[] = sqliteSessions.map((session) => {
          const sets = listSqliteSets(session.id) as SqliteSetRow[];

          let minReceivedAt: number | null = null;
          let maxReceivedAt: number | null = null;

          for (const st of sets) {
            const samples = listSqliteSamplesForSet(st.id, 1000);
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
          }

          const durationText =
            minReceivedAt != null && maxReceivedAt != null
              ? formatDurationFromMs(maxReceivedAt - minReceivedAt)
              : "\u2014";

          return {
            id: session.id,
            label: "Local Session",
            created_at_ms: session.started_at ?? null,
            durationText,
            setCount: sets.length,
          };
        });

        localCards.sort(
          (a, b) => (b.created_at_ms ?? 0) - (a.created_at_ms ?? 0)
        );

        if (!cancelled) {
          setLocalSessions(localCards);
          setLoadingLocalSessions(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setLocalErrMsg(e?.message ?? "Failed to load local sessions");
          setLoadingLocalSessions(false);
        }
      }
    }

    loadSessions();
    loadLocalSessions();

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

        if (
          rows.length >= 2 &&
          Number.isFinite(rows[0].time) &&
          Number.isFinite(rows[rows.length - 1].time)
        ) {
          const durMs = rows[rows.length - 1].time - rows[0].time;
          setSessionDuration((prev) => ({
            ...prev,
            [sessionId]: formatDurationFromMs(durMs),
          }));
        } else {
          setSessionDuration((prev) => ({ ...prev, [sessionId]: "\u2014" }));
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle={dark ? "light-content" : "dark-content"} />

      <Text variant="titleLarge" style={{ color: colors.onSurface, padding: 12 }}>
        History
      </Text>

      <View style={{ flex: 1 }}>
        <View style={[styles.headerContainer, { borderBottomColor: colors.outline }]}>
          <Text variant="titleMedium" style={{ color: colors.onSurface }}>
            Previous Sessions
          </Text>
          <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>
            Tap a session to expand
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={{ marginBottom: 24 }}>
            <Text
              variant="titleMedium"
              style={{ color: colors.onSurface, marginBottom: 12 }}
            >
              Local SQLite Sessions
            </Text>

            {loadingLocalSessions ? (
              <View style={{ padding: 16, alignItems: "center" }}>
                <ActivityIndicator />
                <Text
                  variant="bodySmall"
                  style={{ marginTop: 10, color: colors.onSurfaceVariant }}
                >
                  Loading local sessions...
                </Text>
              </View>
            ) : localErrMsg ? (
              <View style={{ padding: 16 }}>
                <Text variant="titleSmall" style={{ color: colors.onSurface }}>
                  Couldn't load local sessions
                </Text>
                <Text
                  variant="bodySmall"
                  style={{ marginTop: 6, color: colors.onSurfaceVariant }}
                >
                  {localErrMsg}
                </Text>
              </View>
            ) : localSessions.length === 0 ? (
              <View style={{ padding: 16 }}>
                <Text variant="titleSmall" style={{ color: colors.onSurface }}>
                  No local sessions yet
                </Text>
                <Text
                  variant="bodySmall"
                  style={{ marginTop: 6, color: colors.onSurfaceVariant }}
                >
                  Create local SQLite sets to see them here.
                </Text>
              </View>
            ) : (
              localSessions.map((s) => (
                <Card
                  key={`local-${s.id}`}
                  style={styles.sessionCard}
                  mode="outlined"
                  onPress={() =>
                    router.push({
                      pathname: "/session/[sessionId]",
                      params: { sessionId: s.id, source: "sqlite" },
                    })
                  }
                >
                  <Card.Content>
                    <View style={styles.topRow}>
                      <View style={styles.inlineRow}>
                        <Text
                          variant="labelMedium"
                          style={{ color: colors.onSurfaceVariant }}
                        >
                          {"\uD83D\uDCC5"}
                        </Text>
                        <Text
                          variant="labelMedium"
                          style={{ color: colors.onSurfaceVariant }}
                        >
                          {formatDateFromMs(s.created_at_ms)}
                        </Text>
                      </View>

                      <View style={styles.inlineRow}>
                        <Text
                          variant="labelMedium"
                          style={{ color: colors.onSurfaceVariant }}
                        >
                          {"\uD83D\uDD52"}
                        </Text>
                        <Text
                          variant="labelMedium"
                          style={{ color: colors.onSurfaceVariant }}
                        >
                          {s.durationText}
                        </Text>
                      </View>
                    </View>

                    <View style={{ marginTop: 10 }}>
                      <Text
                        variant="headlineSmall"
                        style={{ color: colors.onSurface, fontWeight: "700" }}
                      >
                        {s.label}
                      </Text>
                      <Text
                        variant="bodySmall"
                        style={{ color: colors.onSurfaceVariant }}
                      >
                        {s.setCount} {s.setCount === 1 ? "Set" : "Sets"}
                      </Text>
                    </View>
                  </Card.Content>
                </Card>
              ))
            )}
          </View>

          <View>
            <Text
              variant="titleMedium"
              style={{ color: colors.onSurface, marginBottom: 12 }}
            >
              Supabase Sessions
            </Text>

            {loadingSessions ? (
              <View style={{ padding: 16, alignItems: "center" }}>
                <ActivityIndicator />
                <Text variant="bodySmall" style={{ marginTop: 10, color: colors.onSurfaceVariant }}>
                  Loading sessions...
                </Text>
              </View>
            ) : errMsg ? (
              <View style={{ padding: 16 }}>
                <Text variant="titleSmall" style={{ color: colors.onSurface }}>
                  Couldn't load sessions
                </Text>
                <Text variant="bodySmall" style={{ marginTop: 6, color: colors.onSurfaceVariant }}>
                  {errMsg}
                </Text>
              </View>
            ) : sessions.length === 0 ? (
              <View style={{ padding: 16 }}>
                <Text variant="titleSmall" style={{ color: colors.onSurface }}>
                  No sessions yet
                </Text>
                <Text variant="bodySmall" style={{ marginTop: 6, color: colors.onSurfaceVariant }}>
                  Insert mock sessions in Supabase to see them here.
                </Text>
              </View>
            ) : (
              sessions.map((s, idx) => (
                <Card
                  key={s.id}
                  style={styles.sessionCard}
                  mode="outlined"
                  onPress={() =>
                    router.push({
                      pathname: "/session/[sessionId]",
                      params: { sessionId: s.id, source: "supabase" },
                    })
                  }
                >
                  <Card.Content>
                    <View style={styles.topRow}>
                      <View style={styles.inlineRow}>
                        <Text variant="labelMedium" style={{ color: colors.onSurfaceVariant }}>
                          {"\uD83D\uDCC5"}
                        </Text>
                        <Text variant="labelMedium" style={{ color: colors.onSurfaceVariant }}>
                          {formatDateOnly(s.created_at)}
                        </Text>
                      </View>

                      <View style={styles.inlineRow}>
                        <Text variant="labelMedium" style={{ color: colors.onSurfaceVariant }}>
                          {"\uD83D\uDD52"}
                        </Text>
                        <Text variant="labelMedium" style={{ color: colors.onSurfaceVariant }}>
                          {sessionDuration[s.id] ?? "\u2014"}
                        </Text>
                      </View>
                    </View>

                    <View style={{ marginTop: 10 }}>
                      <Text variant="headlineSmall" style={{ color: colors.onSurface, fontWeight: "700" }}>
                        {s.label?.trim() ? s.label : `${sessions.length - idx}`}
                      </Text>
                      <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>
                        Sets
                      </Text>
                    </View>
                  </Card.Content>
                </Card>
              ))
            )}
          </View>
        </ScrollView>
      </View>
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
  const { colors } = useAppTheme();
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
    backgroundGradientFrom: colors.surface,
    backgroundGradientTo: colors.surface,
    decimalPlaces: 2,
    color: (opacity = 1) =>
      dark
        ? `rgba(80, 156, 255, ${opacity})`
        : `rgba(37, 99, 235, ${opacity})`,
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
    <Card style={styles.metricCard} mode="outlined">
      <Card.Content>
        <View style={styles.metricHeader}>
          <Text variant="titleSmall">{title}</Text>
          <Text variant="bodySmall" style={{ color: colors.primary }}>
            Latest: {latest === null ? "\u2014" : latest.toFixed(2)}
          </Text>
        </View>

        <LineChart
          data={chartData}
          width={screenWidth - 32}
          height={180}
          withInnerLines
          withOuterLines={false}
          withDots={false}
          withShadow={false}
          fromZero={false}
          chartConfig={chartConfig}
          style={{ marginTop: 4 }}
          bezier
        />

        <View style={styles.metricFooter}>
          <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant }}>
            {data.length} samples
          </Text>
          <Text variant="labelSmall" style={{ color: colors.muted }}>
            Session chart
          </Text>
        </View>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 24, paddingTop: 8 },
  sessionCard: {
    borderRadius: 16,
    marginBottom: 16,
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
  metricCard: {
    borderRadius: 16,
    marginBottom: 16,
  },
  metricHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 4,
  },
  metricFooter: {
    marginTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});