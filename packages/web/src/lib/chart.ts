import { BASE_CURRENCY, toMajorUnits, type Money } from '@acme/shared';

/**
 * Charts plot plain numbers, so money has to leave its Money wrapper at the boundary.
 * These two helpers are that boundary, and they are the only place it happens.
 */
export const toChartValue = (amount: Money | null | undefined): number =>
  amount ? toMajorUnits(amount) : 0;

const compact = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: BASE_CURRENCY,
  notation: 'compact',
  maximumFractionDigits: 1,
});

const exact = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: BASE_CURRENCY,
  maximumFractionDigits: 0,
});

/** Axis ticks: short enough not to collide. */
export const axisMoney = (value: number): string => compact.format(value);

/** Tooltips and value labels: the real figure, because that is what was asked for. */
export const exactMoney = (value: number): string => exact.format(value);

export const SERIES_1 = 'var(--viz-series-1)';
export const SERIES_2 = 'var(--viz-series-2)';
