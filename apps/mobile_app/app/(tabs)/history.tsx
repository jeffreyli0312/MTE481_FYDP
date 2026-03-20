import React, { useCallback, useState } from "react";
import { router } from "expo-router";
import {
  ScrollView,
  View,
  StyleSheet,
  StatusBar,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, Chip } from "react-native-paper";
import { useAppTheme } from "../theme";
import { useAuth } from "../context/AuthContext";
import { formatDateFromMs, formatDurationFromMs } from "../utils/format";
import { useLocalSessions } from "../hooks/useLocalSessions";
import SessionCard from "../components/SessionCard";
import ListState from "../components/ListState";
import { AVAILABLE_EXERCISES } from "../constants/exercises";

export default function HistoryScreen() {
  const { colors, dark } = useAppTheme();
  const { user } = useAuth();

  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const local = useLocalSessions(user?.id, selectedExercise ?? undefined);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    local.reload();
    setRefreshing(false);
  }, [local]);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle={dark ? "light-content" : "dark-content"} />

      <Text variant="headlineSmall" style={{ color: colors.onSurface, paddingBottom: 16, paddingHorizontal: 20, letterSpacing: -0.3 }}>
        History
      </Text>

      <View style={{ flex: 1 }}>
        <View style={[styles.headerContainer, { borderBottomColor: colors.outline }]}>
          <Text variant="titleMedium" style={{ color: colors.onSurface }}>
            Previous Sessions
          </Text>
          <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>
            Pull down to refresh
          </Text>
        </View>

        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScrollContent}
          >
            <Chip
              selected={selectedExercise === null}
              onPress={() => setSelectedExercise(null)}
              style={styles.chip}
              showSelectedOverlay
              selectedColor={colors.primary}
            >
              All
            </Chip>
            {AVAILABLE_EXERCISES.map((ex) => (
              <Chip
                key={ex.id}
                selected={selectedExercise === ex.name}
                onPress={() => setSelectedExercise(ex.name)}
                style={styles.chip}
                showSelectedOverlay
                selectedColor={colors.primary}
              >
                {ex.name}
              </Chip>
            ))}
          </ScrollView>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          <ListState
            loading={local.loading}
            error={local.error}
            empty={local.sessions.length === 0}
            emptyMessage="No sessions yet. Record a session to see it here."
          >
            {local.sessions.map((s, idx) => (
              <SessionCard
                key={s.id}
                dateLabel={formatDateFromMs(s.startedAtMs)}
                durationLabel={formatDurationFromMs(s.durationMs)}
                title={
                  s.label
                    ? selectedExercise
                      ? `${s.label} #${idx + 1}`
                      : s.label
                    : `Session ${local.sessions.length - idx}`
                }
                subtitle={`${s.setCount} ${s.setCount === 1 ? "Set" : "Sets"} · ${s.sampleCount} samples`}
                onPress={() =>
                  router.push({
                    pathname: "/session/[sessionId]",
                    params: {
                      sessionId: s.id,
                      source: "sqlite",
                      title: s.label ?? undefined,
                    },
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
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterScrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  chip: {
    marginRight: 4,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
});
