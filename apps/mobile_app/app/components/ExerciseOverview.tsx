import React, { useEffect, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Card, Text, Button } from "react-native-paper";
import { Feather } from "@expo/vector-icons";
import { useAppTheme } from "../theme";
import { useAuth } from "../context/AuthContext";
import {
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

// ─── Component ───────────────────────────────────────────────────────────────

export default function ExerciseOverview({
  exerciseName,
  onBack,
  onStartNewSession,
}: ExerciseOverviewProps) {
  const { colors } = useAppTheme();
  const { user } = useAuth();

  const [calibrationMode, setCalibrationMode] = useState(false);
  const [calibration, setCalibration] = useState<CalibrationRow | null>(null);

  const loadCalibration = React.useCallback(() => {
    if (!user?.id) return;
    const cal = getLatestCalibration(user.id, exerciseName);
    setCalibration(cal);
  }, [user?.id, exerciseName]);

  useEffect(() => {
    loadCalibration();
  }, [loadCalibration]);

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
        style={{ color: colors.onSurface, fontWeight: "900", marginTop: 6, marginBottom: 16 }}
      >
        {exerciseName}
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
