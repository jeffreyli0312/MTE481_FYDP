import React from "react";
import { View, StyleSheet } from "react-native";
import { Card, Text, Button } from "react-native-paper";
import { Feather } from "@expo/vector-icons";
import { useAppTheme } from "../theme";
import { useAuth } from "../context/AuthContext";
import { formatDateShort, formatMinSec } from "../utils/format";
import { useLocalSessions } from "../hooks/useLocalSessions";
import BackButton from "./BackButton";
import ListState from "./ListState";

interface ExerciseOverviewProps {
  exerciseName: string;
  onBack: () => void;
  onStartNewSession: () => void;
}

export default function ExerciseOverview({
  exerciseName,
  onBack,
  onStartNewSession,
}: ExerciseOverviewProps) {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const { sessions, loading, error } = useLocalSessions(user?.id);

  return (
    <>
      <BackButton onPress={onBack} label="Back to Home" />

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
          ? "Loading sessions..."
          : `${sessions.length} sessions completed`}
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

      <Text
        variant="titleMedium"
        style={{ color: colors.onSurface, marginTop: 18 }}
      >
        Previous Sessions
      </Text>

      <ListState
        loading={loading}
        error={error}
        empty={sessions.length === 0}
        emptyMessage="No sessions yet. Start your first session to begin tracking!"
      >
        {sessions.map((s) => (
          <Card key={s.id} style={styles.sessionCard} mode="outlined">
            <Card.Content>
              <View style={styles.sessionRow}>
                <View style={styles.inlineRow}>
                  <Feather
                    name="calendar"
                    size={14}
                    color={colors.onSurfaceVariant}
                  />
                  <Text
                    variant="labelMedium"
                    style={{ color: colors.onSurface, fontWeight: "700" }}
                  >
                    {s.startedAtMs
                      ? formatDateShort(new Date(s.startedAtMs).toISOString())
                      : "\u2014"}
                  </Text>
                </View>

                <View style={styles.inlineRow}>
                  <Feather
                    name="clock"
                    size={14}
                    color={colors.onSurfaceVariant}
                  />
                  <Text
                    variant="labelMedium"
                    style={{ color: colors.onSurface, fontWeight: "700" }}
                  >
                    {formatMinSec(Math.floor(s.durationMs / 1000))}
                  </Text>
                </View>
              </View>

              <View style={styles.sessionStats}>
                <View>
                  <Text
                    variant="headlineSmall"
                    style={{ color: colors.onSurface, fontWeight: "900" }}
                  >
                    {s.setCount}
                  </Text>
                  <Text
                    variant="labelMedium"
                    style={{ color: colors.onSurfaceVariant }}
                  >
                    Sets
                  </Text>
                </View>

                <View style={{ alignItems: "flex-end" }}>
                  <View style={styles.inlineRow}>
                    <Feather
                      name="trending-up"
                      size={14}
                      color={colors.success}
                    />
                    <Text
                      variant="titleSmall"
                      style={{ color: colors.success, fontWeight: "900" }}
                    >
                      {s.avgEmg.toFixed(1)}
                    </Text>
                  </View>
                  <Text
                    variant="labelMedium"
                    style={{ color: colors.onSurfaceVariant }}
                  >
                    Avg EMG
                  </Text>
                </View>
              </View>
            </Card.Content>
          </Card>
        ))}
      </ListState>
    </>
  );
}

const styles = StyleSheet.create({
  primaryBtn: {
    marginTop: 16,
    borderRadius: 10,
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
