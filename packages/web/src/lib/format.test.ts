import { describe, expect, it } from 'vitest';
import { money as makeMoney } from '@acme/shared';
import { money, percent, ratio, signedPercent } from './format';

describe('formatting for display', () => {
  it('formats money with its own currency', () => {
    expect(money(makeMoney(12_000_000, 'USD'))).toBe('$120,000.00');
    expect(money(makeMoney(8_500_000, 'JPY'))).toBe('¥8,500,000');
  });

  it('shows a dash rather than a zero when there is no amount', () => {
    // A salary that is missing is not a salary of nothing, and the UI must not say it is.
    expect(money(null)).toBe('—');
    expect(ratio(null)).toBe('—');
    expect(percent(null)).toBe('—');
  });

  it('signs a change so a raise reads as one', () => {
    expect(signedPercent(7)).toBe('+7.0%');
    expect(signedPercent(-3.25)).toBe('-3.3%');
    expect(signedPercent(0)).toBe('0.0%');
  });

  it('renders a compa-ratio to two places', () => {
    expect(ratio(1)).toBe('1.00');
    expect(ratio(0.8333333)).toBe('0.83');
  });
});
