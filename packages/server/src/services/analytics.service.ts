import type { Kysely } from 'kysely';
import {
  BASE_CURRENCY,
  MIN_GROUP_SIZE_FOR_DISCLOSURE,
  employeeListQuerySchema,
  money,
  type AnalyticsDimension,
  type AnalyticsFilter,
  type BandHealthReport,
  type DimensionBreakdown,
  type Distribution,
  type Overview,
  type PayGapReport,
  type PayrollTrend,
} from '@acme/shared';
import type { Database } from '../db/types';
import { AnalyticsRepository } from '../repositories/analytics.repository';
import { EmployeeRepository } from '../repositories/employee.repository';

/**
 * Wraps each aggregate with the context needed to interpret it: the base currency, and
 * the date of the exchange rates used. A converted figure without its conversion date is
 * not reproducible, so the two always travel together.
 */
export class AnalyticsService {
  constructor(
    db: Kysely<Database>,
    private readonly analytics = new AnalyticsRepository(db),
    private readonly employees = new EmployeeRepository(db),
  ) {}

  async overview(filter: AnalyticsFilter): Promise<Overview> {
    const [summary, fxAsOf] = await Promise.all([
      this.analytics.overview(filter),
      this.analytics.fxAsOf(),
    ]);
    return { ...summary, baseCurrency: BASE_CURRENCY, fxAsOf };
  }

  async breakdown(
    dimension: AnalyticsDimension,
    filter: AnalyticsFilter,
  ): Promise<DimensionBreakdown> {
    const [rows, fxAsOf] = await Promise.all([
      this.analytics.breakdownBy(dimension, filter),
      this.analytics.fxAsOf(),
    ]);
    return { dimension, rows, baseCurrency: BASE_CURRENCY, fxAsOf };
  }

  async payGap(
    groupBy: 'department' | 'level' | 'country',
    filter: AnalyticsFilter,
  ): Promise<PayGapReport> {
    const [report, fxAsOf] = await Promise.all([
      this.analytics.payGap(groupBy, filter),
      this.analytics.fxAsOf(),
    ]);
    return {
      groupBy,
      minimumGroupSize: MIN_GROUP_SIZE_FOR_DISCLOSURE,
      overall: report.overall,
      rows: report.rows,
      baseCurrency: BASE_CURRENCY,
      fxAsOf,
    };
  }

  /**
   * Band health, plus the ten people furthest below their band.
   *
   * The count alone is a statistic; the list is something the HR Manager can act on this
   * afternoon. It reuses the employee repository rather than duplicating the directory's
   * query, so the rows carry exactly the same shape the directory shows.
   */
  async bandHealth(filter: AnalyticsFilter): Promise<BandHealthReport> {
    const [health, underpaid] = await Promise.all([
      this.analytics.bandHealth(filter),
      this.employees.list(
        employeeListQuerySchema.parse({
          bandPosition: 'below',
          sort: 'compaRatio',
          direction: 'asc',
          pageSize: 10,
          status: filter.includeInactive ? undefined : 'active,on_leave',
          ...(filter.country?.length ? { country: filter.country.join(',') } : {}),
          ...(filter.department?.length ? { department: filter.department.join(',') } : {}),
          ...(filter.level?.length ? { level: filter.level.join(',') } : {}),
        }),
      ),
    ]);

    return { rows: health.rows, totals: health.totals, mostUnderpaid: underpaid.items };
  }

  async distribution(filter: AnalyticsFilter, bucketCount: number): Promise<Distribution> {
    const [buckets, fxAsOf] = await Promise.all([
      this.analytics.distribution(filter, bucketCount),
      this.analytics.fxAsOf(),
    ]);
    return { bucketCount, buckets, baseCurrency: BASE_CURRENCY, fxAsOf };
  }

  async payrollTrend(filter: AnalyticsFilter, months: number): Promise<PayrollTrend> {
    const [points, fxAsOf] = await Promise.all([
      this.analytics.payrollTrend(filter, months),
      this.analytics.fxAsOf(),
    ]);
    return {
      points: points.map((point) => ({
        month: point.month,
        payroll: money(point.payrollMinor, BASE_CURRENCY),
        headcount: point.headcount,
      })),
      baseCurrency: BASE_CURRENCY,
      fxAsOf,
    };
  }
}
