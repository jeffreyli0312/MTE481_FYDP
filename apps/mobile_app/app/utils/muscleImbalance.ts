/**
 * Left/right asymmetry as % of the bilateral mean: 0% = perfect symmetry.
 * |L − R| / mean(L, R) × 100
 */
export function leftRightImbalancePct(
  leftMean: number,
  rightMean: number,
): number | null {
  if (!Number.isFinite(leftMean) || !Number.isFinite(rightMean)) return null;
  const mean = (leftMean + rightMean) / 2;
  if (mean <= 1e-9) return null;
  return Math.round((Math.abs(leftMean - rightMean) / mean) * 100);
}
