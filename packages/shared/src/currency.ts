/**
 * Currency metadata.
 *
 * `exponent` is the number of decimal places the currency subdivides into, i.e. how
 * many minor units make one major unit (10^exponent). It is 2 for most currencies but
 * 0 for JPY — ¥1 is one minor unit, not 100. Every conversion and every format has to
 * respect this, which is why it lives in one table rather than a hardcoded `/ 100`.
 */
export const CURRENCIES = {
  USD: { name: 'US Dollar', exponent: 2 },
  EUR: { name: 'Euro', exponent: 2 },
  GBP: { name: 'Pound Sterling', exponent: 2 },
  INR: { name: 'Indian Rupee', exponent: 2 },
  SGD: { name: 'Singapore Dollar', exponent: 2 },
  AUD: { name: 'Australian Dollar', exponent: 2 },
  CAD: { name: 'Canadian Dollar', exponent: 2 },
  BRL: { name: 'Brazilian Real', exponent: 2 },
  PLN: { name: 'Polish Zloty', exponent: 2 },
  JPY: { name: 'Japanese Yen', exponent: 0 },
} as const satisfies Record<string, { name: string; exponent: number }>;

export type CurrencyCode = keyof typeof CURRENCIES;

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

/** The currency every cross-country comparison is normalised to. See ADR-0006. */
export const BASE_CURRENCY: CurrencyCode = 'USD';

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && value in CURRENCIES;
}

export function currencyExponent(code: CurrencyCode): number {
  return CURRENCIES[code].exponent;
}
