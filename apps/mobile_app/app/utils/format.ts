export function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

export function formatMMSS(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${pad2(m)}:${pad2(s)}`;
}

export function formatMinSec(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}m ${s}s`;
}

export function formatDateShort(dateISO: string) {
  const d = new Date(dateISO);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateFromMs(ms: number | null | undefined) {
  if (ms == null) return "\u2014";
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDurationFromMs(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return "\u2014";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s}s`;
}

/**
 * Streaming moving average filter.
 * Maintains an internal circular buffer; call `push(value)` for each new
 * sample and it returns the current windowed average.
 */
export class MovingAverage {
  private buf: number[];
  private sum = 0;
  private idx = 0;
  private count = 0;
  readonly windowSize: number;

  constructor(windowSize: number) {
    this.windowSize = Math.max(1, windowSize);
    this.buf = new Array(this.windowSize).fill(0);
  }

  push(value: number): number {
    if (this.count >= this.windowSize) {
      this.sum -= this.buf[this.idx];
    }
    this.buf[this.idx] = value;
    this.sum += value;
    this.idx = (this.idx + 1) % this.windowSize;
    this.count = Math.min(this.count + 1, this.windowSize);
    return this.sum / this.count;
  }

  reset() {
    this.buf.fill(0);
    this.sum = 0;
    this.idx = 0;
    this.count = 0;
  }
}

/** Apply a moving average to an array of {time, value} points (batch/offline). */
export function movingAverageSmooth(
  points: { time: number; value: number }[],
  windowSize: number,
): { time: number; value: number }[] {
  if (points.length === 0 || windowSize <= 1) return points;
  const ma = new MovingAverage(windowSize);
  return points.map((p) => ({ time: p.time, value: ma.push(p.value) }));
}

export function emaSmooth(
  points: { time: number; value: number }[],
  alpha = 0.2
): { time: number; value: number }[] {
  if (points.length === 0) return points;
  const a = Math.max(0.001, Math.min(0.999, alpha));
  const out: { time: number; value: number }[] = [];
  let prev = points[0].value;
  out.push({ time: points[0].time, value: prev });
  for (let i = 1; i < points.length; i++) {
    const v = points[i].value;
    const s = a * v + (1 - a) * prev;
    prev = s;
    out.push({ time: points[i].time, value: s });
  }
  return out;
}
