import { useCallback, useEffect, useState } from "react";
import {
  initBleDb,
  listAllSessions,
  listSets,
  listSamplesForSet,
  countSamplesForSet,
  type SessionRow,
  type SetRow,
} from "../sqlite/bleDb";

export type LocalSessionSummary = {
  id: string;
  label: string | null;
  startedAtMs: number | null;
  endedAtMs: number | null;
  durationMs: number;
  setCount: number;
  sampleCount: number;
  totalEmg: number;
  avgEmg: number;
};

/**
 * Loads all local SQLite sessions and computes summary stats for each.
 * The userId param is kept for API compatibility but all sessions are loaded.
 */
export function useLocalSessions(_userId?: string | undefined, exerciseName?: string) {
  const [sessions, setSessions] = useState<LocalSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);

    try {
      initBleDb();
      const rows = listAllSessions(exerciseName);

      const summaries: LocalSessionSummary[] = rows.map((session: SessionRow) => {
        const sets: SetRow[] = listSets(session.id);

        let minReceived: number | null = null;
        let maxReceived: number | null = null;
        let sampleCount = 0;
        let totalEmg = 0;

        for (const st of sets) {
          const count = countSamplesForSet(st.id);
          sampleCount += count;

          if (count > 0) {
            const samples = listSamplesForSet(st.id, count);
            for (const smp of samples) {
              const ra = smp.received_at ?? null;
              if (ra != null) {
                if (minReceived == null || ra < minReceived) minReceived = ra;
                if (maxReceived == null || ra > maxReceived) maxReceived = ra;
              }
              totalEmg +=
                Number(smp.emg_left_tricep ?? 0) +
                Number(smp.emg_left_pec ?? 0) +
                Number(smp.emg_right_tricep ?? 0) +
                Number(smp.emg_right_pec ?? 0);
            }
          }
        }

        const durationMs =
          minReceived != null && maxReceived != null
            ? Math.max(0, maxReceived - minReceived)
            : 0;

        return {
          id: session.id,
          label: session.label ?? null,
          startedAtMs: session.started_at ?? null,
          endedAtMs: session.ended_at ?? null,
          durationMs,
          setCount: sets.length,
          sampleCount,
          totalEmg,
          avgEmg: sampleCount > 0 ? totalEmg / sampleCount : 0,
        };
      });

      summaries.sort((a, b) => (b.startedAtMs ?? 0) - (a.startedAtMs ?? 0));
      setSessions(summaries);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load local sessions");
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [exerciseName]);

  useEffect(() => {
    load();
  }, [load, exerciseName]);

  return { sessions, loading, error, reload: load };
}
