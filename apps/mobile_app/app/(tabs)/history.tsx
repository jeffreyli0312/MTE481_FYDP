import React, { useEffect, useState } from "react";
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
import { supabase } from "../../lib/supabase";
import {
  formatDateShort,
  formatDateFromMs,
  formatDurationFromMs,
  formatMinSec,
} from "../utils/format";
import { useLocalSessions } from "../hooks/useLocalSessions";
import SessionCard from "../components/SessionCard";
import ListState from "../components/ListState";

type SupabaseSession = {
  id: string;
  label: string | null;
  created_at: string;
};

export default function HistoryScreen() {
  const { colors, dark } = useAppTheme();
  const { user } = useAuth();

  // Local SQLite sessions via shared hook
  const local = useLocalSessions(user?.id);

  // Supabase sessions
  const [supabaseSessions, setSupabaseSessions] = useState<SupabaseSession[]>([]);
  const [supabaseLoading, setSupabaseLoading] = useState(true);
  const [supabaseError, setSupabaseError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSupabase() {
      setSupabaseLoading(true);
      setSupabaseError(null);

      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;

        const userId = authData.user?.id;
        if (!userId) throw new Error("Not logged in");

        const { data, error } = await supabase
          .from("sessions")
          .select("id,label,created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });

        if (error) throw error;

        if (!cancelled) {
          setSupabaseSessions((data ?? []) as SupabaseSession[]);
          setSupabaseLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setSupabaseError(e?.message ?? "Failed to load sessions");
          setSupabaseLoading(false);
        }
      }
    }

    loadSupabase();
    return () => { cancelled = true; };
  }, []);

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
            Tap a session to expand
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* ── Local SQLite Sessions ── */}
          <View style={{ marginBottom: 24 }}>
            <Text
              variant="titleMedium"
              style={{ color: colors.onSurface, marginBottom: 12 }}
            >
              Local Sessions
            </Text>

            <ListState
              loading={local.loading}
              error={local.error}
              empty={local.sessions.length === 0}
              emptyMessage="No local sessions yet. Record a session to see it here."
            >
              {local.sessions.map((s) => (
                <SessionCard
                  key={`local-${s.id}`}
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
          </View>

          {/* ── Supabase Sessions ── */}
          <View>
            <Text
              variant="titleMedium"
              style={{ color: colors.onSurface, marginBottom: 12 }}
            >
              Supabase Sessions
            </Text>

            <ListState
              loading={supabaseLoading}
              error={supabaseError}
              empty={supabaseSessions.length === 0}
              emptyMessage="No remote sessions found."
            >
              {supabaseSessions.map((s, idx) => (
                <SessionCard
                  key={s.id}
                  dateLabel={formatDateShort(s.created_at)}
                  durationLabel="\u2014"
                  title={s.label?.trim() ? s.label : `Session ${supabaseSessions.length - idx}`}
                  subtitle="Sets"
                  onPress={() =>
                    router.push({
                      pathname: "/session/[sessionId]",
                      params: { sessionId: s.id, source: "supabase" },
                    })
                  }
                />
              ))}
            </ListState>
          </View>
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
