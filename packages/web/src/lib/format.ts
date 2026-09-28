import { formatMoney, formatMoneyCompact, humanise, type Money } from '@acme/shared';

/**
 * Presentation-only helpers. Nothing here does arithmetic on money — amounts arrive as
 * integer minor units and are formatted at the last possible moment. See ADR-0003.
 */

export const money = (amount: Money | null | undefined, fallback = '—'): string =>
  amount ? formatMoney(amount) : fallback;

export const moneyCompact = (amount: Money | null | undefined, fallback = '—'): string =>
  amount ? formatMoneyCompact(amount) : fallback;

export const percent = (value: number | null | undefined, digits = 1, fallback = '—'): string =>
  value === null || value === undefined ? fallback : `${value.toFixed(digits)}%`;

/** Signed, for a change: "+7.0%" reads as a raise, "7.0%" does not. */
export const signedPercent = (value: number | null | undefined, fallback = '—'): string =>
  value === null || value === undefined ? fallback : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;

export const ratio = (value: number | null | undefined, fallback = '—'): string =>
  value === null || value === undefined ? fallback : value.toFixed(2);

export const count = (value: number): string => value.toLocaleString();

export const date = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

export const monthLabel = (month: string): string =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined, {
    year: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  });

export const label = humanise;

/** Years of service, for a profile header. */
export function tenure(hireDate: string): string {
  const years = (Date.now() - Date.parse(`${hireDate}T00:00:00Z`)) / (365.25 * 24 * 3600 * 1000);
  if (years < 1) return `${Math.max(1, Math.round(years * 12))} months`;
  return `${years.toFixed(1)} years`;
}
