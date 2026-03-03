import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Card, Text, Button } from "react-native-paper";
import { Feather } from "@expo/vector-icons";
import { useAppTheme } from "../theme";
import { formatDateShort, formatMinSec } from "../utils/format";
import type { SessionRecord } from "../types/workout";

interface ExerciseOverviewProps {
  exerciseName: string;
  sessions: SessionRecord[];
  onBack: () => void;
  onStartNewSession: () => void;
}

export default function ExerciseOverview({
  exerciseName,
  sessions,
  onBack,
  onStartNewSession,
}: ExerciseOverviewProps) {
  const { colors } = useAppTheme();

  return (
    <>
      <Pressable onPress={onBack} style={styles.backRow}>
        <Feather name="arrow-left" size={18} color={colors.onSurface} />
        <Text variant="labelLarge" style={{ color: colors.onSurface }}>
          Back to Home
        </Text>
      </Pressable>

      <Text variant="headlineMedium" style={{ color: colors.onSurface, fontWeight: "900", marginTop: 6 }}>
        {exerciseName}
      </Text>
      <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>
        {sessions.length} sessions completed
      </Text>

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

      <Text variant="titleMedium" style={{ color: colors.onSurface, marginTop: 18 }}>
        Previous Sessions
      </Text>

      {sessions.length === 0 ? (
        <Card style={[styles.infoCard, { borderColor: colors.infoBorder }]} mode="outlined">
          <Card.Content style={{ backgroundColor: colors.infoBg, borderRadius: 12 }}>
            <Text variant="bodySmall" style={{ color: colors.infoText, textAlign: "center" }}>
              No sessions yet. Start your first session to begin tracking!
            </Text>
          </Card.Content>
        </Card>
      ) : (
        sessions.map((s) => (
          <Card key={s.id} style={styles.sessionCard} mode="outlined">
            <Card.Content>
              <View style={styles.sessionRow}>
                <View style={styles.inlineRow}>
                  <Feather name="calendar" size={14} color={colors.onSurfaceVariant} />
                  <Text variant="labelMedium" style={{ color: colors.onSurface, fontWeight: "700" }}>
                    {formatDateShort(s.dateISO)}
                  </Text>
                </View>
                <View style={styles.inlineRow}>
                  <Feather name="clock" size={14} color={colors.onSurfaceVariant} />
                  <Text variant="labelMedium" style={{ color: colors.onSurface, fontWeight: "700" }}>
                    {formatMinSec(s.durationSec)}
                  </Text>
                </View>
              </View>

              <View style={styles.sessionStats}>
                <View>
                  <Text variant="headlineSmall" style={{ color: colors.onSurface, fontWeight: "900" }}>
                    {s.setsCount}
                  </Text>
                  <Text variant="labelMedium" style={{ color: colors.onSurfaceVariant }}>
                    Sets
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <View style={styles.inlineRow}>
                    <Feather name="trending-up" size={14} color={colors.success} />
                    <Text variant="titleSmall" style={{ color: colors.success, fontWeight: "900" }}>
                      {s.avgForceN.toFixed(1)}N
                    </Text>
                  </View>
                  <Text variant="labelMedium" style={{ color: colors.onSurfaceVariant }}>
                    Avg Force
                  </Text>
                </View>
              </View>
            </Card.Content>
          </Card>
        ))
      )}
    </>
  );
}

const styles = StyleSheet.create({
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  primaryBtn: {
    marginTop: 16,
    borderRadius: 10,
  },
  infoCard: {
    marginTop: 10,
    borderRadius: 12,
  },
  sessionCard: {
    marginTop: 10,
    borderRadius: 12,
  },
  sessionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sessionStats: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
});
