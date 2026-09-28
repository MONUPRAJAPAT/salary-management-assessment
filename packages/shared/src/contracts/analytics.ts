import { z } from 'zod';
import { csvOf, isoDateSchema, moneySchema } from './common';
import { analyticsDimensionSchema, departmentSchema, genderSchema, levelSchema } from '../enums';
import { employeeSummarySchema } from './employee';

/**
 * Filters shared by every insights view, so the dashboard can be narrowed once
 * ("Engineering, in Europe") and every tile on it answers the same question.
 */
export const analyticsFilterSchema = z.object({
  country: csvOf(z.string().length(2)),
  department: csvOf(departmentSchema),
  level: csvOf(levelSchema),
  /** Terminated employees are excluded by default; past payroll is a different question. */
  includeInactive: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});
export type AnalyticsFilter = z.infer<typeof analyticsFilterSchema>;

/**
 * Every aggregate carries the FX date it was computed with. An amount converted
 * between currencies is not reproducible without knowing the rates used.
 */
const baseCurrencyContextSchema = z.object({
  baseCurrency: moneySchema.shape.currency,
  fxAsOf: isoDateSchema,
});

export const overviewSchema = baseCurrencyContextSchema.extend({
  headcount: z.number().int(),
  countryCount: z.number().int(),
  departmentCount: z.number().int(),
  annualPayroll: moneySchema,
  medianSalary: moneySchema.nullable(),
  meanSalary: moneySchema.nullable(),
  p25Salary: moneySchema.nullable(),
  p75Salary: moneySchema.nullable(),
  p90Salary: moneySchema.nullable(),
  belowBandCount: z.number().int(),
  aboveBandCount: z.number().int(),
  missingCompensationCount: z.number().int(),
});
export type Overview = z.infer<typeof overviewSchema>;

export const dimensionBreakdownRowSchema = z.object({
  key: z.string(),
  label: z.string(),
  headcount: z.number().int(),
  totalPayroll: moneySchema,
  medianSalary: moneySchema.nullable(),
  meanSalary: moneySchema.nullable(),
  p25Salary: moneySchema.nullable(),
  p75Salary: moneySchema.nullable(),
  minSalary: moneySchema.nullable(),
  maxSalary: moneySchema.nullable(),
  /** Share of total payroll, 0..1. */
  payrollShare: z.number(),
});
export type DimensionBreakdownRow = z.infer<typeof dimensionBreakdownRowSchema>;

export const dimensionBreakdownSchema = baseCurrencyContextSchema.extend({
  dimension: analyticsDimensionSchema,
  rows: z.array(dimensionBreakdownRowSchema),
});
export type DimensionBreakdown = z.infer<typeof dimensionBreakdownSchema>;

export const payGapGroupSchema = z.object({
  gender: genderSchema,
  headcount: z.number().int(),
  medianSalary: moneySchema.nullable(),
  /** True when the group is too small to disclose without exposing an individual. */
  suppressed: z.boolean(),
});

export const payGapRowSchema = z.object({
  key: z.string(),
  label: z.string(),
  headcount: z.number().int(),
  groups: z.array(payGapGroupSchema),
  /** Median gap of women against men, in percent. Null when either side is suppressed. */
  gapPercent: z.number().nullable(),
});
export type PayGapRow = z.infer<typeof payGapRowSchema>;

export const payGapReportSchema = baseCurrencyContextSchema.extend({
  groupBy: z.enum(['department', 'level', 'country']),
  minimumGroupSize: z.number().int(),
  overall: payGapRowSchema,
  rows: z.array(payGapRowSchema),
});
export type PayGapReport = z.infer<typeof payGapReportSchema>;

export const bandHealthRowSchema = z.object({
  level: levelSchema,
  countryCode: z.string().length(2),
  countryName: z.string(),
  headcount: z.number().int(),
  below: z.number().int(),
  within: z.number().int(),
  above: z.number().int(),
  medianCompaRatio: z.number().nullable(),
});
export type BandHealthRow = z.infer<typeof bandHealthRowSchema>;

export const bandHealthReportSchema = z.object({
  rows: z.array(bandHealthRowSchema),
  totals: z.object({
    below: z.number().int(),
    within: z.number().int(),
    above: z.number().int(),
    unbanded: z.number().int(),
  }),
  /** The furthest-below-band employees — the actionable list, not just the count. */
  mostUnderpaid: z.array(employeeSummarySchema),
});
export type BandHealthReport = z.infer<typeof bandHealthReportSchema>;

export const distributionBucketSchema = z.object({
  lowerMinor: z.number().int(),
  upperMinor: z.number().int(),
  count: z.number().int(),
});

export const distributionSchema = baseCurrencyContextSchema.extend({
  bucketCount: z.number().int(),
  buckets: z.array(distributionBucketSchema),
});
export type Distribution = z.infer<typeof distributionSchema>;

export const payrollTrendPointSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  payroll: moneySchema,
  headcount: z.number().int(),
});

export const payrollTrendSchema = baseCurrencyContextSchema.extend({
  points: z.array(payrollTrendPointSchema),
});
export type PayrollTrend = z.infer<typeof payrollTrendSchema>;

export const dimensionQuerySchema = analyticsFilterSchema.extend({
  dimension: analyticsDimensionSchema,
});

export const payGapQuerySchema = analyticsFilterSchema.extend({
  groupBy: z.enum(['department', 'level', 'country']).default('department'),
});

export const distributionQuerySchema = analyticsFilterSchema.extend({
  bucketCount: z.coerce.number().int().min(4).max(40).default(12),
});

export const payrollTrendQuerySchema = analyticsFilterSchema.extend({
  months: z.coerce.number().int().min(3).max(60).default(24),
});
