import React from "react";
import { router } from "expo-router";
import {
  SafeAreaView,
  ScrollView,
  View,
  StyleSheet,
  StatusBar,
} from "react-native";
import { Text } from "react-native-paper";
import { useAppTheme } from "../theme";
import { useAuth } from "../context/AuthContext";
import { formatDateFromMs, formatDurationFromMs } from "../utils/format";
import { useLocalSessions } from "../hooks/useLocalSessions";
import SessionCard from "../components/SessionCard";
import ListState from "../components/ListState";

export default function HistoryScreen() {
  const { colors, dark } = useAppTheme();
  const { user } = useAuth();

  const local = useLocalSessions(user?.id);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle={dark ? "light-content" : "dark-content"} />

      <Text variant="titleLarge" style={{ color: colors.onSurface, padding: 12 }}>
        History
      </Text>

      <View style={{ flex: 1 }}>
        <View style={[styles.headerContainer, { borderBottomColor: colors.outline }]}>
          <Text variant="titleMedium" style={{ color: colors.onSurface }}>
            Previous Sessions
          </Text>
          <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>
            Tap a session to view details
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ListState
            loading={local.loading}
            error={local.error}
            empty={local.sessions.length === 0}
            emptyMessage="No sessions yet. Record a session to see it here."
          >
            {local.sessions.map((s) => (
              <SessionCard
                key={s.id}
                dateLabel={formatDateFromMs(s.startedAtMs)}
                durationLabel={formatDurationFromMs(s.durationMs)}
                title="Local Session"
                subtitle={`${s.setCount} ${s.setCount === 1 ? "Set" : "Sets"}`}
                onPress={() =>
                  router.push({
                    pathname: "/session/[sessionId]",
                    params: { sessionId: s.id, source: "sqlite" },
                  })
                }
              />
            ))}
          </ListState>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 8,
  },
});
