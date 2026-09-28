import { describe, expect, it } from 'vitest';
import { bandPosition, compaRatio, type Band } from './band';

// $96,000 – $120,000 – $150,000, in minor units.
const band: Band = { minMinor: 9_600_000, midMinor: 12_000_000, maxMinor: 15_000_000 };

describe('compaRatio', () => {
  it('is 1.0 at the band midpoint', () => {
    expect(compaRatio(12_000_000, band)).toBe(1);
  });

  it('is below 1 under the midpoint and above 1 over it', () => {
    expect(compaRatio(9_600_000, band)).toBeCloseTo(0.8, 10);
    expect(compaRatio(15_000_000, band)).toBeCloseTo(1.25, 10);
  });

  it('is null for a band with no midpoint rather than dividing by zero', () => {
    expect(compaRatio(12_000_000, { minMinor: 0, midMinor: 0, maxMinor: 0 })).toBeNull();
  });
});

describe('bandPosition', () => {
  it('is below only under the minimum', () => {
    expect(bandPosition(9_599_999, band)).toBe('below');
  });

  it('counts the minimum itself as within band', () => {
    // Everyone hired at band minimum would otherwise land on the underpaid list.
    expect(bandPosition(9_600_000, band)).toBe('within');
  });

  it('counts the maximum itself as within band', () => {
    expect(bandPosition(15_000_000, band)).toBe('within');
  });

  it('is above only over the maximum', () => {
    expect(bandPosition(15_000_001, band)).toBe('above');
  });
});
