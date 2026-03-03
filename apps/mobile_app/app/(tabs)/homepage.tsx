import React, { useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
} from "react-native";
import { Card, Text, Button, Badge } from "react-native-paper";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { useAppTheme } from "../theme";

interface Exercise {
  id: string;
  name: string;
  icon: string;
}

type ScreenMode = "home" | "exercise";
type ExerciseMode = "overview" | "session";

type SetRecord = {
  id: string;
  durationSec: number;
  avgForceN: number;
};

type SessionRecord = {
  id: string;
  dateISO: string;
  durationSec: number;
  setsCount: number;
  avgForceN: number;
};

const AVAILABLE_EXERCISES: Exercise[] = [
  { id: "bench-press", name: "Bench Press", icon: "\uD83D\uDCAA" },
];

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

function formatMMSS(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${pad2(m)}:${pad2(s)}`;
}

function formatMinSec(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}m ${s}s`;
}

function formatDateShort(dateISO: string) {
  const d = new Date(dateISO);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

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
  const [completedSets, setCompletedSets] = useState<SetRecord[]>([]);

  const { totalSessions, totalSets } = useMemo(() => {
    const allSessions = Object.values(sessionsByExercise).flat();
    return {
      totalSessions: allSessions.length,
      totalSets: allSessions.reduce((sum, s) => sum + (s.setsCount ?? 0), 0),
    };
  }, [sessionsByExercise]);

  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [sessionTimerRunning, setSessionTimerRunning] = useState(false);

  React.useEffect(() => {
    if (!sessionTimerRunning) return;
    const interval = setInterval(() => {
      setSessionSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionTimerRunning]);

  const [isRecording, setIsRecording] = useState(false);
  const [setSeconds, setSetSeconds] = useState(0);
  const [setTimerRunning, setSetTimerRunning] = useState(false);
  const [liveForceN, setLiveForceN] = useState(0);

  React.useEffect(() => {
    if (!setTimerRunning) return;
    const interval = setInterval(() => {
      setSetSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [setTimerRunning]);

  React.useEffect(() => {
    if (!isRecording) return;
    setLiveForceN(80.6);
    const interval = setInterval(() => {
      setLiveForceN((prev) => {
        const jitter = (Math.random() - 0.5) * 6;
        const next = Math.max(0, prev + jitter);
        return Math.round(next * 10) / 10;
      });
    }, 350);
    return () => clearInterval(interval);
  }, [isRecording]);

  const selectedExerciseName = useMemo(
    () => selectedExercise?.name ?? "",
    [selectedExercise]
  );

  const selectedExerciseId = selectedExercise?.id ?? "";
  const savedSessionsForExercise = sessionsByExercise[selectedExerciseId] ?? [];
  const sessionsCompletedCount = savedSessionsForExercise.length;

  async function handleLogout() {
    try {
      await signOut();
    } catch (e: any) {
      alert(e?.message ?? "Logout failed");
    }
  }

  function handleSelectExercise(id: string, name: string) {
    const ex =
      AVAILABLE_EXERCISES.find((e) => e.id === id) ?? { id, name, icon: "\uD83D\uDCAA" };
    setSelectedExercise(ex);
    setExerciseMode("overview");
    setScreenMode("exercise");
    setIsRecording(false);
    setSetTimerRunning(false);
    setSessionTimerRunning(false);
    setSetSeconds(0);
    setSessionSeconds(0);
    setCompletedSets([]);
  }

  function handleBackToHomeFromExercise() {
    setIsRecording(false);
    setSetTimerRunning(false);
    setSessionTimerRunning(false);
    setSetSeconds(0);
    setSessionSeconds(0);
    setCompletedSets([]);
    setExerciseMode("overview");
    setSelectedExercise(null);
    setScreenMode("home");
  }

  function startNewSession() {
    setExerciseMode("session");
    setSessionSeconds(0);
    setSessionTimerRunning(true);
    setCompletedSets([]);
    setIsRecording(false);
    setSetSeconds(0);
    setSetTimerRunning(false);
    setLiveForceN(0);
  }

  function startRecording() {
    setIsRecording(true);
    setSetSeconds(0);
    setSetTimerRunning(true);
  }

  function endRecording() {
    setIsRecording(false);
    setSetTimerRunning(false);
    const duration = Math.max(1, setSeconds);
    const avgForce = liveForceN > 0 ? liveForceN : 80.6;
    const newSet: SetRecord = {
      id: `set-${Date.now()}`,
      durationSec: duration,
      avgForceN: avgForce,
    };
    setCompletedSets((prev) => [...prev, newSet]);
    setSetSeconds(0);
  }

  function endSession() {
    if (!selectedExerciseId) return;
    setIsRecording(false);
    setSetTimerRunning(false);
    setSessionTimerRunning(false);
    const setsCount = completedSets.length;
    const avgForce =
      setsCount === 0
        ? 0
        : Math.round(
            (completedSets.reduce((sum, s) => sum + s.avgForceN, 0) / setsCount) * 10
          ) / 10;

    const session: SessionRecord = {
      id: `sess-${Date.now()}`,
      dateISO: new Date().toISOString(),
      durationSec: sessionSeconds,
      setsCount,
      avgForceN: avgForce,
    };

    setSessionsByExercise((prev) => {
      const existing = prev[selectedExerciseId] ?? [];
      return { ...prev, [selectedExerciseId]: [session, ...existing] };
    });

    setCompletedSets([]);
    setSessionSeconds(0);
    setSetSeconds(0);
    setExerciseMode("overview");
  }

  function renderExercisePage() {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar barStyle={dark ? "light-content" : "dark-content"} />
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
          {exerciseMode === "overview" ? (
            <>
              <Pressable onPress={handleBackToHomeFromExercise} style={styles.backRow}>
                <Feather name="arrow-left" size={18} color={colors.onSurface} />
                <Text variant="labelLarge" style={{ color: colors.onSurface }}>
                  Back to Home
                </Text>
              </Pressable>

              <Text variant="headlineMedium" style={{ color: colors.onSurface, fontWeight: "900", marginTop: 6 }}>
                {selectedExerciseName}
              </Text>
              <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>
                {sessionsCompletedCount} sessions completed
              </Text>

              <Button
                mode="contained"
                onPress={startNewSession}
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

              {savedSessionsForExercise.length === 0 ? (
                <Card style={[styles.infoCard, { borderColor: colors.infoBorder }]} mode="outlined">
                  <Card.Content style={{ backgroundColor: colors.infoBg, borderRadius: 12 }}>
                    <Text variant="bodySmall" style={{ color: colors.infoText, textAlign: "center" }}>
                      No sessions yet. Start your first session to begin tracking!
                    </Text>
                  </Card.Content>
                </Card>
              ) : (
                savedSessionsForExercise.map((s) => (
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
          ) : (
            <>
              {/* SESSION PAGE */}
              <View style={styles.sessionTopRow}>
                <Pressable
                  onPress={() => {
                    setIsRecording(false);
                    setSetTimerRunning(false);
                    setSessionTimerRunning(false);
                    setCompletedSets([]);
                    setSetSeconds(0);
                    setSessionSeconds(0);
                    setExerciseMode("overview");
                  }}
                  style={styles.backRow}
                >
                  <Feather name="arrow-left" size={18} color={colors.onSurface} />
                  <Text variant="labelLarge" style={{ color: colors.onSurface }}>
                    Back
                  </Text>
                </Pressable>

                <View style={styles.inlineRow}>
                  <Feather name="clock" size={16} color={colors.primary} />
                  <Text variant="titleMedium" style={{ color: colors.primary, fontWeight: "900" }}>
                    {formatMMSS(sessionSeconds)}
                  </Text>
                </View>
              </View>

              <Text variant="titleLarge" style={{ color: colors.onSurface, fontWeight: "900", marginBottom: 10 }}>
                Bench Press Session
              </Text>
              <View style={[styles.divider, { backgroundColor: colors.outline }]} />

              {/* Recording / Ready card */}
              <Card style={styles.bigCard} mode="outlined">
                <Card.Content>
                  {isRecording ? (
                    <>
                      <View style={{ alignItems: "center", marginBottom: 6 }}>
                        <Badge style={{ backgroundColor: colors.danger }}>Recording</Badge>
                      </View>

                      <Text
                        variant="displaySmall"
                        style={{ color: colors.onSurface, fontWeight: "900", textAlign: "center", marginTop: 6 }}
                      >
                        {formatMMSS(setSeconds)}
                      </Text>
                      <Text
                        variant="labelLarge"
                        style={{ color: colors.onSurfaceVariant, textAlign: "center", marginTop: 2, marginBottom: 12 }}
                      >
                        Set Duration
                      </Text>

                      <Card
                        style={[styles.forceCard, { borderColor: colors.infoBorder }]}
                        mode="outlined"
                      >
                        <Card.Content style={{ alignItems: "center", backgroundColor: colors.infoBg, borderRadius: 12 }}>
                          <Text variant="labelLarge" style={{ color: colors.primary, fontWeight: "900" }}>
                            Live Force Reading
                          </Text>
                          <Text variant="headlineMedium" style={{ color: colors.primary, fontWeight: "900" }}>
                            {liveForceN.toFixed(1)}N
                          </Text>
                        </Card.Content>
                      </Card>

                      <Button
                        mode="contained"
                        onPress={endRecording}
                        icon="stop"
                        style={styles.actionBtn}
                        buttonColor={colors.danger}
                        textColor="#ffffff"
                      >
                        End Recording
                      </Button>
                    </>
                  ) : (
                    <>
                      <Text variant="titleMedium" style={{ color: colors.onSurface, textAlign: "center", fontWeight: "900" }}>
                        Ready to start your next set?
                      </Text>
                      <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant, textAlign: "center", marginTop: 6 }}>
                        Press the button below to begin recording
                      </Text>

                      <Button
                        mode="contained"
                        onPress={startRecording}
                        icon="play"
                        style={styles.actionBtn}
                        buttonColor={colors.success}
                        textColor="#ffffff"
                      >
                        Start Recording
                      </Button>
                    </>
                  )}
                </Card.Content>
              </Card>

              {/* Completed Sets */}
              <View style={styles.completedHeaderRow}>
                <Text variant="titleMedium" style={{ color: colors.onSurface, fontWeight: "900" }}>
                  Completed Sets
                </Text>
                <Badge style={{ backgroundColor: colors.outline }}>
                  {completedSets.length}
                </Badge>
              </View>

              {completedSets.length === 0 ? (
                <Card style={[styles.infoCard, { borderColor: colors.infoBorder }]} mode="outlined">
                  <Card.Content style={{ backgroundColor: colors.infoBg, borderRadius: 12 }}>
                    <Text variant="bodySmall" style={{ color: colors.infoText, textAlign: "center" }}>
                      No sets completed yet. Start recording to begin!
                    </Text>
                  </Card.Content>
                </Card>
              ) : (
                <View style={{ gap: 10 }}>
                  {completedSets.map((set, idx) => (
                    <Card key={set.id} style={styles.setRowCard} mode="outlined">
                      <Card.Content style={styles.setRowContent}>
                        <View
                          style={[
                            styles.setNumberCircle,
                            { backgroundColor: colors.infoBg, borderColor: colors.infoBorder },
                          ]}
                        >
                          <Text style={{ fontWeight: "900", color: colors.primary }}>
                            {idx + 1}
                          </Text>
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text variant="titleSmall" style={{ color: colors.onSurface }}>
                            Set {idx + 1}
                          </Text>
                          <Text variant="titleSmall" style={{ color: colors.onSurface, fontWeight: "900", marginTop: 2 }}>
                            {set.durationSec}s
                          </Text>
                        </View>

                        <View style={styles.inlineRow}>
                          <Feather name="bar-chart-2" size={16} color={colors.onSurfaceVariant} />
                          <Text variant="labelMedium" style={{ color: colors.onSurfaceVariant }}>
                            View Stats
                          </Text>
                        </View>
                      </Card.Content>
                    </Card>
                  ))}
                </View>
              )}

              {/* End Session */}
              <Button
                mode="outlined"
                onPress={() => {
                  if (completedSets.length === 0) return;
                  endSession();
                }}
                disabled={completedSets.length === 0}
                style={styles.endSessionBtn}
                textColor={completedSets.length === 0 ? colors.onSurfaceVariant : colors.onSurface}
              >
                End Session
              </Button>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screenMode === "exercise") {
    return renderExercisePage();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle={dark ? "light-content" : "dark-content"} />

      <Text variant="titleLarge" style={{ color: colors.onSurface, padding: 12 }}>
        Home
      </Text>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={[styles.headerContainer, { borderBottomColor: colors.outline }]}>
          <View>
            <Text variant="titleMedium" style={{ color: colors.onSurface }}>
              Workout Tracker
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
            onPress={() => handleSelectExercise(exercise.id, exercise.name)}
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
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 8,
  },
  headerContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
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
  sessionTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  divider: {
    height: 1,
    marginBottom: 16,
  },
  bigCard: {
    borderRadius: 16,
    marginBottom: 18,
  },
  forceCard: {
    borderRadius: 12,
    marginBottom: 12,
  },
  actionBtn: {
    marginTop: 14,
    borderRadius: 10,
  },
  completedHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  setRowCard: {
    borderRadius: 12,
  },
  setRowContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  setNumberCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  endSessionBtn: {
    marginTop: 14,
    borderRadius: 10,
  },
});
