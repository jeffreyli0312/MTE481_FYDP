import React, { useEffect, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Card, Text, Button, ActivityIndicator } from "react-native-paper";
import { Feather } from "@expo/vector-icons";
import { useAppTheme } from "../theme";
import { formatDateShort, formatMinSec } from "../utils/format";
import { useAuth } from "../context/AuthContext";
import {
  initBleDb,
  listSessions,
  listSets,
  listSamplesForSet,
} from "../hooks/bleDb";
import { supabase } from "../../lib/supabase";

type SessionRecord = {
  id: string;
  dateISO: string;
  durationSec: number;
  setsCount: number;
  avgForceN: number;
};

interface ExerciseOverviewProps {
  exerciseName: string;
  onBack: () => void;
  onStartNewSession: () => void;
}

type SupabaseSessionRow = {
  id: string;
  created_at: string;
  label?: string | null;
};

type SupabaseSetRow = {
  id: string;
  session_id: string;
};

type SupabaseImuRow = {
  session_id?: string | null;
  set_id?: string | null;
  time?: number | string | null;
  force?: number | string | null;
  emg_left_tricep?: number | string | null;
  emg_left_pec?: number | string | null;
  emg_right_tricep?: number | string | null;
  emg_right_pec?: number | string | null;
};

export default function ExerciseOverview({
  exerciseName,
  onBack,
  onStartNewSession,
}: ExerciseOverviewProps) {
  const { colors } = useAppTheme();
  const { user } = useAuth();

  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadOverview() {
      if (!user?.id) return;

      try {
        initBleDb();

        const sqliteSessions = listSessions(user.id);

        // ---------- SQLITE ----------
        if (sqliteSessions.length > 0) {
          const mapped: SessionRecord[] = sqliteSessions.map((session) => {
            const sets = listSets(session.id);
            const setsCount = sets.length;

            let minReceivedAt: number | null = null;
            let maxReceivedAt: number | null = null;

            let totalForce = 0;
            let forceCount = 0;

            for (const st of sets) {
              const samples = listSamplesForSet(st.id, 1000);

              for (const smp of samples) {
                const receivedAt = smp.received_at ?? null;

                if (receivedAt != null) {
                  if (minReceivedAt == null || receivedAt < minReceivedAt) {
                    minReceivedAt = receivedAt;
                  }
                  if (maxReceivedAt == null || receivedAt > maxReceivedAt) {
                    maxReceivedAt = receivedAt;
                  }
                }

                const sampleForce =
                  Number(smp.emg_left_tricep ?? 0) +
                  Number(smp.emg_left_pec ?? 0) +
                  Number(smp.emg_right_tricep ?? 0) +
                  Number(smp.emg_right_pec ?? 0);

                totalForce += sampleForce;
                forceCount += 1;
              }
            }

            const durationSec =
              minReceivedAt != null &&
                maxReceivedAt != null &&
                maxReceivedAt >= minReceivedAt
                ? Math.floor((maxReceivedAt - minReceivedAt) / 1000)
                : 0;

            const avgForceN = forceCount > 0 ? totalForce / forceCount : 0;

            return {
              id: session.id,
              dateISO: new Date(session.started_at ?? Date.now()).toISOString(),
              durationSec,
              setsCount,
              avgForceN,
            };
          });

          mapped.sort(
            (a, b) =>
              new Date(b.dateISO).getTime() - new Date(a.dateISO).getTime()
          );

          if (!cancelled) setSessions(mapped);

          return;
        }

        // ---------- SUPABASE ----------
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData.user?.id;

        const { data: sessionRows } = await supabase
          .from("sessions")
          .select("id,created_at,label")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });

        const mapped: SessionRecord[] = (sessionRows ?? []).map((s: any) => ({
          id: s.id,
          dateISO: s.created_at,
          durationSec: 0,
          setsCount: 0,
          avgForceN: 0,
        }));

        if (!cancelled) setSessions(mapped);
      } catch (e) {
        console.error("Failed loading exercise overview", e);
        if (!cancelled) setSessions([]);
      }
    }

    loadOverview();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return (
    <>
      <Pressable onPress={onBack} style={styles.backRow}>
        <Feather name="arrow-left" size={18} color={colors.onSurface} />
        <Text variant="labelLarge" style={{ color: colors.onSurface }}>
          Back to Home
        </Text>
      </Pressable>

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
        {loading ? "Click Below to Start a New Session" : `${sessions.length} sessions completed`}
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