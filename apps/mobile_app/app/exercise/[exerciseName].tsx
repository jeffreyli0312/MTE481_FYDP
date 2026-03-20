import React, { useState } from "react";
import { ScrollView, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { useAppTheme } from "../theme";
import ExerciseOverview from "../components/ExerciseOverview";
import SessionView from "../components/SessionView";
import MvcCalibrationView from "../components/MvcCalibrationView";
import type { SessionRecord } from "../types/workout";

type ExerciseMode = "overview" | "session" | "calibration";

export default function ExerciseScreen() {
  const { colors, dark } = useAppTheme();
  const { exerciseName } = useLocalSearchParams<{ exerciseName: string }>();
  const name = exerciseName ?? "Exercise";

  const [mode, setMode] = useState<ExerciseMode>("overview");

  function handleEndSession(session: SessionRecord) {
    // Navigate to the session detail — this pushes onto the stack naturally
    router.push({
      pathname: "/session/[sessionId]",
      params: { sessionId: session.id, source: "sqlite", title: name },
    });
    // Reset mode back to overview so returning via swipe shows overview
    setMode("overview");
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar barStyle={dark ? "light-content" : "dark-content"} />
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
          {mode === "session" ? (
            <SessionView
              exerciseName={name}
              onBack={() => setMode("overview")}
              onEndSession={handleEndSession}
            />
          ) : mode === "calibration" ? (
            <MvcCalibrationView
              exerciseName={name}
              onBack={() => setMode("overview")}
              onComplete={() => setMode("overview")}
            />
          ) : (
            <ExerciseOverview
              exerciseName={name}
              onBack={() => router.back()}
              onStartNewSession={() => setMode("session")}
              onStartCalibration={() => setMode("calibration")}
            />
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
