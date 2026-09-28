import { currencyExponent, type CurrencyCode } from './currency';

/**
 * An amount of money as an integer count of minor units, inseparable from its currency.
 *
 *   { amountMinor: 8_500_000, currency: 'INR' }  =  ₹85,000.00
 *   { amountMinor: 8_500_000, currency: 'JPY' }  =  ¥8,500,000   (exponent 0)
 *
 * Floating point is never used to represent or accumulate money. See ADR-0003.
 */
export interface Money {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
}

/** Exchange rates as integer micros of USD per unit of the currency (1 USD = 1_000_000). */
export type FxRateTable = Readonly<Partial<Record<CurrencyCode, number>>>;

export class CurrencyMismatchError extends Error {
  constructor(left: CurrencyCode, right: CurrencyCode) {
    super(`Cannot combine ${left} with ${right}. Convert to a common currency first.`);
    this.name = 'CurrencyMismatchError';
  }
}

export class MissingExchangeRateError extends Error {
  constructor(currency: CurrencyCode) {
    super(`No exchange rate available for ${currency}.`);
    this.name = 'MissingExchangeRateError';
  }
}

export function money(amountMinor: number, currency: CurrencyCode): Money {
  if (!Number.isInteger(amountMinor)) {
    throw new RangeError(
      `Money must be a whole integer number of minor units, received ${amountMinor}.`,
    );
  }
  if (!Number.isSafeInteger(amountMinor)) {
    throw new RangeError(`Money amount ${amountMinor} exceeds safe integer precision.`);
  }
  return { amountMinor, currency };
}

export function zeroMoney(currency: CurrencyCode): Money {
  return { amountMinor: 0, currency };
}

function assertSameCurrency(left: Money, right: Money): void {
  if (left.currency !== right.currency) {
    throw new CurrencyMismatchError(left.currency, right.currency);
  }
}

export function addMoney(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return money(left.amountMinor + right.amountMinor, left.currency);
}

export function subtractMoney(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return money(left.amountMinor - right.amountMinor, left.currency);
}

export function sumMoney(amounts: readonly Money[], currency: CurrencyCode): Money {
  return amounts.reduce((total, amount) => addMoney(total, amount), zeroMoney(currency));
}

/** Multiplies by a factor (1.07 for a 7% raise) and rounds to whole minor units. */
export function scaleMoney(amount: Money, factor: number): Money {
  return money(roundHalfAwayFromZero(amount.amountMinor * factor), amount.currency);
}

/**
 * Percentage difference from `before` to `after`, or null when `before` is zero —
 * a raise from nothing has no meaningful percentage.
 */
export function percentageChange(before: Money, after: Money): number | null {
  assertSameCurrency(before, after);
  if (before.amountMinor === 0) return null;
  return ((after.amountMinor - before.amountMinor) / before.amountMinor) * 100;
}

export function compareMoney(left: Money, right: Money): number {
  assertSameCurrency(left, right);
  return left.amountMinor - right.amountMinor;
}

/**
 * Converts between currencies through their USD rates.
 *
 *   target = amountMinor × (rateFrom / rateTo) × 10^(targetExponent − sourceExponent)
 *
 * Evaluated as one exact rational over BigInt so that no intermediate overflows or
 * rounds, with a single half-away-from-zero rounding at the very end. Routing through
 * USD with two separate roundings would introduce an avoidable error on every
 * non-USD-to-non-USD conversion.
 */
export function convertMoney(amount: Money, target: CurrencyCode, rates: FxRateTable): Money {
  if (amount.currency === target) return amount;

  const rateFrom = rates[amount.currency];
  const rateTo = rates[target];
  if (rateFrom === undefined) throw new MissingExchangeRateError(amount.currency);
  if (rateTo === undefined) throw new MissingExchangeRateError(target);

  let numerator = BigInt(amount.amountMinor) * BigInt(rateFrom);
  let denominator = BigInt(rateTo);

  const exponentShift = currencyExponent(target) - currencyExponent(amount.currency);
  if (exponentShift > 0) numerator *= 10n ** BigInt(exponentShift);
  else if (exponentShift < 0) denominator *= 10n ** BigInt(-exponentShift);

  return money(Number(divideRoundHalfAwayFromZero(numerator, denominator)), target);
}

/** Major units, for display only. Never feed the result back into a calculation. */
export function toMajorUnits(amount: Money): number {
  return amount.amountMinor / 10 ** currencyExponent(amount.currency);
}

export function formatMoney(amount: Money, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: amount.currency,
  }).format(toMajorUnits(amount));
}

/** Compact form for dense tables and chart axes: "$1.2M", "₹84.0L"-free, plain SI. */
export function formatMoneyCompact(amount: Money, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: amount.currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(toMajorUnits(amount));
}

function roundHalfAwayFromZero(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

function divideRoundHalfAwayFromZero(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError('Division by zero.');
  const isNegative = numerator < 0n !== denominator < 0n;
  const absNumerator = numerator < 0n ? -numerator : numerator;
  const absDenominator = denominator < 0n ? -denominator : denominator;
  const quotient = absNumerator / absDenominator;
  const remainder = absNumerator % absDenominator;
  const rounded = remainder * 2n >= absDenominator ? quotient + 1n : quotient;
  return isNegative ? -rounded : rounded;
}
