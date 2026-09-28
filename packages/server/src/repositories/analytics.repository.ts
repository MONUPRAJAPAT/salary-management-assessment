import { sql, type Kysely, type RawBuilder } from 'kysely';
import {
  BASE_CURRENCY,
  MIN_GROUP_SIZE_FOR_DISCLOSURE,
  gapPercent,
  money,
  type AnalyticsDimension,
  type AnalyticsFilter,
  type BandHealthRow,
  type DimensionBreakdownRow,
  type Gender,
  type Level,
  type Overview,
  type PayGapRow,
} from '@acme/shared';
import type { Database } from '../db/types';

/**
 * Every aggregate in the product.
 *
 * Three rules hold throughout, and the tests check each of them:
 *
 * 1. SQLite does the aggregating. The Node process receives one row per group, never the
 *    underlying employees — a dashboard tile does not fetch 10,000 rows to count them.
 * 2. Currency is normalised *before* grouping. A median that mixes ₹ and € is not a
 *    number, it is a category error.
 * 3. Percentiles use CUME_DIST() with the nearest-rank definition, matching
 *    `percentile()` in @acme/shared exactly. One test asserts the two agree.
 *
 * See ADR-0006.
 */
export class AnalyticsRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async fxAsOf(): Promise<string> {
    const row = await this.db
      .selectFrom('fx_rates')
      .select('as_of')
      .limit(1)
      .executeTakeFirst();
    return row?.as_of ?? new Date().toISOString().slice(0, 10);
  }

  async overview(filter: AnalyticsFilter): Promise<Omit<Overview, 'baseCurrency' | 'fxAsOf'>> {
    const base = this.baseCte(filter);

    const summary = await sql<{
      headcount: number;
      total_minor: number | null;
      mean_minor: number | null;
      p25_minor: number | null;
      median_minor: number | null;
      p75_minor: number | null;
      p90_minor: number | null;
      country_count: number;
      department_count: number;
      below_band: number;
      above_band: number;
    }>`
      WITH ${base},
      ranked AS (
        SELECT base_minor, CUME_DIST() OVER (ORDER BY base_minor) AS percentile FROM base
      )
      SELECT
        (SELECT COUNT(*) FROM base)                             AS headcount,
        (SELECT SUM(base_minor) FROM base)                      AS total_minor,
        (SELECT CAST(ROUND(AVG(base_minor)) AS INTEGER) FROM base) AS mean_minor,
        (SELECT COUNT(DISTINCT country_code) FROM base)         AS country_count,
        (SELECT COUNT(DISTINCT department) FROM base)           AS department_count,
        (SELECT COUNT(*) FROM base WHERE band_id IS NOT NULL AND local_minor < min_minor) AS below_band,
        (SELECT COUNT(*) FROM base WHERE band_id IS NOT NULL AND local_minor > max_minor) AS above_band,
        MIN(CASE WHEN percentile >= 0.25 THEN base_minor END)   AS p25_minor,
        MIN(CASE WHEN percentile >= 0.50 THEN base_minor END)   AS median_minor,
        MIN(CASE WHEN percentile >= 0.75 THEN base_minor END)   AS p75_minor,
        MIN(CASE WHEN percentile >= 0.90 THEN base_minor END)   AS p90_minor
      FROM ranked
    `.execute(this.db);

    // Employees with no compensation record at all. They are excluded from every salary
    // figure above — which is correct — but the HR Manager needs to know they exist,
    // because a missing salary is a data problem, not a zero.
    const missing = await sql<{ count: number }>`
      SELECT COUNT(*) AS count FROM employees e
      WHERE NOT EXISTS (SELECT 1 FROM current_compensation cc WHERE cc.employee_id = e.id)
        ${filter.includeInactive ? sql`` : sql`AND e.status <> 'terminated'`}
    `.execute(this.db);

    const row = summary.rows[0];
    const asMoney = (amount: number | null | undefined) =>
      amount === null || amount === undefined ? null : money(amount, BASE_CURRENCY);

    return {
      headcount: row?.headcount ?? 0,
      countryCount: row?.country_count ?? 0,
      departmentCount: row?.department_count ?? 0,
      annualPayroll: money(row?.total_minor ?? 0, BASE_CURRENCY),
      medianSalary: asMoney(row?.median_minor),
      meanSalary: asMoney(row?.mean_minor),
      p25Salary: asMoney(row?.p25_minor),
      p75Salary: asMoney(row?.p75_minor),
      p90Salary: asMoney(row?.p90_minor),
      belowBandCount: row?.below_band ?? 0,
      aboveBandCount: row?.above_band ?? 0,
      missingCompensationCount: missing.rows[0]?.count ?? 0,
    };
  }

  async breakdownBy(
    dimension: AnalyticsDimension,
    filter: AnalyticsFilter,
  ): Promise<DimensionBreakdownRow[]> {
    const base = this.baseCte(filter);
    const keyColumn = sql.raw(DIMENSION_KEY_COLUMN[dimension]);
    const labelColumn = sql.raw(DIMENSION_LABEL_COLUMN[dimension]);

    const result = await sql<{
      key: string;
      label: string;
      headcount: number;
      total_minor: number;
      mean_minor: number;
      min_minor: number;
      max_minor: number;
      p25_minor: number;
      median_minor: number;
      p75_minor: number;
    }>`
      WITH ${base},
      ranked AS (
        SELECT ${keyColumn} AS group_key, ${labelColumn} AS group_label, base_minor,
               CUME_DIST() OVER (PARTITION BY ${keyColumn} ORDER BY base_minor) AS percentile
        FROM base
      )
      SELECT
        group_key   AS key,
        group_label AS label,
        COUNT(*)                                   AS headcount,
        SUM(base_minor)                            AS total_minor,
        CAST(ROUND(AVG(base_minor)) AS INTEGER)    AS mean_minor,
        MIN(base_minor)                            AS min_minor,
        MAX(base_minor)                            AS max_minor,
        MIN(CASE WHEN percentile >= 0.25 THEN base_minor END) AS p25_minor,
        MIN(CASE WHEN percentile >= 0.50 THEN base_minor END) AS median_minor,
        MIN(CASE WHEN percentile >= 0.75 THEN base_minor END) AS p75_minor
      FROM ranked
      GROUP BY group_key, group_label
      ORDER BY total_minor DESC
    `.execute(this.db);

    const totalPayroll = result.rows.reduce((sum, row) => sum + row.total_minor, 0);

    return result.rows.map((row) => ({
      key: row.key,
      label: row.label,
      headcount: row.headcount,
      totalPayroll: money(row.total_minor, BASE_CURRENCY),
      medianSalary: money(row.median_minor, BASE_CURRENCY),
      meanSalary: money(row.mean_minor, BASE_CURRENCY),
      p25Salary: money(row.p25_minor, BASE_CURRENCY),
      p75Salary: money(row.p75_minor, BASE_CURRENCY),
      minSalary: money(row.min_minor, BASE_CURRENCY),
      maxSalary: money(row.max_minor, BASE_CURRENCY),
      payrollShare: totalPayroll > 0 ? row.total_minor / totalPayroll : 0,
    }));
  }

  /**
   * Median pay by gender, grouped by department, level or country.
   *
   * The small-group suppression required by ADR-0005 is applied *in the query*: for a
   * group below the disclosure threshold the median is never computed, so it never
   * leaves the database. Filtering it out in JavaScript afterwards would mean the figure
   * had already been read, and one forgotten `.map()` away from being served.
   */
  async payGap(
    groupBy: 'department' | 'level' | 'country',
    filter: AnalyticsFilter,
  ): Promise<{ overall: PayGapRow; rows: PayGapRow[] }> {
    const base = this.baseCte(filter);
    const keyColumn = sql.raw(DIMENSION_KEY_COLUMN[groupBy]);
    const labelColumn = sql.raw(DIMENSION_LABEL_COLUMN[groupBy]);

    const grouped = await sql<{
      key: string;
      label: string;
      gender: Gender;
      headcount: number;
      median_minor: number | null;
    }>`
      WITH ${base},
      ranked AS (
        SELECT ${keyColumn} AS group_key, ${labelColumn} AS group_label, gender, base_minor,
               CUME_DIST() OVER (PARTITION BY ${keyColumn}, gender ORDER BY base_minor) AS percentile
        FROM base
      )
      SELECT group_key AS key, group_label AS label, gender, COUNT(*) AS headcount,
             CASE WHEN COUNT(*) >= ${MIN_GROUP_SIZE_FOR_DISCLOSURE}
                  THEN MIN(CASE WHEN percentile >= 0.50 THEN base_minor END)
                  END AS median_minor
      FROM ranked
      GROUP BY group_key, group_label, gender
    `.execute(this.db);

    const overallByGender = await sql<{
      gender: Gender;
      headcount: number;
      median_minor: number | null;
    }>`
      WITH ${base},
      ranked AS (
        SELECT gender, base_minor,
               CUME_DIST() OVER (PARTITION BY gender ORDER BY base_minor) AS percentile
        FROM base
      )
      SELECT gender, COUNT(*) AS headcount,
             CASE WHEN COUNT(*) >= ${MIN_GROUP_SIZE_FOR_DISCLOSURE}
                  THEN MIN(CASE WHEN percentile >= 0.50 THEN base_minor END)
                  END AS median_minor
      FROM ranked GROUP BY gender
    `.execute(this.db);

    const byKey = new Map<string, { label: string; rows: typeof grouped.rows }>();
    for (const row of grouped.rows) {
      const entry = byKey.get(row.key) ?? { label: row.label, rows: [] };
      entry.rows.push(row);
      byKey.set(row.key, entry);
    }

    const rows = [...byKey.entries()]
      .map(([key, entry]) => toPayGapRow(key, entry.label, entry.rows))
      .sort((a, b) => b.headcount - a.headcount);

    return { overall: toPayGapRow('overall', 'Whole organisation', overallByGender.rows), rows };
  }

  async bandHealth(filter: AnalyticsFilter): Promise<{
    rows: BandHealthRow[];
    totals: { below: number; within: number; above: number; unbanded: number };
  }> {
    const base = this.baseCte(filter);

    const result = await sql<{
      level: Level;
      country_code: string;
      country_name: string;
      headcount: number;
      below: number;
      within: number;
      above: number;
      median_compa: number | null;
    }>`
      WITH ${base},
      ranked AS (
        SELECT level, country_code, country_name, local_minor, min_minor, max_minor,
               CASE WHEN mid_minor > 0 THEN CAST(local_minor AS REAL) / mid_minor END AS compa,
               CUME_DIST() OVER (
                 PARTITION BY country_code, level
                 ORDER BY CASE WHEN mid_minor > 0 THEN CAST(local_minor AS REAL) / mid_minor END
               ) AS percentile
        FROM base WHERE band_id IS NOT NULL
      )
      SELECT level, country_code, country_name,
             COUNT(*) AS headcount,
             SUM(CASE WHEN local_minor < min_minor THEN 1 ELSE 0 END) AS below,
             SUM(CASE WHEN local_minor > max_minor THEN 1 ELSE 0 END) AS above,
             SUM(CASE WHEN local_minor BETWEEN min_minor AND max_minor THEN 1 ELSE 0 END) AS within,
             MIN(CASE WHEN percentile >= 0.50 THEN compa END) AS median_compa
      FROM ranked
      GROUP BY country_code, country_name, level
      HAVING below > 0 OR above > 0 OR headcount > 0
      ORDER BY below DESC, above DESC, headcount DESC
    `.execute(this.db);

    const unbanded = await sql<{ count: number }>`
      WITH ${base} SELECT COUNT(*) AS count FROM base WHERE band_id IS NULL
    `.execute(this.db);

    const totals = result.rows.reduce(
      (running, row) => ({
        below: running.below + row.below,
        within: running.within + row.within,
        above: running.above + row.above,
        unbanded: running.unbanded,
      }),
      { below: 0, within: 0, above: 0, unbanded: unbanded.rows[0]?.count ?? 0 },
    );

    return {
      rows: result.rows.map((row) => ({
        level: row.level,
        countryCode: row.country_code,
        countryName: row.country_name,
        headcount: row.headcount,
        below: row.below,
        within: row.within,
        above: row.above,
        medianCompaRatio: row.median_compa,
      })),
      totals,
    };
  }

  /**
   * Salary distribution as equal-width buckets between the lowest and highest paid.
   * Bucket boundaries are computed in SQL from the data rather than hardcoded, so the
   * histogram stays meaningful when the view is filtered down to one country.
   */
  async distribution(
    filter: AnalyticsFilter,
    bucketCount: number,
  ): Promise<Array<{ lowerMinor: number; upperMinor: number; count: number }>> {
    const base = this.baseCte(filter);

    const bounds = await sql<{ low: number | null; high: number | null }>`
      WITH ${base} SELECT MIN(base_minor) AS low, MAX(base_minor) AS high FROM base
    `.execute(this.db);

    const low = bounds.rows[0]?.low ?? null;
    const high = bounds.rows[0]?.high ?? null;
    if (low === null || high === null) return [];

    const width = Math.max(1, Math.ceil((high - low + 1) / bucketCount));

    // The CASTs are load-bearing. A bound numeric parameter reaches SQLite as REAL, so
    // `(base_minor - ?) / ?` is floating-point division and yields fractional bucket
    // keys — the same expression written with literals does integer division. Casting
    // states the intent instead of depending on how a value happened to be bound.
    const counted = await sql<{ bucket: number; count: number }>`
      WITH ${base}
      SELECT MIN(
               (base_minor - CAST(${low} AS INTEGER)) / CAST(${width} AS INTEGER),
               CAST(${bucketCount - 1} AS INTEGER)
             ) AS bucket,
             COUNT(*) AS count
      FROM base GROUP BY bucket ORDER BY bucket
    `.execute(this.db);

    const countByBucket = new Map(counted.rows.map((row) => [row.bucket, row.count]));

    // Empty buckets are filled in here rather than in SQL: a histogram with a gap in the
    // middle would render as a misleadingly narrow chart.
    return Array.from({ length: bucketCount }, (_, index) => ({
      lowerMinor: low + index * width,
      upperMinor: low + (index + 1) * width - 1,
      count: countByBucket.get(index) ?? 0,
    }));
  }

  /**
   * Monthly payroll cost of the current roster, back-projected through salary history.
   *
   * LEAD() turns each compensation record into the interval it was in force for, so one
   * pass over the history answers every month at once instead of re-resolving "current
   * salary" twenty-four times.
   *
   * Known limitation: without a termination date in the model, this shows what today's
   * people cost over time rather than what payroll actually cost in a past month. That
   * is a genuinely useful question — and it is the one the UI labels it as.
   */
  async payrollTrend(
    filter: AnalyticsFilter,
    months: number,
  ): Promise<Array<{ month: string; payrollMinor: number; headcount: number }>> {
    const base = this.baseCte(filter, { requireCurrentCompensation: false });

    const result = await sql<{ month: string; payroll_minor: number; headcount: number }>`
      WITH RECURSIVE ${base},
      month_series(month_start) AS (
        SELECT DATE('now', 'start of month', ${sql.lit(`-${months - 1} months`)})
        UNION ALL
        SELECT DATE(month_start, '+1 month') FROM month_series
        WHERE month_start < DATE('now', 'start of month')
      ),
      intervals AS (
        SELECT cr.employee_id, cr.effective_from,
               LEAD(cr.effective_from) OVER (
                 PARTITION BY cr.employee_id ORDER BY cr.effective_from, cr.id
               ) AS effective_until,
               ((cr.base_salary_minor * fx.rate_to_base_micros * cur.base_scale) + 500000) / 1000000
                 AS base_minor
        FROM compensation_records cr
        JOIN currencies cur ON cur.code = cr.currency_code
        JOIN fx_rates  fx  ON fx.currency_code = cr.currency_code
        WHERE cr.employee_id IN (SELECT id FROM base)
      )
      SELECT STRFTIME('%Y-%m', m.month_start) AS month,
             SUM(i.base_minor)                AS payroll_minor,
             COUNT(*)                         AS headcount
      FROM month_series m
      JOIN intervals i
        ON i.effective_from <= DATE(m.month_start, '+1 month', '-1 day')
       AND (i.effective_until IS NULL OR i.effective_until > DATE(m.month_start, '+1 month', '-1 day'))
      GROUP BY month
      ORDER BY month
    `.execute(this.db);

    return result.rows.map((row) => ({
      month: row.month,
      payrollMinor: row.payroll_minor,
      headcount: row.headcount,
    }));
  }

  /**
   * The CTE every analytic starts from: one row per employee, their salary already
   * normalised to the base currency, and their band alongside it.
   *
   * Filter values are always bound parameters. The only interpolated SQL anywhere in this
   * class is a column name chosen by a lookup from a validated enum.
   */
  private baseCte(
    filter: AnalyticsFilter,
    options: { requireCurrentCompensation?: boolean } = {},
  ): RawBuilder<unknown> {
    const { requireCurrentCompensation = true } = options;
    const conditions: RawBuilder<unknown>[] = [];

    if (!filter.includeInactive) conditions.push(sql`e.status <> 'terminated'`);
    if (filter.country?.length) {
      conditions.push(sql`e.country_code IN (${sql.join(filter.country.map((v) => sql`${v}`))})`);
    }
    if (filter.department?.length) {
      conditions.push(sql`e.department IN (${sql.join(filter.department.map((v) => sql`${v}`))})`);
    }
    if (filter.level?.length) {
      conditions.push(sql`e.level IN (${sql.join(filter.level.map((v) => sql`${v}`))})`);
    }

    const where = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;
    const compensationJoin = requireCurrentCompensation
      ? sql`JOIN current_compensation cc ON cc.employee_id = e.id
            JOIN currencies cur ON cur.code = cc.currency_code
            JOIN fx_rates  fx  ON fx.currency_code = cc.currency_code`
      : sql`LEFT JOIN current_compensation cc ON cc.employee_id = e.id
            LEFT JOIN currencies cur ON cur.code = cc.currency_code
            LEFT JOIN fx_rates  fx  ON fx.currency_code = cc.currency_code`;

    return sql`
      base AS (
        SELECT e.id, e.country_code, co.name AS country_name, e.department, e.level, e.gender,
               cc.base_salary_minor AS local_minor,
               ((cc.base_salary_minor * fx.rate_to_base_micros * cur.base_scale) + 500000) / 1000000
                 AS base_minor,
               b.id AS band_id, b.min_minor, b.mid_minor, b.max_minor
        FROM employees e
        JOIN countries co ON co.code = e.country_code
        ${compensationJoin}
        LEFT JOIN salary_bands b ON b.country_code = e.country_code AND b.level = e.level
        ${where}
      )`;
  }
}

/** Safe to interpolate: the keys come from a Zod enum, never from request data. */
const DIMENSION_KEY_COLUMN: Record<AnalyticsDimension, string> = {
  country: 'country_code',
  department: 'department',
  level: 'level',
  gender: 'gender',
};

const DIMENSION_LABEL_COLUMN: Record<AnalyticsDimension, string> = {
  country: 'country_name',
  department: 'department',
  level: 'level',
  gender: 'gender',
};

function toPayGapRow(
  key: string,
  label: string,
  rows: Array<{ gender: Gender; headcount: number; median_minor: number | null }>,
): PayGapRow {
  const groups = rows.map((row) => ({
    gender: row.gender,
    headcount: row.headcount,
    medianSalary: row.median_minor === null ? null : money(row.median_minor, BASE_CURRENCY),
    suppressed: row.headcount < MIN_GROUP_SIZE_FOR_DISCLOSURE,
  }));

  const male = rows.find((row) => row.gender === 'male')?.median_minor ?? null;
  const female = rows.find((row) => row.gender === 'female')?.median_minor ?? null;

  return {
    key,
    label,
    headcount: rows.reduce((sum, row) => sum + row.headcount, 0),
    groups,
    gapPercent: gapPercent(male, female),
  };
}
