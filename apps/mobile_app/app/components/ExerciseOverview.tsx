import React, { useEffect, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Card, Text, Button, ActivityIndicator } from "react-native-paper";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAppTheme } from "../theme";
import { useAuth } from "../context/AuthContext";
import {
  initBleDb,
  listSessions,
  listSets,
  listSamplesForSet,
  insertSession,
  insertSet,
  insertSample,
  clearBleDb,
} from "../sqlite/bleDb";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ExerciseOverviewProps {
  exerciseName: string;
  onBack: () => void;
  onStartNewSession: () => void;
}

type SessionCard = {
  id: string;
  dateText: string;
  setCount: number;
  durationText: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateFromMs(ms: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

/** Gaussian spike shape */
function gaussian(x: number, center: number, width: number): number {
  return Math.exp(-((x - center) ** 2) / (2 * width ** 2));
}

/** Seed one fake set (10 rep spikes) into local SQLite */
function seedFakeSetIntoDb(userId: string) {
  initBleDb();

  const sessions = listSessions(userId);
  let sessionId: string;

  if (sessions.length === 0) {
    sessionId = `sess_${userId}_${Date.now()}`;
    insertSession({ sessionId, userId, deviceId: "FAKE_DEVICE", startedAt: Date.now() });
  } else {
    sessionId = sessions[0].id;
  }

  const now = Date.now();
  const setId = `set_${sessionId}_${now}`;
  const setNumber = listSets(sessionId).length + 1;

  insertSet({ setId, sessionId, userId, label: `Set ${setNumber}`, startedAt: now });

  const REP_MS = 2000;
  const INTERVAL_MS = 50;
  const NUM_REPS = 10;
  const TOTAL = (REP_MS * NUM_REPS) / INTERVAL_MS;
  const BASELINE = 30;
  const PEAK = 550 + Math.random() * 250;

  for (let i = 0; i < TOTAL; i++) {
    const t_ms = i * INTERVAL_MS;
    const tInRep = (t_ms % REP_MS) / REP_MS;
    const spike = gaussian(tInRep, 0.4, 0.12);
    const noise = (Math.random() - 0.5) * 25;
    const emg = Math.max(0, Math.round(BASELINE + (PEAK - BASELINE) * spike + noise));

    insertSample({
      userId,
      sessionId,
      setId,
      parsed: {
        t_ms,
        emg_left_tricep: emg,
        emg_left_pec: Math.round(emg * 0.7),
        emg_right_tricep: Math.round(emg * 0.85),
        emg_right_pec: Math.round(emg * 0.65),
        l_accx: 0, l_accy: 0, l_accz: 980,
        l_roll: 0, l_pitch: 0, l_yaw: 0,
        r_accx: 0, r_accy: 0, r_accz: 980,
        r_roll: 0, r_pitch: 0, r_yaw: 0,
      },
      receivedAt: now + t_ms,
    });
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ExerciseOverview({
  exerciseName,
  onBack,
  onStartNewSession,
}: ExerciseOverviewProps) {
  const { colors } = useAppTheme();
  const { user } = useAuth();

  const [sessionCards, setSessionCards] = useState<SessionCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  function refresh() {
    if (!user?.id) return;
    setLoading(true);
    try {
      initBleDb();
      const sessions = listSessions(user.id).slice().reverse(); // oldest first

      const cards: SessionCard[] = sessions.map((sess) => {
        const sets = listSets(sess.id);
        let minAt: number | null = null;
        let maxAt: number | null = null;

        for (const st of sets) {
          for (const smp of listSamplesForSet(st.id, 500)) {
            const ra = smp.received_at ?? null;
            if (ra == null) continue;
            if (minAt == null || ra < minAt) minAt = ra;
            if (maxAt == null || ra > maxAt) maxAt = ra;
          }
        }

        return {
          id: sess.id,
          dateText: formatDateFromMs(sess.started_at ?? null),
          setCount: sets.length,
          durationText:
            minAt != null && maxAt != null ? formatDuration(maxAt - minAt) : "—",
        };
      });

      setSessionCards(cards);
    } catch (e) {
      console.error("ExerciseOverview load error", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [user?.id]);

  function handleSeedFakeSet() {
    if (!user?.id) return;
    setSeeding(true);
    try {
      seedFakeSetIntoDb(user.id);
      refresh();
    } catch (e) {
      console.error("Seed error", e);
    } finally {
      setSeeding(false);
    }
  }

  return (
    <>
      {/* Back */}
      <Pressable onPress={onBack} style={styles.backRow}>
        <Feather name="arrow-left" size={18} color={colors.onSurface} />
        <Text variant="labelLarge" style={{ color: colors.onSurface }}>
          Back to Home
        </Text>
      </Pressable>

      {/* Title */}
      <Text variant="headlineMedium" style={{ color: colors.onSurface, fontWeight: "900", marginTop: 6 }}>
        {exerciseName}
      </Text>
      <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>
        {loading ? "Loading..." : `${sessionCards.length} session${sessionCards.length === 1 ? "" : "s"}`}
      </Text>

      {/* Start session */}
      <Button
        mode="contained"
        onPress={onStartNewSession}
        icon="plus"
        style={styles.primaryBtn}
        buttonColor={colors.primary}
        textColor={colors.onPrimary}
      >
        Start New Session
      </Button>

      {/* DEV seed */}
      <Button
        mode="outlined"
        onPress={handleSeedFakeSet}
        loading={seeding}
        disabled={seeding}
        icon="database-plus"
        style={styles.seedBtn}
        textColor={colors.onSurfaceVariant}
      >
        [DEV] Add Fake Set
      </Button>

      {/* DEV clear */}
      <Button
        mode="outlined"
        onPress={() => { clearBleDb(); refresh(); }}
        icon="database-remove"
        style={[styles.seedBtn, { borderColor: "rgba(239,68,68,0.5)" }]}
        textColor="rgb(239,68,68)"
      >
        [DEV] Clear DB
      </Button>

      {/* Session cards */}
      {loading ? (
        <View style={{ alignItems: "center", marginTop: 24 }}>
          <ActivityIndicator />
        </View>
      ) : sessionCards.length === 0 ? (
        <Card style={styles.emptyCard} mode="outlined">
          <Card.Content style={{ alignItems: "center", paddingVertical: 24 }}>
            <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>
              No sessions yet.{"\n"}Start a session or add fake data above.
            </Text>
          </Card.Content>
        </Card>
      ) : (
        sessionCards.map((s, idx) => (
          <Card
            key={s.id}
            style={styles.sessionCard}
            mode="outlined"
            onPress={() =>
              router.push({
                pathname: "/session/[sessionId]",
                params: { sessionId: s.id, source: "sqlite", title: `Session ${idx + 1}` },
              })
            }
          >
            <Card.Content>
              <View style={styles.topRow}>
                <View style={styles.inlineRow}>
                  <Text style={{ color: colors.onSurfaceVariant }}>📅</Text>
                  <Text variant="labelMedium" style={{ color: colors.onSurfaceVariant }}>
                    {s.dateText}
                  </Text>
                </View>
                <View style={styles.inlineRow}>
                  <Text style={{ color: colors.onSurfaceVariant }}>🕒</Text>
                  <Text variant="labelMedium" style={{ color: colors.onSurfaceVariant }}>
                    {s.durationText}
                  </Text>
                </View>
              </View>
              <View style={{ marginTop: 10 }}>
                <Text variant="headlineSmall" style={{ color: colors.onSurface, fontWeight: "800" }}>
                  Session {idx + 1}
                </Text>
                <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>
                  {s.setCount} {s.setCount === 1 ? "set" : "sets"} · tap to view chart
                </Text>
              </View>
            </Card.Content>
          </Card>
        ))
      )}
    </>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  primaryBtn: { marginTop: 16, borderRadius: 10 },
  seedBtn: { marginTop: 10, borderRadius: 10, borderStyle: "dashed" },
  emptyCard: { marginTop: 20, borderRadius: 14 },
  sessionCard: { borderRadius: 16, marginTop: 14 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  inlineRow: { flexDirection: "row", alignItems: "center", gap: 6 },
});