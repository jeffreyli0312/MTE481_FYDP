import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Card, Text, Button, TextInput } from "react-native-paper";
import { Feather } from "@expo/vector-icons";
import { useAppTheme } from "../theme";
import { useAuth } from "../context/AuthContext";
import {
  getMvcValues,
  saveCalibration,
  type EmgChannel,
} from "../sqlite/bleDb";

const EMG_CHANNELS: EmgChannel[] = [
  "emg_left_tricep",
  "emg_left_pec",
  "emg_right_tricep",
  "emg_right_pec",
];

const CHANNEL_LABELS: Record<EmgChannel, string> = {
  emg_left_tricep: "Left Tricep",
  emg_left_pec: "Left Pec",
  emg_right_tricep: "Right Tricep",
  emg_right_pec: "Right Pec",
};

function emptyDrafts(): Record<EmgChannel, string> {
  return {
    emg_left_tricep: "",
    emg_left_pec: "",
    emg_right_tricep: "",
    emg_right_pec: "",
  };
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ExerciseOverviewProps {
  exerciseName: string;
  onBack: () => void;
  onStartNewSession: () => void;
  onStartCalibration?: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ExerciseOverview({
  exerciseName,
  onBack,
  onStartNewSession,
  onStartCalibration,
}: ExerciseOverviewProps) {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const [calibrationExpanded, setCalibrationExpanded] = useState(false);
  const [mvcRefreshKey, setMvcRefreshKey] = useState(0);
  const [draftMvc, setDraftMvc] = useState<Record<EmgChannel, string>>(emptyDrafts);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const userId = user?.id ?? "local-user";
  const mvcValues = getMvcValues(userId, exerciseName);

  const syncDraftsFromDb = useCallback(() => {
    const v = getMvcValues(userId, exerciseName);
    const next = emptyDrafts();
    for (const ch of EMG_CHANNELS) {
      next[ch] = v[ch] === 0 ? "" : String(v[ch]);
    }
    setDraftMvc(next);
  }, [userId, exerciseName]);

  useEffect(() => {
    if (calibrationExpanded) syncDraftsFromDb();
  }, [calibrationExpanded, syncDraftsFromDb, mvcRefreshKey]);

  const handleResetDrafts = useCallback(() => {
    setSaveError(null);
    setSaveMessage(null);
    syncDraftsFromDb();
  }, [syncDraftsFromDb]);

  const handleSaveMvc = useCallback(() => {
    setSaveError(null);
    setSaveMessage(null);
    const parsed: Record<EmgChannel, number> = {} as Record<EmgChannel, number>;
    for (const ch of EMG_CHANNELS) {
      const raw = draftMvc[ch].trim().replace(",", ".");
      if (raw === "") {
        parsed[ch] = 0;
        continue;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        setSaveError(`Invalid MVC for ${CHANNEL_LABELS[ch]} (use a non‑negative number).`);
        return;
      }
      parsed[ch] = n;
    }
    setSaving(true);
    try {
      for (const ch of EMG_CHANNELS) {
        saveCalibration(userId, exerciseName, ch, parsed[ch]);
      }
      setMvcRefreshKey((k) => k + 1);
      setSaveMessage("Saved to database.");
    } finally {
      setSaving(false);
    }
  }, [draftMvc, userId, exerciseName]);

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

      {/* EMG Calibration */}
      <Card style={styles.mvcCard} mode="outlined">
        <Card.Content style={styles.mvcContent}>
          <View style={styles.topRow}>
            <Pressable
              onPress={() => setCalibrationExpanded((v) => !v)}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Text
                variant="titleSmall"
                style={{ color: colors.onSurface, fontWeight: "900" }}
              >
                EMG Calibration
              </Text>
              <Feather
                name={calibrationExpanded ? "chevron-up" : "chevron-down"}
                size={18}
                color={colors.onSurfaceVariant}
              />
            </Pressable>
            {onStartCalibration && (
              <Button
                mode="contained"
                onPress={onStartCalibration}
                icon="tune"
                compact
                buttonColor={colors.primary}
                textColor={colors.onPrimary}
              >
                Calibrate
              </Button>
            )}
          </View>
          {calibrationExpanded && (
            <>
              <Text
                variant="bodySmall"
                style={{ color: colors.onSurfaceVariant, marginTop: 6 }}
              >
                Per-channel MVC (peak − baseline RMS). Edit and save, or use Calibrate to measure.
              </Text>
              <View style={{ marginTop: 10, gap: 10 }}>
                {EMG_CHANNELS.map((ch) => (
                  <View key={ch}>
                    <Text
                      variant="labelMedium"
                      style={{ color: colors.onSurface, marginBottom: 4 }}
                    >
                      {CHANNEL_LABELS[ch]}
                      <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>
                        {" "}
                        (saved: {mvcValues[ch].toFixed(4)})
                      </Text>
                    </Text>
                    <TextInput
                      mode="outlined"
                      dense
                      value={draftMvc[ch]}
                      onChangeText={(t) => {
                        setSaveMessage(null);
                        setDraftMvc((prev) => ({ ...prev, [ch]: t }));
                      }}
                      placeholder="0 = not set"
                      keyboardType="decimal-pad"
                      style={{ backgroundColor: colors.surface }}
                    />
                  </View>
                ))}
              </View>
              {saveError ? (
                <Text variant="bodySmall" style={{ color: colors.error, marginTop: 8 }}>
                  {saveError}
                </Text>
              ) : null}
              {saveMessage && !saveError ? (
                <Text variant="bodySmall" style={{ color: colors.success, marginTop: 8 }}>
                  {saveMessage}
                </Text>
              ) : null}
              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                <Button
                  mode="outlined"
                  onPress={handleResetDrafts}
                  disabled={saving}
                  style={{ flex: 1 }}
                >
                  Reset
                </Button>
                <Button
                  mode="contained"
                  onPress={handleSaveMvc}
                  loading={saving}
                  disabled={saving}
                  style={{ flex: 1 }}
                  buttonColor={colors.primary}
                  textColor={colors.onPrimary}
                >
                  Save to DB
                </Button>
              </View>
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
  mvcCard: { borderRadius: 14, marginTop: 16, overflow: "hidden" },
  mvcContent: { paddingVertical: 10, paddingHorizontal: 14 },
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
