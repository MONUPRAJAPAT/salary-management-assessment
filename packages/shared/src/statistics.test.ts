import { describe, expect, it } from 'vitest';
import { gapPercent, mean, median, percentile, summarise } from './statistics';

/**
 * The definition used throughout the product is the *nearest-rank* percentile:
 * the smallest value at or above the p-th position in the sorted list. It always
 * returns a real observation — an actual salary someone is paid — rather than an
 * interpolated figure that belongs to nobody. The analytics SQL implements the same
 * definition with CUME_DIST(), and an integration test asserts the two agree.
 * See ADR-0006.
 */
describe('percentile (nearest-rank)', () => {
  it('returns the middle value of an odd-sized set', () => {
    expect(median([10, 30, 20, 50, 40])).toBe(30);
  });

  it('returns the lower of the two middle values of an even-sized set', () => {
    expect(median([10, 20, 30, 40])).toBe(20);
  });

  it('does not care about input order', () => {
    expect(median([40, 10, 30, 20])).toBe(20);
  });

  it('handles a single value', () => {
    expect(median([42])).toBe(42);
  });

  it('returns null for an empty set rather than NaN', () => {
    expect(median([])).toBeNull();
    expect(percentile([], 0.9)).toBeNull();
    expect(mean([])).toBeNull();
  });

  it('places the quartiles by rank', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(values, 0.25)).toBe(3); // ceil(0.25 * 10) = 3rd value
    expect(percentile(values, 0.5)).toBe(5);
    expect(percentile(values, 0.75)).toBe(8);
    expect(percentile(values, 0.9)).toBe(9);
    expect(percentile(values, 1)).toBe(10);
    expect(percentile(values, 0)).toBe(1);
  });

  it('copes with repeated values', () => {
    expect(median([5, 5, 5, 5, 100])).toBe(5);
  });

  it('rejects a percentile outside 0..1', () => {
    expect(() => percentile([1, 2, 3], 50)).toThrow(/between 0 and 1/i);
  });

  it('does not mutate the caller’s array', () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });
});

describe('summarise', () => {
  it('describes a set of salaries in one pass', () => {
    expect(summarise([100, 200, 300, 400, 500])).toEqual({
      count: 5,
      sum: 1500,
      min: 100,
      max: 500,
      mean: 300,
      median: 300,
      p25: 200,
      p75: 400,
      p90: 500,
    });
  });

  it('returns nulls, not zeroes, for an empty set — "no data" is not "paid nothing"', () => {
    expect(summarise([])).toEqual({
      count: 0,
      sum: 0,
      min: null,
      max: null,
      mean: null,
      median: null,
      p25: null,
      p75: null,
      p90: null,
    });
  });
});

describe('gapPercent', () => {
  it('expresses the shortfall of a group against a reference group', () => {
    // Reference median 100,000; comparison median 92,000 -> an 8% gap.
    expect(gapPercent(100_000, 92_000)).toBeCloseTo(8, 10);
  });

  it('returns a negative gap when the comparison group is paid more', () => {
    expect(gapPercent(100_000, 110_000)).toBeCloseTo(-10, 10);
  });

  it('is null when either side has no data or the reference is zero', () => {
    expect(gapPercent(null, 92_000)).toBeNull();
    expect(gapPercent(100_000, null)).toBeNull();
    expect(gapPercent(0, 92_000)).toBeNull();
  });
});
