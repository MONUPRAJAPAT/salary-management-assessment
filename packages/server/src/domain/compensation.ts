/**
 * Percentage change between two salaries in the same currency, or null when there is no
 * previous salary to compare against. The first record in a history is a hire, not a
 * raise, and showing it as "+100%" would be nonsense.
 */
export function percentageChangeBetween(
  previousMinor: number | undefined,
  currentMinor: number,
): number | null {
  if (previousMinor === undefined || previousMinor === 0) return null;
  return ((currentMinor - previousMinor) / previousMinor) * 100;
}
