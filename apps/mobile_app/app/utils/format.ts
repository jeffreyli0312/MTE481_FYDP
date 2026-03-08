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
