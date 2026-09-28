/**
 * The currencies ACME pays in.
 *
 * Declared as a literal tuple first so the type, the Zod enum and the runtime list are
 * all derived from one place — there is no way to add a currency to the validator and
 * forget the metadata, or vice versa.
 */
export const CURRENCY_CODES = [
  'USD',
  'EUR',
  'GBP',
  'INR',
  'SGD',
  'AUD',
  'CAD',
  'BRL',
  'PLN',
  'JPY',
] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

/**
 * `exponent` is how many decimal places the currency subdivides into — how many minor
 * units make one major unit (10^exponent). It is 2 for most currencies but 0 for JPY:
 * ¥1 is one minor unit, not 100. Every conversion and every format has to respect this,
 * which is why it lives in a table rather than a hardcoded `/ 100`.
 */
export const CURRENCIES: Record<CurrencyCode, { name: string; exponent: number }> = {
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
};

/** The currency every cross-country comparison is normalised to. See ADR-0006. */
export const BASE_CURRENCY = 'USD' satisfies CurrencyCode;

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && value in CURRENCIES;
}

export function currencyExponent(code: CurrencyCode): number {
  return CURRENCIES[code].exponent;
}
