import type { RepRow } from "../sqlite/bleDb";

export function repDurationMs(r: RepRow): number {
  const ws = r.wall_start_ms;
  const we = r.wall_end_ms;
  if (ws != null && we != null && we >= ws) return we - ws;
  if (r.end_ms != null && r.end_ms >= r.start_ms) return r.end_ms - r.start_ms;
  return 0;
}

/** Prefer phone wall clock (rep window on device); fall back to ESP `t_ms` span. */
export function averageRepDurationMs(reps: RepRow[]): number {
  if (reps.length === 0) return 0;
  let sum = 0;
  let n = 0;
  for (const r of reps) {
    const d = repDurationMs(r);
    if (d > 0) {
      sum += d;
      n++;
    }
  }
  return n > 0 ? sum / n : 0;
}

/**
 * Estimated recovery between reps: mean(start[i]−start[i−1]) − mean rep wall duration.
 * Raw flush→next-first-sample gaps are ~BLE latency and are not useful for UX.
 * Requires wall_* on reps (new recordings); otherwise null.
 */
export function averageEstimatedRecoveryMs(reps: RepRow[]): number | null {
  if (reps.length < 2) return null;
  let sumDelta = 0;
  let nDelta = 0;
  for (let i = 1; i < reps.length; i++) {
    const a = reps[i - 1].wall_start_ms;
    const b = reps[i].wall_start_ms;
    if (a != null && b != null && b >= a) {
      sumDelta += b - a;
      nDelta++;
    }
  }
  if (nDelta === 0) return null;
  const avgStartInterval = sumDelta / nDelta;
  const avgRepLen = averageRepDurationMs(reps);
  if (avgRepLen <= 0) return null;
  const gap = avgStartInterval - avgRepLen;
  return Math.max(0, gap);
}
