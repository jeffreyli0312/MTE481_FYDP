import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  StatusBar,
} from "react-native";
import { Card, Text, ActivityIndicator } from "react-native-paper";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { useAppTheme } from "../theme";

type SetRow = {
  id: string;
  session_id: string;
  created_at: string;
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

function formatDurationFromMs(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return "\u2014";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s}s`;
}

export default function SessionSetsScreen() {
  const { colors, dark } = useAppTheme();

  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrMsg] = useState<string | null>(null);

  const [sets, setSets] = useState<SetRow[]>([]);
  const [setDuration, setSetDuration] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadSets() {
      setLoading(true);
      setErrMsg(null);

      try {
        if (!sessionId) throw new Error("Missing sessionId");

        const { data: setsData, error: setsErr } = await supabase
          .from("sets")
          .select("id, session_id, created_at, label")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true });

        if (setsErr) throw setsErr;

        const setRows = (setsData ?? []) as SetRow[];
        if (!cancelled) setSets(setRows);

        const setIds = setRows.map((s) => s.id);
        if (setIds.length === 0) {
          if (!cancelled) setLoading(false);
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
  }, [sessionId]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle={dark ? "light-content" : "dark-content"} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderColor: colors.outline }]}>
        <Pressable onPress={() => router.back()} style={styles.backRow}>
          <Ionicons name="arrow-back" size={18} color={colors.onSurface} />
          <Text variant="labelLarge" style={{ color: colors.onSurface }}>
            Back
          </Text>
        </Pressable>

        <Text variant="headlineSmall" style={{ color: colors.onSurface, marginTop: 8 }}>
          Sets
        </Text>
        <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant, marginTop: 2 }}>
          Tap a set to view charts
        </Text>
      </View>

      {loading ? (
        <View style={{ padding: 16, alignItems: "center" }}>
          <ActivityIndicator />
          <Text variant="bodySmall" style={{ marginTop: 10, color: colors.onSurfaceVariant }}>
            Loading sets...
          </Text>
        </View>
      ) : errorMsg ? (
        <View style={{ padding: 16 }}>
          <Text variant="titleSmall" style={{ color: colors.onSurface }}>
            Couldn't load sets
          </Text>
          <Text variant="bodySmall" style={{ marginTop: 6, color: colors.onSurfaceVariant }}>
            {errorMsg}
          </Text>
        </View>
      ) : sets.length === 0 ? (
        <View style={{ padding: 16 }}>
          <Text variant="titleSmall" style={{ color: colors.onSurface }}>
            No sets found
          </Text>
          <Text variant="bodySmall" style={{ marginTop: 6, color: colors.onSurfaceVariant }}>
            This session has no sets in the database yet.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
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
                    params: { setId: st.id },
                  })
                }
              >
                <Card.Content>
                  <View style={styles.topRow}>
                    <View style={styles.inlineRow}>
                      <Text style={{ color: colors.onSurfaceVariant }}>{"\uD83D\uDCC5"}</Text>
                      <Text variant="labelMedium" style={{ color: colors.onSurfaceVariant }}>
                        {formatDateOnly(st.created_at)}
                      </Text>
                    </View>

                    <View style={styles.inlineRow}>
                      <Text style={{ color: colors.onSurfaceVariant }}>{"\uD83D\uDD52"}</Text>
                      <Text variant="labelMedium" style={{ color: colors.onSurfaceVariant }}>
                        {setDuration[st.id] ?? "\u2014"}
                      </Text>
                    </View>
                  </View>

                  <View style={{ marginTop: 10 }}>
                    <Text variant="headlineSmall" style={{ color: colors.onSurface, fontWeight: "800" }}>
                      {displayName}
                    </Text>
                    <Text variant="bodySmall" style={{ marginTop: 2, color: colors.onSurfaceVariant }}>
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
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  inlineRow: { flexDirection: "row", alignItems: "center", gap: 8 },
});
