import { describe, expect, it } from 'vitest';
import {
  CurrencyMismatchError,
  addMoney,
  compareMoney,
  convertMoney,
  formatMoney,
  money,
  percentageChange,
  scaleMoney,
  subtractMoney,
  toMajorUnits,
} from './money';

/**
 * Exchange rates expressed as micros-per-unit against USD: how many millionths of a
 * US dollar one unit of the currency is worth. Integers, so the rate table itself
 * never introduces floating-point drift. These are the fixtures the tests reason with.
 */
const RATES = {
  USD: 1_000_000, // $1.00
  INR: 12_000, // ₹1 = $0.012
  JPY: 6_700, // ¥1 = $0.0067
  EUR: 1_080_000, // €1 = $1.08
} as const;

describe('money construction', () => {
  it('holds an integer count of minor units and its currency', () => {
    expect(money(8_500_000, 'INR')).toEqual({ amountMinor: 8_500_000, currency: 'INR' });
  });

  it('rejects fractional minor units, because half a cent is not a salary', () => {
    expect(() => money(100.5, 'USD')).toThrow(/integer/i);
  });

  it('rejects amounts beyond safe integer precision', () => {
    expect(() => money(Number.MAX_SAFE_INTEGER + 2, 'USD')).toThrow(/safe/i);
  });

  it('allows negative amounts, which represent downward adjustments', () => {
    expect(money(-5_000, 'USD').amountMinor).toBe(-5_000);
  });
});

describe('arithmetic', () => {
  it('adds and subtracts amounts in the same currency', () => {
    expect(addMoney(money(10_000, 'USD'), money(2_550, 'USD'))).toEqual(money(12_550, 'USD'));
    expect(subtractMoney(money(10_000, 'USD'), money(2_550, 'USD'))).toEqual(money(7_450, 'USD'));
  });

  it('refuses to add different currencies instead of silently producing a wrong number', () => {
    expect(() => addMoney(money(10_000, 'USD'), money(10_000, 'EUR'))).toThrow(
      CurrencyMismatchError,
    );
  });

  describe('scaleMoney', () => {
    it('applies a multiplier and returns whole minor units', () => {
      // A 7% raise on $120,000.00
      expect(scaleMoney(money(12_000_000, 'USD'), 1.07)).toEqual(money(12_840_000, 'USD'));
    });

    it('rounds halves away from zero, so a raise is never rounded down to nothing', () => {
      expect(scaleMoney(money(5, 'USD'), 1.1).amountMinor).toBe(6); // 5.5 -> 6
      expect(scaleMoney(money(-5, 'USD'), 1.1).amountMinor).toBe(-6); // -5.5 -> -6
    });
  });

  it('reports percentage change between two amounts', () => {
    expect(percentageChange(money(10_000_000, 'USD'), money(10_700_000, 'USD'))).toBeCloseTo(7, 10);
    expect(percentageChange(money(0, 'USD'), money(10_000, 'USD'))).toBeNull();
  });

  it('orders amounts of the same currency', () => {
    const sorted = [money(300, 'USD'), money(100, 'USD'), money(200, 'USD')].sort(compareMoney);
    expect(sorted.map((m) => m.amountMinor)).toEqual([100, 200, 300]);
  });
});

describe('currency conversion', () => {
  it('converts a rupee salary to dollars', () => {
    // ₹1,800,000.00 at $0.012 = $21,600.00
    expect(convertMoney(money(180_000_000, 'INR'), 'USD', RATES)).toEqual(money(2_160_000, 'USD'));
  });

  it('handles currencies with a different minor-unit exponent', () => {
    // ¥8,500,000 (exponent 0) at $0.0067 = $56,950.00 -> 5,695,000 cents
    expect(convertMoney(money(8_500_000, 'JPY'), 'USD', RATES)).toEqual(money(5_695_000, 'USD'));
  });

  it('converts back out of a zero-exponent currency', () => {
    // $56,950.00 at ¥1 = $0.0067 -> ¥8,500,000
    expect(convertMoney(money(5_695_000, 'USD'), 'JPY', RATES)).toEqual(money(8_500_000, 'JPY'));
  });

  it('converts between two non-base currencies in a single rounding step', () => {
    // €1.00 = $1.08; ₹1 = $0.012  =>  €1.00 = ₹90.00
    expect(convertMoney(money(100, 'EUR'), 'INR', RATES)).toEqual(money(9_000, 'INR'));
  });

  it('is a no-op when the target currency is the source currency', () => {
    const original = money(123_456, 'EUR');
    expect(convertMoney(original, 'EUR', RATES)).toEqual(original);
  });

  it('stays exact where the intermediate product leaves safe-integer range', () => {
    // ₹9,000,000,000,000.00 at $0.012 = $108,000,000,000.00.
    // The intermediate (amountMinor × rate) is 1.08e19 — three orders of magnitude
    // past Number.MAX_SAFE_INTEGER, where a double carries no guarantee of counting
    // individual units. The BigInt rational is exact by construction.
    expect(Number.isSafeInteger(900_000_000_000_000 * RATES.INR)).toBe(false);
    expect(convertMoney(money(900_000_000_000_000, 'INR'), 'USD', RATES)).toEqual(
      money(10_800_000_000_000, 'USD'),
    );
  });

  it('round-trips a non-base currency pair without drift', () => {
    const original = money(9_000, 'INR'); // ₹90.00
    const viaEuro = convertMoney(original, 'EUR', RATES);
    expect(viaEuro).toEqual(money(100, 'EUR')); // €1.00
    expect(convertMoney(viaEuro, 'INR', RATES)).toEqual(original);
  });
});

describe('presentation', () => {
  it('converts to major units only for display', () => {
    expect(toMajorUnits(money(8_500_000, 'INR'))).toBe(85_000);
    expect(toMajorUnits(money(8_500_000, 'JPY'))).toBe(8_500_000);
  });

  it('formats with the currency symbol and the right number of decimals', () => {
    expect(formatMoney(money(12_000_000, 'USD'), 'en-US')).toBe('$120,000.00');
    expect(formatMoney(money(8_500_000, 'JPY'), 'en-US')).toBe('¥8,500,000');
  });
});
