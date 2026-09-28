/**
 * Descriptive statistics for compensation analysis.
 *
 * All functions here use the *nearest-rank* percentile: the smallest observation at or
 * above the p-th position in the sorted list. It always returns a salary someone is
 * actually paid, which is what a compensation benchmark should be. The analytics SQL
 * implements the identical definition with CUME_DIST(), and an integration test asserts
 * the two agree on the same data. See ADR-0006.
 */

export interface Summary {
  count: number;
  sum: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  median: number | null;
  p25: number | null;
  p75: number | null;
  p90: number | null;
}

export function percentile(values: readonly number[], p: number): number | null {
  if (Number.isNaN(p) || p < 0 || p > 1) {
    throw new RangeError(`Percentile must be between 0 and 1, received ${p}.`);
  }
  if (values.length === 0) return null;
  const sorted = [...values].sort(ascending);
  return nearestRank(sorted, p);
}

export function median(values: readonly number[]): number | null {
  return percentile(values, 0.5);
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce(add, 0) / values.length;
}

/** Everything the insights views need, sorting the input exactly once. */
export function summarise(values: readonly number[]): Summary {
  const sorted = [...values].sort(ascending);
  const count = sorted.length;
  const sum = sorted.reduce(add, 0);

  if (count === 0) {
    return {
      count: 0,
      sum: 0,
      min: null,
      max: null,
      mean: null,
      median: null,
      p25: null,
      p75: null,
      p90: null,
    };
  }

  return {
    count,
    sum,
    min: sorted[0] ?? null,
    max: sorted[count - 1] ?? null,
    mean: sum / count,
    median: nearestRank(sorted, 0.5),
    p25: nearestRank(sorted, 0.25),
    p75: nearestRank(sorted, 0.75),
    p90: nearestRank(sorted, 0.9),
  };
}

/**
 * How far below the reference group the comparison group is paid, as a percentage.
 * A pay gap of 8 means the comparison group's figure is 8% lower than the reference's.
 */
export function gapPercent(reference: number | null, comparison: number | null): number | null {
  if (reference === null || comparison === null || reference === 0) return null;
  return ((reference - comparison) / reference) * 100;
}

function nearestRank(sorted: readonly number[], p: number): number | null {
  const index = clamp(Math.ceil(p * sorted.length) - 1, 0, sorted.length - 1);
  return sorted[index] ?? null;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

const ascending = (a: number, b: number): number => a - b;
const add = (total: number, value: number): number => total + value;
