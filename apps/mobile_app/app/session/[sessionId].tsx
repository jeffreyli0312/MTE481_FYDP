import React, { useEffect, useState } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, Text, ActivityIndicator } from "react-native-paper";
import { useLocalSearchParams, router, Stack } from "expo-router";
import { Ionicons, Feather } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { useAppTheme } from "../theme";

import {
  initBleDb,
  listSets as listSqliteSets,
  listSamplesForSet,
  listRepsForSet,
} from "../sqlite/bleDb";
import { useAuth } from "../context/AuthContext";
import { movingAverageSmooth, emaSmooth } from "../utils/format";

const FLARE_THRESHOLD = 45; // degrees
const FAST_REP_MS = 800; // rep < 0.8s is too fast
const SLOW_REP_MS = 2500; // rep > 2.5s might be too slow / need more tension
const HIGH_FATIGUE_PCT = 30;

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

function getRecommendations(analytics: {
  totalReps: number;
  avgRepTimeMs: number;
  avgRestTimeMs: number;
  maxFlareDeg: number;
  fatigueIndexPct: number | null;
}): string[] {
  const tips: string[] = [];
  if (analytics.maxFlareDeg > FLARE_THRESHOLD) {
    tips.push(
      `Reduce shoulder flare: Your elbows drifted ${analytics.maxFlareDeg.toFixed(0)}\u00B0 from the ideal position. Keep elbows at a 45\u00B0 angle to your body to protect your shoulders.`
    );
  }
  if (analytics.avgRepTimeMs > 0 && analytics.avgRepTimeMs < FAST_REP_MS) {
    tips.push(
      "Slow down your reps: Your average rep time is very fast. Focus on a 2\u20133 second eccentric (lowering) phase for better muscle engagement and form control."
    );
  }
  if (analytics.avgRepTimeMs > SLOW_REP_MS) {
    tips.push(
      "Increase contraction intensity: Your reps are quite slow. Try to apply more consistent tension throughout the movement rather than pausing at transition points."
    );
  }
  if (analytics.avgRestTimeMs > 0 && analytics.avgRestTimeMs < 500 && analytics.totalReps > 5) {
    tips.push(
      "Add a brief pause between reps: Very short rest between reps may indicate rushing. Pause 1\u20132 seconds to reset position and maintain form."
    );
  }
  if (analytics.fatigueIndexPct != null && analytics.fatigueIndexPct > HIGH_FATIGUE_PCT) {
    tips.push(
      `High fatigue detected (${analytics.fatigueIndexPct}% drop in peak EMG). Reduce reps per set or add more rest to maintain quality.`
    );
  }
  if (tips.length === 0 && analytics.totalReps > 0) {
    tips.push("Great session! Your form metrics look solid. Keep up the consistency.");
  }
  return tips;
}

