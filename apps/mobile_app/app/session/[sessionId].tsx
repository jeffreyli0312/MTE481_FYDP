import React, { useEffect, useState } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, Text, ActivityIndicator, Button } from "react-native-paper";
import { useLocalSearchParams, router, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { useAppTheme } from "../theme";

import {
  initBleDb,
  listSets as listSqliteSets,
  listSamplesForSet,
  getLatestCalibration,
} from "../sqlite/bleDb";
import { useAuth } from "../context/AuthContext";
import { movingAverageSmooth, emaSmooth } from "../utils/format";
import { exportSessionCsvs } from "../utils/exportCsv";

const FLARE_THRESHOLD = 45; // degrees

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
  const { user } = useAuth();

  const { sessionId, source, title } = useLocalSearchParams<{
    sessionId: string;
    source?: string;
    title?: string;
  }>();

  const isSqlite = source === "sqlite";

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrMsg] = useState<string | null>(null);
  const [mvcValue, setMvcValue] = useState(0);

  const [sets, setSets] = useState<DisplaySetRow[]>([]);
  const [setDuration, setSetDuration] = useState<Record<string, string>>({});
  const [setFlare, setSetFlare] = useState<Record<string, { detected: boolean; maxDev: number; baselineYaw: number; absoluteMaxDevYaw: number }>>({});
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    if (sets.length === 0) return;
    setExporting(true);
    try {
      const setsInfo = sets.map((st, idx) => ({
        id: st.id,
        label: st.label?.trim() || `Set_${idx + 1}`,
      }));
      await exportSessionCsvs(
        setsInfo,
        user?.id,
        (title as string) ?? "Bench Press",
      );
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadSets() {
      setLoading(true);
      setErrMsg(null);

      try {
        if (!sessionId) throw new Error("Missing sessionId");

        if (isSqlite) {
          initBleDb();

          let mvc = 0;
          if (user?.id) {
            const cal = getLatestCalibration(user.id, (title as string) ?? "Bench Press");
            if (cal) { mvc = cal.mvc_value; if (!cancelled) setMvcValue(mvc); }
          }

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

          if (!cancelled) {
            setSets(mappedSets);
            setSetDuration(nextDur);
            setSetFlare(nextFlare);
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
  }, [sessionId, isSqlite]);

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
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
          <Text
            variant="bodySmall"
            style={{ color: colors.onSurfaceVariant }}
          >
            Tap a set to view charts
          </Text>
          {isSqlite && !loading && sets.length > 0 && (
            <Button
              mode="outlined"
              onPress={handleExport}
              loading={exporting}
              disabled={exporting}
              icon="download"
              compact
              style={{ borderRadius: 8 }}
              labelStyle={{ fontSize: 12 }}
            >
              Export CSV
            </Button>
          )}
        </View>
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
                      ...(mvcValue > 0 ? { mvcValue: String(mvcValue) } : {}),
                    },
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
