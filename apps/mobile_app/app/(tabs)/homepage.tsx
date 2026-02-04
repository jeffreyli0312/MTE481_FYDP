import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";

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
  { id: "bench-press", name: "Bench Press", icon: "💪" },
];

// ---------- helpers ----------
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
  const { theme } = useTheme();
  const { user, signOut } = useAuth();
  const dark = theme === "dark";

  const username = user?.email?.split("@")[0] || "User";

  // ------------------------
  // Theme colors (single source of truth)
  // ------------------------
  const colors = useMemo(() => {
    if (!dark) {
      return {
        // surfaces
        bg: "#f5f7fb",
        homeBg: "#f5f5f5",
        card: "#ffffff",
        border: "#e5e7eb",

        // text
        text: "#111827",
        muted: "#6b7280",

        // accents
        primary: "#2563eb",
        success: "#16a34a",
        danger: "#e11d48",
        pillRecording: "#fb7185",

        // tints
        infoBg: "#eff6ff",
        infoBorder: "#bfdbfe",
        infoText: "#1e3a8a",

        // disabled
        disabledBg: "#f3f4f6",
        disabledBorder: "#e5e7eb",
        disabledText: "#9ca3af",

        shadow: "#000",
      };
    }

    // dark
    return {
      // surfaces
      bg: "#14161c",
      homeBg: "#14161c",
      card: "#1e2128",
      border: "#2b2f3a",

      // text
      text: "#ffffff",
      muted: "#9ca3af",

      // accents
      primary: "#60a5fa",
      success: "#22c55e",
      danger: "#fb7185",
      pillRecording: "#fb7185",

      // tints
      infoBg: "#0f172a",
      infoBorder: "#1f2937",
      infoText: "#cbd5e1",

      // disabled
      disabledBg: "#1b1e25",
      disabledBorder: "#2b2f3a",
      disabledText: "#6b7280",

      shadow: "#000",
    };
  }, [dark]);

  // ------------------------
  // Navigation within same tab (state-driven)
  // ------------------------
  const [screenMode, setScreenMode] = useState<ScreenMode>("home");
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [exerciseMode, setExerciseMode] = useState<ExerciseMode>("overview");

  // ------------------------
  // Data store (in-memory)
  // sessions per exercise
  // ------------------------
  const [sessionsByExercise, setSessionsByExercise] = useState<
    Record<string, SessionRecord[]>
  >({});
  const [completedSets, setCompletedSets] = useState<SetRecord[]>([]);

  const { totalSessions, totalSets } = useMemo(() => {
    const allSessions = Object.values(sessionsByExercise).flat();

    const totalSessions = allSessions.length;
    const totalSets = allSessions.reduce((sum, s) => sum + (s.setsCount ?? 0), 0);

    return { totalSessions, totalSets };
  }, [sessionsByExercise]);


  // ------------------------
  // Session timer (top-right timer) - runs until End Session
  // ------------------------
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [sessionTimerRunning, setSessionTimerRunning] = useState(false);

  React.useEffect(() => {
    if (!sessionTimerRunning) return;
    const interval = setInterval(() => {
      setSessionSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionTimerRunning]);

  // ------------------------
  // Recording state (set timer + live force)
  // ------------------------
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

  // Simulate live force updates while recording
  React.useEffect(() => {
    if (!isRecording) return;
    setLiveForceN(80.6);

    const interval = setInterval(() => {
      setLiveForceN((prev) => {
        const jitter = (Math.random() - 0.5) * 6; // +/-3
        const next = Math.max(0, prev + jitter);
        return Math.round(next * 10) / 10; // 1 decimal
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
      AVAILABLE_EXERCISES.find((e) => e.id === id) ?? { id, name, icon: "💪" };
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
          (completedSets.reduce((sum, s) => sum + s.avgForceN, 0) / setsCount) *
          10
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
      return {
        ...prev,
        [selectedExerciseId]: [session, ...existing],
      };
    });

    setCompletedSets([]);
    setSessionSeconds(0);
    setSetSeconds(0);
    setExerciseMode("overview");
  }

  function renderExercisePage() {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar barStyle={dark ? "light-content" : "dark-content"} />
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
          {exerciseMode === "overview" ? (
            <>
              <Pressable onPress={handleBackToHomeFromExercise} style={styles.backRow}>
                <Feather name="arrow-left" size={18} color={colors.text} />
                <Text style={[styles.backText, { color: colors.text }]}>
                  Back to Home
                </Text>
              </Pressable>

              <Text style={[styles.exerciseTitle, { color: colors.text }]}>
                {selectedExerciseName}
              </Text>
              <Text style={[styles.exerciseSubtitle, { color: colors.muted }]}>
                {sessionsCompletedCount} sessions completed
              </Text>

              <Pressable
                onPress={startNewSession}
                style={[styles.primaryBlueBtn, { backgroundColor: colors.primary }]}
              >
                <Feather name="plus" size={18} color="#ffffff" />
                <Text style={styles.primaryBlueBtnText}>Start New Session</Text>
              </Pressable>

              <Text style={[styles.sectionHeader, { color: colors.text }]}>
                Previous Sessions
              </Text>

              {savedSessionsForExercise.length === 0 ? (
                <View
                  style={[
                    styles.emptyCard,
                    { borderColor: colors.infoBorder, backgroundColor: colors.infoBg },
                  ]}
                >
                  <Text style={[styles.emptyCardText, { color: colors.infoText }]}>
                    No sessions yet. Start your first session to begin tracking!
                  </Text>
                </View>
              ) : (
                savedSessionsForExercise.map((s) => (
                  <View
                    key={s.id}
                    style={[
                      styles.sessionSummaryCard,
                      { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <Feather name="calendar" size={14} color={colors.muted} />
                        <Text style={{ color: colors.text, fontWeight: "700" }}>
                          {formatDateShort(s.dateISO)}
                        </Text>
                      </View>

                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <Feather name="clock" size={14} color={colors.muted} />
                        <Text style={{ color: colors.text, fontWeight: "700" }}>
                          {formatMinSec(s.durationSec)}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={{
                        marginTop: 14,
                        flexDirection: "row",
                        justifyContent: "space-between",
                      }}
                    >
                      <View>
                        <Text
                          style={{
                            fontSize: 22,
                            fontWeight: "900",
                            color: colors.text,
                          }}
                        >
                          {s.setsCount}
                        </Text>
                        <Text style={{ color: colors.muted, fontWeight: "600" }}>
                          Sets
                        </Text>
                      </View>

                      <View style={{ alignItems: "flex-end" }}>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <Feather
                            name="trending-up"
                            size={14}
                            color={colors.success}
                          />
                          <Text
                            style={{
                              fontSize: 16,
                              fontWeight: "900",
                              color: colors.success,
                            }}
                          >
                            {s.avgForceN.toFixed(1)}N
                          </Text>
                        </View>
                        <Text style={{ color: colors.muted, fontWeight: "600" }}>
                          Avg Force
                        </Text>
                      </View>
                    </View>
                  </View>
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
                  style={styles.sessionBackBtn}
                >
                  <Feather name="arrow-left" size={18} color={colors.text} />
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text }}>
                    Back
                  </Text>
                </Pressable>

                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Feather name="clock" size={16} color={colors.primary} />
                  <Text style={{ fontSize: 16, fontWeight: "900", color: colors.primary }}>
                    {formatMMSS(sessionSeconds)}
                  </Text>
                </View>
              </View>

              <Text style={[styles.sessionTitle, { color: colors.text }]}>
                Bench Press Session
              </Text>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              {/* Recording / Ready card */}
              <View
                style={[
                  styles.bigCard,
                  { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.shadow },
                ]}
              >
                {isRecording ? (
                  <>
                    <View style={{ alignItems: "center", marginBottom: 6 }}>
                      <View style={[styles.recordingPill, { backgroundColor: colors.pillRecording }]}>
                        <Text style={styles.recordingPillText}>Recording</Text>
                      </View>
                    </View>

                    <Text style={[styles.setDurationBig, { color: colors.text }]}>
                      {formatMMSS(setSeconds)}
                    </Text>
                    <Text style={[styles.setDurationLabel, { color: colors.muted }]}>
                      Set Duration
                    </Text>

                    <View
                      style={[
                        styles.forceCard,
                        { backgroundColor: colors.infoBg, borderColor: colors.infoBorder },
                      ]}
                    >
                      <Text style={[styles.forceLabel, { color: colors.primary }]}>
                        Live Force Reading
                      </Text>
                      <Text style={[styles.forceValue, { color: colors.primary }]}>
                        {liveForceN.toFixed(1)}N
                      </Text>
                    </View>

                    <Pressable
                      onPress={endRecording}
                      style={[styles.endRecordingBtn, { backgroundColor: colors.danger }]}
                    >
                      <Feather name="square" size={16} color="#ffffff" />
                      <Text style={styles.endRecordingText}>End Recording</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Text style={[styles.readyTitle, { color: colors.text }]}>
                      Ready to start your next set?
                    </Text>
                    <Text style={[styles.readySubtitle, { color: colors.muted }]}>
                      Press the button below to begin recording
                    </Text>

                    <Pressable
                      onPress={startRecording}
                      style={[styles.startRecordingBtn, { backgroundColor: colors.success }]}
                    >
                      <Feather name="play" size={18} color="#ffffff" />
                      <Text style={styles.startRecordingText}>Start Recording</Text>
                    </Pressable>
                  </>
                )}
              </View>

              {/* Completed Sets */}
              <View style={styles.completedHeaderRow}>
                <Text style={[styles.completedHeaderText, { color: colors.text }]}>
                  Completed Sets
                </Text>
                <View style={[styles.countPill, { backgroundColor: colors.border }]}>
                  <Text style={{ fontWeight: "900", color: colors.text }}>
                    {completedSets.length}
                  </Text>
                </View>
              </View>

              {completedSets.length === 0 ? (
                <View
                  style={[
                    styles.completedEmptyCard,
                    { backgroundColor: colors.infoBg, borderColor: colors.infoBorder },
                  ]}
                >
                  <Text style={[styles.completedEmptyText, { color: colors.infoText }]}>
                    No sets completed yet. Start recording to begin!
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 10 }}>
                  {completedSets.map((set, idx) => (
                    <View
                      key={set.id}
                      style={[
                        styles.setRowCard,
                        { backgroundColor: colors.card, borderColor: colors.border },
                      ]}
                    >
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
                        <Text style={{ fontWeight: "800", color: colors.text }}>
                          Set {idx + 1}
                        </Text>
                        <Text style={{ fontWeight: "900", color: colors.text, marginTop: 2 }}>
                          {set.durationSec}s
                        </Text>
                      </View>

                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Feather name="bar-chart-2" size={16} color={colors.muted} />
                        <Text style={{ color: colors.muted, fontWeight: "800" }}>
                          View Stats
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* End Session */}
              <Pressable
                onPress={() => {
                  if (completedSets.length === 0) return;
                  endSession();
                }}
                style={[
                  styles.endSessionBtn,
                  {
                    backgroundColor:
                      completedSets.length === 0 ? colors.disabledBg : colors.card,
                    borderColor:
                      completedSets.length === 0 ? colors.disabledBorder : colors.border,
                    borderWidth: 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.endSessionText,
                    { color: completedSets.length === 0 ? colors.disabledText : colors.text },
                  ]}
                >
                  End Session
                </Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screenMode === "exercise") {
    return renderExercisePage();
  }

  // ------------------------
  // HOME PAGE (your existing UI) - already themed
  // ------------------------
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: dark ? "#14161c" : "#f5f5f5" }}>
      <StatusBar barStyle={dark ? "light-content" : "dark-content"} />

      <Text
        style={{
          color: dark ? "#fff" : "#000",
          fontSize: 22,
          fontWeight: "600",
          padding: 12,
        }}
      >
        Home
      </Text>

      <ScrollView
        contentContainerStyle={[
          stylesHome.scrollContent,
          { backgroundColor: dark ? "#14161c" : "#f5f5f5" },
        ]}
      >
        {/* Header */}
        <View
          style={[
            stylesHome.headerContainer,
            { borderBottomColor: dark ? "#2b2f3a" : "#e5e7eb" },
          ]}
        >
          <View>
            <Text style={[stylesHome.title, { color: dark ? "#ffffff" : "#111827" }]}>
              Workout Tracker
            </Text>
            <Text style={[stylesHome.subtitle, { color: dark ? "#9ca3af" : "#6b7280" }]}>
              Welcome, {username}
            </Text>
          </View>

          <Pressable
            onPress={handleLogout}
            style={[
              stylesHome.logoutButton,
              {
                backgroundColor: dark ? "#1e2128" : "#ffffff",
                borderColor: dark ? "#2b2f3a" : "#e5e7eb",
              },
            ]}
          >
            <Text style={[stylesHome.logoutText, { color: "#ef4444" }]}>Logout</Text>
          </Pressable>
        </View>

        {/* Welcome Card */}
        <View
          style={[
            stylesHome.welcomeCard,
            {
              backgroundColor: dark ? "#1e2128" : "#ffffff",
              borderColor: dark ? "#2b2f3a" : "#e5e7eb",
            },
          ]}
        >
          <View
            style={[
              stylesHome.iconCircle,
              { backgroundColor: dark ? "#2563eb" : "#60a5fa" },
            ]}
          >
            <Feather name="activity" size={28} color="white" />
          </View>
          <View style={stylesHome.welcomeTextContainer}>
            <Text style={[stylesHome.welcomeTitle, { color: dark ? "#ffffff" : "#111827" }]}>
              Ready to Train?
            </Text>
            <Text style={[stylesHome.welcomeSubtitle, { color: dark ? "#9ca3af" : "#6b7280" }]}>
              Select an exercise to begin
            </Text>
          </View>
        </View>

        {/* Exercises Section */}
        <Text style={[stylesHome.sectionTitle, { color: dark ? "#ffffff" : "#111827" }]}>
          Available Exercises
        </Text>

        {AVAILABLE_EXERCISES.map((exercise) => (
          <Pressable
            key={exercise.id}
            style={[
              stylesHome.exerciseCard,
              {
                backgroundColor: dark ? "#1e2128" : "#ffffff",
                borderColor: dark ? "#2b2f3a" : "#e5e7eb",
              },
            ]}
            onPress={() => handleSelectExercise(exercise.id, exercise.name)}
          >
            <View style={stylesHome.exerciseLeft}>
              <Text style={stylesHome.exerciseIcon}>{exercise.icon}</Text>
              <View>
                <Text style={[stylesHome.exerciseName, { color: dark ? "#ffffff" : "#111827" }]}>
                  {exercise.name}
                </Text>
                <Text style={[stylesHome.exerciseHint, { color: dark ? "#9ca3af" : "#6b7280" }]}>
                  Tap to view sessions
                </Text>
              </View>
            </View>
            <Feather name="chevron-right" size={20} color={dark ? "#9ca3af" : "#6b7280"} />
          </Pressable>
        ))}

        {/* Stats Card (left as-is) */}
        <View
          style={[
            stylesHome.statsCard,
            {
              backgroundColor: dark ? "#1e2128" : "#ffffff",
              borderColor: dark ? "#2b2f3a" : "#e5e7eb",
            },
          ]}
        >
          <Text style={[stylesHome.sectionTitle, { color: dark ? "#ffffff" : "#111827" }]}>
            Your Stats
          </Text>
          <View style={stylesHome.statsRow}>
            <View style={stylesHome.stat}>
              <Text style={[stylesHome.statValue, { color: dark ? "#60a5fa" : "#2563eb" }]}>
                <Text style={[stylesHome.statValue, { color: dark ? "#60a5fa" : "#2563eb" }]}>
                  {totalSessions}
                </Text>
              </Text>
              <Text style={[stylesHome.statLabel, { color: dark ? "#9ca3af" : "#6b7280" }]}>
                Total Sessions
              </Text>
            </View>
            <View style={stylesHome.stat}>
              <Text style={[stylesHome.statValue, { color: dark ? "#60a5fa" : "#2563eb" }]}>
                <Text style={[stylesHome.statValue, { color: dark ? "#60a5fa" : "#2563eb" }]}>
                  {totalSets}
                </Text>
              </Text>
              <Text style={[stylesHome.statLabel, { color: dark ? "#9ca3af" : "#6b7280" }]}>
                Total Sets
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ------------------------
// Styles (keep structure the same; colors overridden via inline theme)
// ------------------------
const styles = StyleSheet.create({
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  backText: {
    fontSize: 14,
    fontWeight: "700",
  },

  exerciseTitle: {
    fontSize: 28,
    fontWeight: "900",
    marginTop: 6,
  },
  exerciseSubtitle: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: "700",
  },

  primaryBlueBtn: {
    marginTop: 16,
    height: 44,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  primaryBlueBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },

  sectionHeader: {
    marginTop: 18,
    fontSize: 16,
    fontWeight: "900",
  },

  emptyCard: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  emptyCardText: {
    textAlign: "center",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },

  sessionSummaryCard: {
    marginTop: 10,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
  },

  sessionTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sessionBackBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sessionTitle: {
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 10,
  },
  divider: {
    height: 1,
    marginBottom: 16,
  },

  bigCard: {
    borderRadius: 16,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },

  readyTitle: {
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
  },
  readySubtitle: {
    textAlign: "center",
    marginTop: 6,
    fontSize: 13,
    fontWeight: "700",
  },

  startRecordingBtn: {
    marginTop: 14,
    height: 44,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  startRecordingText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },

  recordingPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  recordingPillText: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 12,
  },

  setDurationBig: {
    fontSize: 38,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 6,
  },
  setDurationLabel: {
    textAlign: "center",
    fontWeight: "800",
    marginTop: 2,
    marginBottom: 12,
  },

  forceCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  forceLabel: {
    fontWeight: "900",
    marginBottom: 6,
  },
  forceValue: {
    fontSize: 24,
    fontWeight: "900",
  },

  endRecordingBtn: {
    height: 44,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  endRecordingText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },

  completedHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  completedHeaderText: {
    fontSize: 18,
    fontWeight: "900",
  },
  countPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },

  completedEmptyCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  completedEmptyText: {
    textAlign: "center",
    fontSize: 13,
    fontWeight: "800",
  },

  setRowCard: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
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
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  endSessionText: {
    fontSize: 15,
    fontWeight: "900",
  },
});

// ------------------------
// Home styles (unchanged)
// ------------------------
const stylesHome = StyleSheet.create({
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
  title: {
    fontSize: 20,
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
  },
  logoutButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: "600",
  },
  welcomeCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 24,
    shadowColor: "#000",
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    elevation: 4,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  welcomeTextContainer: {
    flex: 1,
  },
  welcomeTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  welcomeSubtitle: {
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
    marginTop: 8,
  },
  exerciseCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
    shadowColor: "#000",
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    elevation: 4,
  },
  exerciseLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  exerciseIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  exerciseName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  exerciseHint: {
    fontSize: 13,
  },
  statsCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
    shadowColor: "#000",
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    elevation: 4,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 16,
  },
  stat: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 32,
    fontWeight: "700",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
  },
});
