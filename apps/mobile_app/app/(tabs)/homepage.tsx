import React from "react";
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

const AVAILABLE_EXERCISES: Exercise[] = [
  { id: "bench-press", name: "Bench Press", icon: "💪" },
];

export default function HomePageScreen() {
  const { theme } = useTheme();
  const { user, signOut } = useAuth();
  const dark = theme === "dark";

  const username = user?.email?.split("@")[0] || "User";

  async function handleLogout() {
    try {
      await signOut();
    } catch (e: any) {
      alert(e?.message ?? "Logout failed");
    }
  }

  function handleSelectExercise(id: string, name: string) {
    // TODO: Navigate to exercise sessions or implement functionality
    console.log("Selected exercise:", id, name);
  }

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: dark ? "#14161c" : "#f5f5f5",
      }}
    >
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
          styles.scrollContent,
          { backgroundColor: dark ? "#14161c" : "#f5f5f5" },
        ]}
      >
        {/* Header */}
        <View
          style={[
            styles.headerContainer,
            { borderBottomColor: dark ? "#2b2f3a" : "#e5e7eb" },
          ]}
        >
          <View>
            <Text
              style={[styles.title, { color: dark ? "#ffffff" : "#111827" }]}
            >
              Workout Tracker
            </Text>
            <Text
              style={[
                styles.subtitle,
                { color: dark ? "#9ca3af" : "#6b7280" },
              ]}
            >
              Welcome, {username}
            </Text>
          </View>

          <Pressable
            onPress={handleLogout}
            style={[
              styles.logoutButton,
              {
                backgroundColor: dark ? "#1e2128" : "#ffffff",
                borderColor: dark ? "#2b2f3a" : "#e5e7eb",
              },
            ]}
          >
            <Text
              style={[
                styles.logoutText,
                { color: dark ? "#ef4444" : "#ef4444" },
              ]}
            >
              Logout
            </Text>
          </Pressable>
        </View>

        {/* Welcome Card */}
        <View
          style={[
            styles.welcomeCard,
            {
              backgroundColor: dark ? "#1e2128" : "#ffffff",
              borderColor: dark ? "#2b2f3a" : "#e5e7eb",
            },
          ]}
        >
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: dark ? "#2563eb" : "#60a5fa" },
            ]}
          >
            <Feather name="activity" size={28} color="white" />
          </View>
          <View style={styles.welcomeTextContainer}>
            <Text
              style={[
                styles.welcomeTitle,
                { color: dark ? "#ffffff" : "#111827" },
              ]}
            >
              Ready to Train?
            </Text>
            <Text
              style={[
                styles.welcomeSubtitle,
                { color: dark ? "#9ca3af" : "#6b7280" },
              ]}
            >
              Select an exercise to begin
            </Text>
          </View>
        </View>

        {/* Exercises Section */}
        <Text
          style={[
            styles.sectionTitle,
            { color: dark ? "#ffffff" : "#111827" },
          ]}
        >
          Available Exercises
        </Text>

        {AVAILABLE_EXERCISES.map((exercise) => (
          <Pressable
            key={exercise.id}
            style={[
              styles.exerciseCard,
              {
                backgroundColor: dark ? "#1e2128" : "#ffffff",
                borderColor: dark ? "#2b2f3a" : "#e5e7eb",
              },
            ]}
            onPress={() => handleSelectExercise(exercise.id, exercise.name)}
          >
            <View style={styles.exerciseLeft}>
              <Text style={styles.exerciseIcon}>{exercise.icon}</Text>
              <View>
                <Text
                  style={[
                    styles.exerciseName,
                    { color: dark ? "#ffffff" : "#111827" },
                  ]}
                >
                  {exercise.name}
                </Text>
                <Text
                  style={[
                    styles.exerciseHint,
                    { color: dark ? "#9ca3af" : "#6b7280" },
                  ]}
                >
                  Tap to view sessions
                </Text>
              </View>
            </View>
            <Feather
              name="chevron-right"
              size={20}
              color={dark ? "#9ca3af" : "#6b7280"}
            />
          </Pressable>
        ))}

        {/* Stats Card */}
        <View
          style={[
            styles.statsCard,
            {
              backgroundColor: dark ? "#1e2128" : "#ffffff",
              borderColor: dark ? "#2b2f3a" : "#e5e7eb",
            },
          ]}
        >
          <Text
            style={[
              styles.sectionTitle,
              { color: dark ? "#ffffff" : "#111827" },
            ]}
          >
            Your Stats
          </Text>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text
                style={[
                  styles.statValue,
                  { color: dark ? "#60a5fa" : "#2563eb" },
                ]}
              >
                0
              </Text>
              <Text
                style={[
                  styles.statLabel,
                  { color: dark ? "#9ca3af" : "#6b7280" },
                ]}
              >
                Total Sessions
              </Text>
            </View>
            <View style={styles.stat}>
              <Text
                style={[
                  styles.statValue,
                  { color: dark ? "#60a5fa" : "#2563eb" },
                ]}
              >
                0
              </Text>
              <Text
                style={[
                  styles.statLabel,
                  { color: dark ? "#9ca3af" : "#6b7280" },
                ]}
              >
                Total Sets
              </Text>
            </View>
          </View>
        </View>
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
