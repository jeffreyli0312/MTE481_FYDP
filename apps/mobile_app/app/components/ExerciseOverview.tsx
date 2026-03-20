import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Card, Text, Button } from "react-native-paper";
import { Feather } from "@expo/vector-icons";
import { useAppTheme } from "../theme";
import { MVC_VALUES } from "../sqlite/bleDb";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ExerciseOverviewProps {
  exerciseName: string;
  onBack: () => void;
  onStartNewSession: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ExerciseOverview({
  exerciseName,
  onBack,
  onStartNewSession,
}: ExerciseOverviewProps) {
  const { colors } = useAppTheme();

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
        style={{ color: colors.onSurface, fontWeight: "900", marginTop: 6, marginBottom: 16 }}
      >
        {exerciseName}
      </Text>

      {/* Hardcoded calibration (see bleDb.ts – uncomment USE_TEST_CALIBRATION for sensor testing) */}
      <Card style={styles.mvcCard} mode="outlined">
        <Card.Content>
          <View style={styles.topRow}>
            <Text
              variant="titleSmall"
              style={{ color: colors.onSurface, fontWeight: "900" }}
            >
              EMG Calibration
            </Text>
            <Feather name="zap" size={16} color={colors.primary} />
          </View>
          <Text
            variant="bodySmall"
            style={{ color: colors.onSurfaceVariant, marginTop: 6 }}
          >
            Per-channel MVC values:
          </Text>
          <View style={{ marginTop: 8, gap: 4 }}>
            {(["emg_left_tricep", "emg_left_pec", "emg_right_tricep", "emg_right_pec"] as const).map((ch) => (
              <Text key={ch} variant="labelMedium" style={{ color: colors.onSurface }}>
                {CHANNEL_LABELS[ch]}: {MVC_VALUES[ch].toFixed(4)}
              </Text>
            ))}
          </View>
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
