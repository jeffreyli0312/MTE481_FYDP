import React, { useEffect, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Card, Text, Button } from "react-native-paper";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAppTheme } from "../theme";
import { useAuth } from "../context/AuthContext";
import {
  initBleDb,
  listSessions,
  listSets,
  listSamplesForSet,
  getLatestCalibration,
  type CalibrationRow,
} from "../sqlite/bleDb";
import MvcCalibrationView from "./MvcCalibrationView";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ExerciseOverviewProps {
  exerciseName: string;
  onBack: () => void;
  onStartNewSession: () => void;
}

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
  const [calibrationMode, setCalibrationMode] = useState(false);
  const [calibration, setCalibration] = useState<CalibrationRow | null>(null);

  function loadCalibration() {
    if (!user?.id) return;
    const cal = getLatestCalibration(user.id, exerciseName);
    setCalibration(cal);
  }

  function refresh() {
    if (!user?.id) return;
    setLoading(true);
    try {
      initBleDb();
      const sessions = listSessions(user.id, exerciseName).slice().reverse(); // oldest first

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
            minAt != null && maxAt != null
              ? formatDuration(maxAt - minAt)
              : "—",
        };
      });

      setSessionCards(cards);
    } catch (e) {
      console.error("ExerciseOverview load error", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    loadCalibration();
  }, [user?.id]);

  if (calibrationMode) {
    return (
      <MvcCalibrationView
        exerciseName={exerciseName}
        onBack={() => setCalibrationMode(false)}
        onComplete={() => {
          setCalibrationMode(false);
          loadCalibration();
        }}
      />
    );
  }

  const CHANNEL_LABELS: Record<string, string> = {
    emg_left_tricep: "Left Tricep",
    emg_left_pec: "Left Pec",
    emg_right_tricep: "Right Tricep",
    emg_right_pec: "Right Pec",
  };

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
      <Text
        variant="headlineMedium"
        style={{ color: colors.onSurface, fontWeight: "900", marginTop: 6 }}
      >
        {exerciseName}
      </Text>
      <Text
        variant="bodyMedium"
        style={{ color: colors.onSurfaceVariant, marginTop: 4 }}
      >
        {loading
          ? "Loading..."
          : `${sessionCards.length} session${sessionCards.length === 1 ? "" : "s"}`}
      </Text>

      {/* MVC Calibration Card */}
      <Card style={styles.mvcCard} mode="outlined">
        <Card.Content>
          <View style={styles.topRow}>
            <Text
              variant="titleSmall"
              style={{ color: colors.onSurface, fontWeight: "900" }}
            >
              MVC Calibration
            </Text>
            <Feather name="zap" size={16} color={colors.primary} />
          </View>
          {calibration ? (
            <>
              <View style={{ marginTop: 8 }}>
                <Text
                  variant="bodySmall"
                  style={{ color: colors.onSurfaceVariant }}
                >
                  Channel:{" "}
                  {CHANNEL_LABELS[calibration.emg_channel] ??
                    calibration.emg_channel}
                </Text>
                <Text
                  variant="titleMedium"
                  style={{
                    color: colors.primary,
                    fontWeight: "900",
                    marginTop: 2,
                  }}
                >
                  MVC: {calibration.mvc_value.toFixed(4)}
                </Text>
                <Text
                  variant="labelSmall"
                  style={{ color: colors.onSurfaceVariant, marginTop: 2 }}
                >
                  Calibrated: {formatDateFromMs(calibration.calibrated_at)}
                </Text>
              </View>
              <Button
                mode="outlined"
                onPress={() => setCalibrationMode(true)}
                compact
                style={{ marginTop: 10, alignSelf: "flex-start" }}
                icon="refresh-cw"
              >
                Recalibrate
              </Button>
            </>
          ) : (
            <>
              <Text
                variant="bodySmall"
                style={{ color: colors.onSurfaceVariant, marginTop: 6 }}
              >
                Calibrate your MVC to normalize EMG data and enable rep
                counting.
              </Text>
              <Button
                mode="contained"
                onPress={() => setCalibrationMode(true)}
                icon="flash"
                style={{ marginTop: 10 }}
                buttonColor={colors.primary}
                textColor={colors.onPrimary}
              >
                Calibrate MVC
              </Button>
            </>
          )}
        </Card.Content>
      </Card>

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

      {/* Session cards */}
      {loading ? (
        <View style={{ alignItems: "center", marginTop: 24 }}>
          <ActivityIndicator />
        </View>
      ) : sessionCards.length === 0 ? (
        <Card style={styles.emptyCard} mode="outlined">
          <Card.Content style={{ alignItems: "center", paddingVertical: 24 }}>
            <Text
              variant="bodyMedium"
              style={{ color: colors.onSurfaceVariant }}
            >
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
                params: {
                  sessionId: s.id,
                  source: "sqlite",
                  title: `Session ${idx + 1}`,
                },
              })
            }
          >
            <Card.Content>
              <View style={styles.topRow}>
                <View style={styles.inlineRow}>
                  <Text style={{ color: colors.onSurfaceVariant }}>📅</Text>
                  <Text
                    variant="labelMedium"
                    style={{ color: colors.onSurfaceVariant }}
                  >
                    {s.dateText}
                  </Text>
                </View>
                <View style={styles.inlineRow}>
                  <Text style={{ color: colors.onSurfaceVariant }}>🕒</Text>
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
                  style={{ color: colors.onSurface, fontWeight: "800" }}
                >
                  Session {idx + 1}
                </Text>
                <Text
                  variant="bodySmall"
                  style={{ color: colors.onSurfaceVariant }}
                >
                  {s.setCount} {s.setCount === 1 ? "set" : "sets"} · tap to view
                  chart
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
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  mvcCard: { borderRadius: 16, marginTop: 16 },
  primaryBtn: { marginTop: 16, borderRadius: 10 },
  seedBtn: { marginTop: 10, borderRadius: 10, borderStyle: "dashed" },
  emptyCard: { marginTop: 20, borderRadius: 14 },
  sessionCard: { borderRadius: 16, marginTop: 14 },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  inlineRow: { flexDirection: "row", alignItems: "center", gap: 6 },
});
