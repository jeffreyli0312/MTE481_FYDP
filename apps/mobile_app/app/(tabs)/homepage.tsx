import React, { useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, Text, Button } from "react-native-paper";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "../context/AuthContext";
import { useAppTheme } from "../theme";
import SessionView from "../components/SessionView";
import ExerciseOverview from "../components/ExerciseOverview";
import type { Exercise, SessionRecord } from "../types/workout";

type ScreenMode = "home" | "exercise";
type ExerciseMode = "overview" | "session";

const AVAILABLE_EXERCISES: Exercise[] = [
  { id: "bench-press", name: "Bench Press", icon: "\uD83D\uDCAA" },
];

export default function HomePageScreen() {
  const { user, signOut } = useAuth();
  const { colors, dark } = useAppTheme();

  const username = user?.email?.split("@")[0] || "User";

  const [screenMode, setScreenMode] = useState<ScreenMode>("home");
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [exerciseMode, setExerciseMode] = useState<ExerciseMode>("overview");

  const [sessionsByExercise, setSessionsByExercise] = useState<
    Record<string, SessionRecord[]>
  >({});

  const { totalSessions, totalSets } = useMemo(() => {
    const allSessions = Object.values(sessionsByExercise).flat();
    return {
      totalSessions: allSessions.length,
      totalSets: allSessions.reduce((sum, s) => sum + (s.setsCount ?? 0), 0),
    };
  }, [sessionsByExercise]);

  const selectedExerciseId = selectedExercise?.id ?? "";
  const selectedExerciseName = selectedExercise?.name ?? "";
  // const savedSessionsForExercise = sessionsByExercise[selectedExerciseId] ?? [];

  async function handleLogout() {
    try {
      await signOut();
    } catch (e: any) {
      alert(e?.message ?? "Logout failed");
    }
  }

  function handleSelectExercise(exercise: Exercise) {
    setSelectedExercise(exercise);
    setExerciseMode("overview");
    setScreenMode("exercise");
  }

  function handleBackToHome() {
    setExerciseMode("overview");
    setSelectedExercise(null);
    setScreenMode("home");
  }

  function handleEndSession(session: SessionRecord) {
    setSessionsByExercise((prev) => {
      const existing = prev[selectedExerciseId] ?? [];
      return { ...prev, [selectedExerciseId]: [session, ...existing] };
    });
    setExerciseMode("overview");
    router.push({
      pathname: "/session/[sessionId]",
      params: {
        sessionId: session.id,
        source: "sqlite",
        title: selectedExerciseName,
      },
    });
  }

  // ─── Exercise page (overview or active session) ───
  if (screenMode === "exercise") {
    return (
      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar barStyle={dark ? "light-content" : "dark-content"} />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28 }}>
          {exerciseMode === "session" ? (
            <SessionView
              exerciseName={selectedExerciseName}
              onBack={() => setExerciseMode("overview")}
              onEndSession={handleEndSession}
            />
          ) : (
            <ExerciseOverview
              exerciseName={selectedExerciseName}
              onBack={handleBackToHome}
              onStartNewSession={() => setExerciseMode("session")}
            />
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── Home screen ───
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle={dark ? "light-content" : "dark-content"} />

      <Text variant="titleLarge" style={{ color: colors.onSurface, fontWeight: "bold", paddingBottom: 12, paddingHorizontal: 20 }}>
        Home
      </Text>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={[styles.headerContainer, { borderBottomColor: colors.outline }]}>
          <View>
            <Text variant="titleMedium" style={{ color: colors.onSurface }}>
              EVA: Gym Form Correction System
            </Text>
            <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>
              Welcome, {username}
            </Text>
          </View>

          <Button mode="outlined" onPress={handleLogout} compact textColor={colors.error}>
            Logout
          </Button>
        </View>

        {/* Welcome Card */}
        <Card style={styles.welcomeCard} mode="outlined">
          <Card.Content style={styles.welcomeContent}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primary }]}>
              <Feather name="activity" size={28} color="white" />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="titleMedium" style={{ color: colors.onSurface }}>
                Ready to Train?
              </Text>
              <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>
                Select an exercise to begin
              </Text>
            </View>
          </Card.Content>
        </Card>

        {/* Exercises */}
        <Text variant="titleMedium" style={{ color: colors.onSurface, marginBottom: 12, marginTop: 8 }}>
          Available Exercises
        </Text>

        {AVAILABLE_EXERCISES.map((exercise) => (
          <Card
            key={exercise.id}
            style={styles.exerciseCard}
            mode="outlined"
            onPress={() => handleSelectExercise(exercise)}
          >
            <Card.Content style={styles.exerciseContent}>
              <View style={styles.exerciseLeft}>
                <Text style={{ fontSize: 24, marginRight: 12 }}>{exercise.icon}</Text>
                <View>
                  <Text variant="titleSmall" style={{ color: colors.onSurface }}>
                    {exercise.name}
                  </Text>
                  <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>
                    Tap to view sessions
                  </Text>
                </View>
              </View>
              <Feather name="chevron-right" size={20} color={colors.onSurfaceVariant} />
            </Card.Content>
          </Card>
        ))}

        {/* Stats Card */}
        <Card style={styles.statsCard} mode="outlined">
          <Card.Content>
            <Text variant="titleMedium" style={{ color: colors.onSurface, marginBottom: 16 }}>
              Your Stats
            </Text>
            <View style={styles.statsRow}>
              <View style={{ alignItems: "center" }}>
                <Text variant="displaySmall" style={{ color: colors.primary }}>
                  {totalSessions}
                </Text>
                <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>
                  Total Sessions
                </Text>
              </View>
              <View style={{ alignItems: "center" }}>
                <Text variant="displaySmall" style={{ color: colors.primary }}>
                  {totalSets}
                </Text>
                <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>
                  Total Sets
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  headerContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  welcomeCard: {
    borderRadius: 16,
    marginBottom: 24,
  },
  welcomeContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  exerciseCard: {
    borderRadius: 16,
    marginBottom: 12,
  },
  exerciseContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  exerciseLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  statsCard: {
    borderRadius: 16,
    marginTop: 8,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
});
