import { CURRENCIES, LEVELS, type CurrencyCode, type Level } from '@acme/shared';
import { baseScaleFor } from '../db/schema';

/**
 * The organisation's fixed reference data: where ACME operates, what it pays in, and
 * what each level is worth in each country. Hand-authored rather than generated, because
 * these are the numbers a reviewer will sanity-check against intuition.
 */

export const FX_AS_OF = '2026-01-01';

/**
 * Micros of USD per unit of currency. Pinned to a date rather than fetched, so every
 * figure in the demo, the tests and the documentation is reproducible. See ADR-0006.
 */
export const FX_RATES_TO_USD_MICROS: Record<CurrencyCode, number> = {
  USD: 1_000_000,
  EUR: 1_085_000,
  GBP: 1_270_000,
  SGD: 745_000,
  CAD: 720_000,
  AUD: 655_000,
  PLN: 252_000,
  BRL: 178_000,
  INR: 11_700,
  JPY: 6_600,
};

export interface CountrySeed {
  code: string;
  name: string;
  region: string;
  currency: CurrencyCode;
  /** Headcount in this country. The ten add up to exactly 10,000. */
  headcount: number;
  /**
   * Local pay level relative to the US for the same job, before currency conversion.
   * Reflects the market rate an employer actually pays in that country.
   */
  marketFactor: number;
  /** Which name pool employees in this country are generated from. */
  nameLocale: NameLocale;
}

export type NameLocale =
  | 'north_america'
  | 'uk'
  | 'germany'
  | 'poland'
  | 'india'
  | 'singapore'
  | 'australia'
  | 'japan'
  | 'brazil';

export const COUNTRIES: readonly CountrySeed[] = [
  {
    code: 'IN',
    name: 'India',
    region: 'APAC',
    currency: 'INR',
    headcount: 2600,
    marketFactor: 0.3,
    nameLocale: 'india',
  },
  {
    code: 'US',
    name: 'United States',
    region: 'Americas',
    currency: 'USD',
    headcount: 2400,
    marketFactor: 1.0,
    nameLocale: 'north_america',
  },
  {
    code: 'PL',
    name: 'Poland',
    region: 'EMEA',
    currency: 'PLN',
    headcount: 900,
    marketFactor: 0.42,
    nameLocale: 'poland',
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    region: 'EMEA',
    currency: 'GBP',
    headcount: 800,
    marketFactor: 0.72,
    nameLocale: 'uk',
  },
  {
    code: 'DE',
    name: 'Germany',
    region: 'EMEA',
    currency: 'EUR',
    headcount: 800,
    marketFactor: 0.68,
    nameLocale: 'germany',
  },
  {
    code: 'BR',
    name: 'Brazil',
    region: 'Americas',
    currency: 'BRL',
    headcount: 700,
    marketFactor: 0.33,
    nameLocale: 'brazil',
  },
  {
    code: 'CA',
    name: 'Canada',
    region: 'Americas',
    currency: 'CAD',
    headcount: 550,
    marketFactor: 0.74,
    nameLocale: 'north_america',
  },
  {
    code: 'AU',
    name: 'Australia',
    region: 'APAC',
    currency: 'AUD',
    headcount: 450,
    marketFactor: 0.7,
    nameLocale: 'australia',
  },
  {
    code: 'SG',
    name: 'Singapore',
    region: 'APAC',
    currency: 'SGD',
    headcount: 450,
    marketFactor: 0.72,
    nameLocale: 'singapore',
  },
  {
    code: 'JP',
    name: 'Japan',
    region: 'APAC',
    currency: 'JPY',
    headcount: 350,
    marketFactor: 0.62,
    nameLocale: 'japan',
  },
];

export const TOTAL_HEADCOUNT = COUNTRIES.reduce((sum, country) => sum + country.headcount, 0);

/** US band midpoints in USD major units. Every other country scales from these. */
export const US_BAND_MIDPOINT_USD: Record<Level, number> = {
  IC1: 78_000,
  IC2: 104_000,
  IC3: 138_000,
  IC4: 176_000,
  IC5: 218_000,
  IC6: 268_000,
  M1: 166_000,
  M2: 202_000,
  M3: 252_000,
  M4: 322_000,
};

/** Bands run from 80% to 125% of midpoint — a conventional ±20/25% spread. */
export const BAND_MIN_RATIO = 0.8;
export const BAND_MAX_RATIO = 1.25;

export interface SalaryBandSeed {
  countryCode: string;
  level: Level;
  currency: CurrencyCode;
  minMinor: number;
  midMinor: number;
  maxMinor: number;
}

/**
 * Rounds a local-currency amount to a figure a compensation team would actually publish:
 * whole thousands for high-denomination currencies like INR and JPY, whole hundreds
 * elsewhere. A band of ₹1,847,263 would be obviously machine-generated.
 */
export function roundToBandIncrement(minorAmount: number, currency: CurrencyCode): number {
  const exponent = CURRENCIES[currency].exponent;
  const majorPerMinor = 10 ** exponent;
  const increment = currency === 'INR' || currency === 'JPY' ? 1_000 : 100;
  const incrementInMinor = increment * majorPerMinor;
  return Math.max(incrementInMinor, Math.round(minorAmount / incrementInMinor) * incrementInMinor);
}

/** 100 bands: ten levels in each of ten countries. */
export function buildSalaryBands(): SalaryBandSeed[] {
  const bands: SalaryBandSeed[] = [];

  for (const country of COUNTRIES) {
    const rate = FX_RATES_TO_USD_MICROS[country.currency];
    const localScale = baseScaleFor(country.currency);

    for (const level of LEVELS) {
      const midUsd = US_BAND_MIDPOINT_USD[level] * country.marketFactor;
      // USD major -> USD minor -> local minor, all integer-friendly.
      const midUsdMinor = Math.round(midUsd * 100);
      const midLocalMinor = Math.round((midUsdMinor * 1_000_000) / (rate * localScale));

      const midMinor = roundToBandIncrement(midLocalMinor, country.currency);
      bands.push({
        countryCode: country.code,
        level,
        currency: country.currency,
        minMinor: roundToBandIncrement(midMinor * BAND_MIN_RATIO, country.currency),
        midMinor,
        maxMinor: roundToBandIncrement(midMinor * BAND_MAX_RATIO, country.currency),
      });
    }
  }

  return bands;
}

export function currencyRows(): Array<{
  code: CurrencyCode;
  name: string;
  exponent: number;
  base_scale: number;
}> {
  return (Object.keys(CURRENCIES) as CurrencyCode[]).map((code) => ({
    code,
    name: CURRENCIES[code].name,
    exponent: CURRENCIES[code].exponent,
    base_scale: baseScaleFor(code),
  }));
}
