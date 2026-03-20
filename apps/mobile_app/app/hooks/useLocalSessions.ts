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
  /** 1-based index among sessions with this label, oldest first (#1 = first session ever). */
  exerciseOrdinal: number | null;
  startedAtMs: number | null;
  endedAtMs: number | null;
  durationMs: number;
  setCount: number;
  sampleCount: number;
  totalEmg: number;
  avgEmg: number;
};

/** Oldest session for a given label is #1; newest gets the highest number. */
function exerciseOrdinalBySessionId(allSessions: SessionRow[]): Map<string, number> {
  const byLabel = new Map<string, SessionRow[]>();
  for (const s of allSessions) {
    if (!s.label) continue;
    const arr = byLabel.get(s.label) ?? [];
    arr.push(s);
    byLabel.set(s.label, arr);
  }
  const map = new Map<string, number>();
  for (const sessions of byLabel.values()) {
    sessions.sort((a, b) => {
      const aMs = Number(a.started_at ?? 0);
      const bMs = Number(b.started_at ?? 0);
      if (aMs !== bMs) return aMs - bMs;
      const aId = parseInt(a.id.replace(/^sess_/, ""), 10) || 0;
      const bId = parseInt(b.id.replace(/^sess_/, ""), 10) || 0;
      return aId - bId;
    });
    sessions.forEach((s, i) => map.set(s.id, i + 1));
  }
  return map;
}

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
      const allRows = listAllSessions();
      const ordinalMap = exerciseOrdinalBySessionId(allRows);
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
          exerciseOrdinal: session.label ? ordinalMap.get(session.id) ?? null : null,
          startedAtMs: session.started_at ?? null,
          endedAtMs: session.ended_at ?? null,
          durationMs,
          setCount: sets.length,
          sampleCount,
          totalEmg,
          avgEmg: sampleCount > 0 ? totalEmg / sampleCount : 0,
        };
      });

      summaries.sort((a, b) => {
        const aMs = Number(a.startedAtMs ?? 0);
        const bMs = Number(b.startedAtMs ?? 0);
        if (bMs !== aMs) return bMs - aMs;
        const aId = parseInt(a.id.replace(/^sess_/, ''), 10) || 0;
        const bId = parseInt(b.id.replace(/^sess_/, ''), 10) || 0;
        return bId - aId;
      });
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
