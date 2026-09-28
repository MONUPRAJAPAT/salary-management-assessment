import type { BandPosition } from '@acme/shared';

export interface Band {
  minMinor: number;
  midMinor: number;
  maxMinor: number;
}

/**
 * Salary as a multiple of the band midpoint. 1.0 is paid exactly at midpoint; 0.9 is 10%
 * below it. Compa-ratio is the standard way to compare two people paid in different
 * currencies at different levels, because it is already relative to what their own job
 * in their own country is worth.
 */
export function compaRatio(salaryMinor: number, band: Band): number | null {
  if (band.midMinor <= 0) return null;
  return salaryMinor / band.midMinor;
}

/**
 * Bands are inclusive at both ends: someone paid exactly the minimum is at the bottom of
 * their band, not below it. Getting this wrong would put every employee hired at band
 * minimum onto the underpaid list.
 */
export function bandPosition(salaryMinor: number, band: Band): BandPosition {
  if (salaryMinor < band.minMinor) return 'below';
  if (salaryMinor > band.maxMinor) return 'above';
  return 'within';
}