export default function SessionSetsScreen() {
  const { colors, dark } = useAppTheme();
  const { user } = useAuth();

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
  const [setFlare, setSetFlare] = useState<Record<string, { detected: boolean; maxDev: number; baselineYaw: number; absoluteMaxDevYaw: number }>>({});
  const [sessionAnalytics, setSessionAnalytics] = useState<{
    totalReps: number;
    avgRepTimeMs: number;
    avgRestTimeMs: number;
    maxFlareDeg: number;
    fatigueIndexPct: number | null;
    totalDurationMs: number;
  } | null>(null);

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
          const nextFlare: Record<string, { detected: boolean; maxDev: number; baselineYaw: number; absoluteMaxDevYaw: number }> = {};

          for (const st of sqliteSets) {
            const samples = listSamplesForSet(st.id, 1000);

            if (samples.length === 0) {
              nextDur[st.id] = "\u2014";
              nextFlare[st.id] = { detected: false, maxDev: 0, baselineYaw: 0, absoluteMaxDevYaw: 0 };
              continue;
            }

            let minReceivedAt: number | null = null;
            let maxReceivedAt: number | null = null;

            // Extract valid l_yaw points and apply smoothing
            const rawYawPoints = samples
              .filter((s) => s.l_yaw != null && s.received_at != null)
              .map((s) => ({ time: s.received_at!, value: Number(s.l_yaw) }));
            
            const smoothedYawPoints = emaSmooth(movingAverageSmooth(rawYawPoints, 10), 0.25);

            // Shoulder flare: baseline yaw is the average of the first 3 seconds (up to 300 samples at ~100Hz)
            const BASELINE_SAMPLES_COUNT = Math.min(300, smoothedYawPoints.length);
            const baselineSubset = smoothedYawPoints.slice(0, BASELINE_SAMPLES_COUNT);
            const baselineYaw = baselineSubset.length > 0 
                ? baselineSubset.reduce((sum, s) => sum + s.value, 0) / baselineSubset.length
                : 0;

            let maxYawDev = 0;
            let absoluteMaxDevYaw = 0;

            for (const smp of smoothedYawPoints) {
              const receivedAt = smp.time;

              if (minReceivedAt == null || receivedAt < minReceivedAt) {
                minReceivedAt = receivedAt;
              }
              if (maxReceivedAt == null || receivedAt > maxReceivedAt) {
                maxReceivedAt = receivedAt;
              }

              let rawDev = smp.value - baselineYaw;
              if (rawDev > 180) rawDev -= 360;
              if (rawDev < -180) rawDev += 360;

              if (Math.abs(rawDev) > Math.abs(maxYawDev)) {
                maxYawDev = rawDev;
                absoluteMaxDevYaw = smp.value;
              }
            }

            nextDur[st.id] =
              minReceivedAt != null && maxReceivedAt != null
                ? formatDurationFromMs(maxReceivedAt - minReceivedAt)
                : "\u2014";

            nextFlare[st.id] = { 
              detected: Math.abs(maxYawDev) > FLARE_THRESHOLD, 
              maxDev: maxYawDev,
              baselineYaw: baselineYaw,
              absoluteMaxDevYaw: absoluteMaxDevYaw
            };
          }

          // Session-level analytics (SQLite)
          let totalReps = 0;
          let sumRepTime = 0;
          let repTimeCount = 0;
          let sumRestTime = 0;
          let restCount = 0;
          let maxFlareDeg = 0;
          let allPeaks: number[] = [];
          let totalDurationMs = 0;

          for (const st of sqliteSets) {
            const reps = listRepsForSet(st.id);
            totalReps += reps.length;

            for (const r of reps) {
              if (r.end_ms != null) {
                sumRepTime += r.end_ms - r.start_ms;
                repTimeCount++;
              }
              if (r.peak_emg != null && r.peak_emg > 0) allPeaks.push(r.peak_emg);
            }

            for (let i = 1; i < reps.length; i++) {
              const prev = reps[i - 1];
              const curr = reps[i];
              if (prev.end_ms != null && curr.start_ms != null) {
                sumRestTime += curr.start_ms - prev.end_ms;
                restCount++;
              }
            }

            const f = nextFlare[st.id];
            if (f && Math.abs(f.maxDev) > maxFlareDeg) maxFlareDeg = Math.abs(f.maxDev);
          }

          const minRecv = sqliteSets.reduce<number | null>((acc, st) => {
            const samples = listSamplesForSet(st.id, 5000);
            const mn = samples.reduce<number | null>((a, s) => {
              const r = s.received_at ?? null;
              if (r == null) return a;
              return a == null || r < a ? r : a;
            }, null);
            return acc == null ? mn : mn != null && mn < acc ? mn : acc;
          }, null);
          const maxRecv = sqliteSets.reduce<number | null>((acc, st) => {
            const samples = listSamplesForSet(st.id, 5000);
            const mx = samples.reduce<number | null>((a, s) => {
              const r = s.received_at ?? null;
              if (r == null) return a;
              return a == null || r > a ? r : a;
            }, null);
            return acc == null ? mx : mx != null && mx > acc ? mx : acc;
          }, null);
          if (minRecv != null && maxRecv != null) {
            totalDurationMs = maxRecv - minRecv;
          }

          let fatigueIndexPct: number | null = null;
          if (allPeaks.length >= 2) {
            const first = allPeaks.slice(0, Math.ceil(allPeaks.length / 4)).reduce((a, b) => a + b, 0) / Math.ceil(allPeaks.length / 4);
            const last = allPeaks.slice(-Math.ceil(allPeaks.length / 4)).reduce((a, b) => a + b, 0) / Math.ceil(allPeaks.length / 4);
            fatigueIndexPct = Math.round(((first - last) / first) * 100);
          }

          if (!cancelled) {
            setSets(mappedSets);
            setSetDuration(nextDur);
            setSetFlare(nextFlare);
            setSessionAnalytics({
              totalReps,
              avgRepTimeMs: repTimeCount > 0 ? sumRepTime / repTimeCount : 0,
              avgRestTimeMs: restCount > 0 ? sumRestTime / restCount : 0,
              maxFlareDeg,
              fatigueIndexPct,
              totalDurationMs,
            });
            setLoading(false);
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
  }, [sessionId, isSqlite, title, user?.id]);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
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

      {/* Shoulder flare banner */}
      {isSqlite && Object.values(setFlare).some((f) => f.detected) && (
        <View style={styles.flareBanner}>
          <Ionicons name="warning" size={16} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={styles.flareBannerTitle}>Shoulder Flare Detected</Text>
            <Text style={styles.flareBannerSub}>
              {sets
                .filter((st) => setFlare[st.id]?.detected)
                .map((st) => {
                  const dev = setFlare[st.id].maxDev;
                  return `${st.label?.trim() || `Set ${sets.indexOf(st) + 1}`} (${Math.abs(dev).toFixed(1)}\u00B0)`;
                })
                .join("  \u2022  ")}
            </Text>
          </View>
        </View>
      )}

      {loading ? (
        <View style={{ paddingHorizontal: 20, paddingTop: 16, alignItems: "center" }}>
          <ActivityIndicator />
          <Text
            variant="bodySmall"
            style={{ marginTop: 10, color: colors.onSurfaceVariant }}
          >
            Loading sets...
          </Text>
        </View>
      ) : errorMsg ? (
        <View style={{ padding: 20 }}>
          <Text variant="titleSmall" style={{ color: colors.onSurface }}>
            Couldn&apos;t load sets
          </Text>
          <Text
            variant="bodySmall"
            style={{ marginTop: 6, color: colors.onSurfaceVariant }}
          >
            {errorMsg}
          </Text>
        </View>
      ) : sets.length === 0 ? (
        <View style={{ padding: 20 }}>
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
          {/* Session Analytics (SQLite only) */}
          {isSqlite && sessionAnalytics && (
            <Card style={styles.analyticsCard} mode="outlined">
              <Card.Content>
                <Text variant="titleMedium" style={{ color: colors.onSurface, fontWeight: "700", marginBottom: 12 }}>
                  Session Analytics
                </Text>
                <View style={styles.analyticsGrid}>
                  <View style={styles.analyticsItem}>
                    <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant }}>Total Reps</Text>
                    <Text variant="titleMedium" style={{ color: colors.onSurface, fontWeight: "800" }}>
                      {sessionAnalytics.totalReps}
                    </Text>
                  </View>
                  <View style={styles.analyticsItem}>
                    <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant }}>Duration</Text>
                    <Text variant="titleMedium" style={{ color: colors.onSurface, fontWeight: "800" }}>
                      {formatDurationFromMs(sessionAnalytics.totalDurationMs)}
                    </Text>
                  </View>
                  <View style={styles.analyticsItem}>
                    <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant }}>Avg Rep Time</Text>
                    <Text variant="titleMedium" style={{ color: colors.onSurface, fontWeight: "800" }}>
                      {sessionAnalytics.avgRepTimeMs > 0
                        ? `${(sessionAnalytics.avgRepTimeMs / 1000).toFixed(1)}s`
                        : "\u2014"}
                    </Text>
                  </View>
                  <View style={styles.analyticsItem}>
                    <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant }}>Avg Rest</Text>
                    <Text variant="titleMedium" style={{ color: colors.onSurface, fontWeight: "800" }}>
                      {sessionAnalytics.avgRestTimeMs > 0
                        ? `${(sessionAnalytics.avgRestTimeMs / 1000).toFixed(0)}s`
                        : "\u2014"}
                    </Text>
                  </View>
                  <View style={styles.analyticsItem}>
                    <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant }}>Max Flare</Text>
                    <Text
                      variant="titleMedium"
                      style={{
                        color: sessionAnalytics.maxFlareDeg > FLARE_THRESHOLD ? "#dc2626" : colors.onSurface,
                        fontWeight: "800",
                      }}
                    >
                      {sessionAnalytics.maxFlareDeg.toFixed(0)}\u00B0
                    </Text>
                  </View>
                  <View style={styles.analyticsItem}>
                    <Text variant="labelSmall" style={{ color: colors.onSurfaceVariant }}>Fatigue Index</Text>
                    <Text
                      variant="titleMedium"
                      style={{
                        color:
                          sessionAnalytics.fatigueIndexPct != null && sessionAnalytics.fatigueIndexPct > HIGH_FATIGUE_PCT
                            ? "#dc2626"
                            : colors.onSurface,
                        fontWeight: "800",
                      }}
                    >
                      {sessionAnalytics.fatigueIndexPct != null ? `${sessionAnalytics.fatigueIndexPct}%` : "\u2014"}
                    </Text>
                  </View>
                </View>
              </Card.Content>
            </Card>
          )}

          {/* Dynamic Recommendations */}
          {isSqlite && sessionAnalytics && (
            <Card style={styles.recommendationsCard} mode="outlined">
              <Card.Content>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <Ionicons name="bulb-outline" size={18} color={colors.primary} />
                  <Text variant="titleMedium" style={{ color: colors.onSurface, fontWeight: "700" }}>
                    Recommendations
                  </Text>
                </View>
                {getRecommendations(sessionAnalytics).map((tip, i) => (
                  <View key={i} style={i > 0 ? styles.recommendationItem : undefined}>
                    <Text variant="bodySmall" style={{ color: colors.onSurface }}>{tip}</Text>
                  </View>
                ))}
              </Card.Content>
            </Card>
          )}

          {/* Sets list */}
          {sets.map((st, idx) => {
            const displayName = st.label?.trim() || `Set ${idx + 1}`;
            const flare = setFlare[st.id];

            return (
              <Card
                key={st.id}
                style={styles.card}
                mode="outlined"
                onPress={() =>
                  router.push({
                    pathname: "/set/[setId]" as const,
                    params: {
                      setId: st.id,
                      source: isSqlite ? "sqlite" : "supabase",
                      label: (title as string) ?? undefined,
                    },
                  })
                }
              >
                <Card.Content>
                  <View style={styles.topRow}>
                    <View style={styles.inlineRow}>
                      <Feather name="calendar" size={14} color={colors.onSurfaceVariant} />
                      <Text
                        variant="labelMedium"
                        style={{ color: colors.onSurfaceVariant }}
                      >
                        {st.created_at_text}
                      </Text>
                    </View>

                    <View style={styles.inlineRow}>
                      <Feather name="clock" size={14} color={colors.onSurfaceVariant} />
                      <Text
                        variant="labelMedium"
                        style={{ color: colors.onSurfaceVariant }}
                      >
                        {setDuration[st.id] ?? "\u2014"}
                      </Text>
                    </View>
                  </View>

                  {/* Shoulder flare alert */}
                  {isSqlite && flare?.detected && (
                    <View style={styles.flareAlert}>
                      <Ionicons name="warning" size={14} color="#fff" />
                      <Text style={styles.flareAlertText}>
                        Shoulder flare ({Math.abs(flare.maxDev).toFixed(1)}°)
                      </Text>
                    </View>
                  )}

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
  header: { paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  analyticsCard: { borderRadius: 16, marginBottom: 16 },
  analyticsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  analyticsItem: {
    width: "30%",
    minWidth: 80,
  },
  recommendationsCard: { borderRadius: 16, marginBottom: 16 },
  recommendationItem: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(128,128,128,0.3)",
  },
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
  flareAlert: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#dc2626",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 10,
    alignSelf: "flex-start",
  },
  flareAlertText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  flareBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#dc2626",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  flareBannerTitle: { color: "#fff", fontSize: 13, fontWeight: "700" },
  flareBannerSub: { color: "#fecaca", fontSize: 12, marginTop: 2 },
});
