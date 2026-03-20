/**
 * IMU-free shoulder flare for demos: stable pseudo-random degrees from a seed
 * (same seed → same value when you reopen a set/session).
 */
export function pseudoRandomShoulderFlareDeg(seed: string): {
  maxDev: number;
  absDeg: number;
} {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  const u = (h >>> 0) / 0xffff_ffff;
  const absDeg = Math.round((8 + u * 62) * 10) / 10; // 8° … 70°
  const sign = h & 1 ? -1 : 1;
  return { maxDev: sign * absDeg, absDeg };
}
