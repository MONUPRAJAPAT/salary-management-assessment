import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { analyticsFilterSchema, percentile, type AnalyticsFilter } from '@acme/shared';
import { createFixture, EXPECTED } from '../testing/fixture';
import type { DatabaseHandle } from '../db/connection';
import { AnalyticsRepository } from './analytics.repository';

let handle: DatabaseHandle;
let analytics: AnalyticsRepository;

beforeEach(() => {
  handle = createFixture();
  analytics = new AnalyticsRepository(handle.db);
});

afterEach(async () => {
  await handle.close();
});

const filter = (overrides: Record<string, unknown> = {}): AnalyticsFilter =>
  analyticsFilterSchema.parse(overrides);

describe('overview', () => {
  it('reports the payroll and the spread of the active organisation', async () => {
    const result = await analytics.overview(filter());

    expect(result.headcount).toBe(EXPECTED.activeHeadcount);
    expect(result.annualPayroll.amountMinor).toBe(EXPECTED.organisation.totalPayrollUsdMinor);
    expect(result.medianSalary?.amountMinor).toBe(EXPECTED.organisation.medianUsdMinor);
    expect(result.p25Salary?.amountMinor).toBe(EXPECTED.organisation.p25UsdMinor);
    expect(result.p75Salary?.amountMinor).toBe(EXPECTED.organisation.p75UsdMinor);
    expect(result.p90Salary?.amountMinor).toBe(EXPECTED.organisation.p90UsdMinor);
    expect(result.countryCount).toBe(3);
  });

  it('reports every figure in the base currency', async () => {
    const result = await analytics.overview(filter());
    expect(result.annualPayroll.currency).toBe('USD');
    expect(result.medianSalary?.currency).toBe('USD');
  });

  it('excludes terminated employees unless asked for them', async () => {
    expect((await analytics.overview(filter())).headcount).toBe(11);
    expect((await analytics.overview(filter({ includeInactive: 'true' }))).headcount).toBe(12);
  });

  it('counts who is outside their band', async () => {
    const result = await analytics.overview(filter());
    expect(result.belowBandCount).toBe(EXPECTED.bandPositions.below);
    expect(result.aboveBandCount).toBe(EXPECTED.bandPositions.above);
  });

  it('surfaces employees with no salary on record instead of treating them as free', async () => {
    handle.sqlite.exec(`
      INSERT INTO employees (id, employee_number, first_name, last_name, email, job_title,
                             department, level, country_code, employment_type, status, gender, hire_date)
      VALUES (99, 'ACME-00099', 'Noor', 'Nasser', 'noor@acme.example', 'IC1 Design',
              'Design', 'IC1', 'US', 'full_time', 'active', 'female', '2026-09-01')`);

    const result = await analytics.overview(filter());
    expect(result.missingCompensationCount).toBe(1);
    // Their absence must not move the payroll or the median.
    expect(result.headcount).toBe(EXPECTED.activeHeadcount);
    expect(result.annualPayroll.amountMinor).toBe(EXPECTED.organisation.totalPayrollUsdMinor);
  });

  it('narrows to a filtered slice of the organisation', async () => {
    const result = await analytics.overview(filter({ country: 'US' }));
    expect(result.headcount).toBe(EXPECTED.byCountry.US.headcount);
    expect(result.annualPayroll.amountMinor).toBe(EXPECTED.byCountry.US.totalUsdMinor);
    expect(result.medianSalary?.amountMinor).toBe(EXPECTED.byCountry.US.medianUsdMinor);
  });
});

describe('breakdown by dimension', () => {
  it('compares countries in one currency', async () => {
    const rows = await analytics.breakdownBy('country', filter());
    const byKey = new Map(rows.map((row) => [row.key, row]));

    for (const [code, expected] of Object.entries(EXPECTED.byCountry)) {
      const row = byKey.get(code);
      expect(row?.headcount, code).toBe(expected.headcount);
      expect(row?.medianSalary?.amountMinor, code).toBe(expected.medianUsdMinor);
      expect(row?.totalPayroll.amountMinor, code).toBe(expected.totalUsdMinor);
    }
  });

  it('labels countries by name rather than by code', async () => {
    const rows = await analytics.breakdownBy('country', filter());
    expect(rows.find((row) => row.key === 'JP')?.label).toBe('Japan');
  });

  it('splits by department', async () => {
    const rows = await analytics.breakdownBy('department', filter());
    const byKey = new Map(rows.map((row) => [row.key, row]));

    expect(byKey.get('Engineering')?.headcount).toBe(EXPECTED.byDepartment.Engineering.headcount);
    expect(byKey.get('Engineering')?.medianSalary?.amountMinor).toBe(
      EXPECTED.byDepartment.Engineering.medianUsdMinor,
    );
    expect(byKey.get('Sales')?.totalPayroll.amountMinor).toBe(
      EXPECTED.byDepartment.Sales.totalUsdMinor,
    );
  });

  it('gives each group its share of total payroll, summing to one', async () => {
    const rows = await analytics.breakdownBy('department', filter());
    const total = rows.reduce((sum, row) => sum + row.payrollShare, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('orders groups by payroll cost, largest first', async () => {
    const rows = await analytics.breakdownBy('department', filter());
    expect(rows.map((row) => row.key)).toEqual(['Engineering', 'Sales']);
  });

  it('reports headcounts that add up to the organisation', async () => {
    const rows = await analytics.breakdownBy('level', filter());
    expect(rows.reduce((sum, row) => sum + row.headcount, 0)).toBe(EXPECTED.activeHeadcount);
  });
});

/**
 * The definition of a percentile is the one thing that must not differ between the SQL
 * that computes it and the TypeScript that documents it. These tests hold them together.
 */
describe('percentile definition', () => {
  it('agrees with the shared statistics implementation on the same data', async () => {
    const rows = handle.sqlite
      .prepare(
        `SELECT ((cc.base_salary_minor * fx.rate_to_base_micros * cur.base_scale) + 500000) / 1000000 AS usd
         FROM employees e
         JOIN current_compensation cc ON cc.employee_id = e.id
         JOIN currencies cur ON cur.code = cc.currency_code
         JOIN fx_rates  fx  ON fx.currency_code = cc.currency_code
         WHERE e.status <> 'terminated'`,
      )
      .all() as Array<{ usd: number }>;
    const salaries = rows.map((row) => row.usd);

    const result = await analytics.overview(filter());

    expect(result.medianSalary?.amountMinor).toBe(percentile(salaries, 0.5));
    expect(result.p25Salary?.amountMinor).toBe(percentile(salaries, 0.25));
    expect(result.p75Salary?.amountMinor).toBe(percentile(salaries, 0.75));
    expect(result.p90Salary?.amountMinor).toBe(percentile(salaries, 0.9));
  });

  it('returns a real salary, not an interpolated one', async () => {
    // With an even-sized group the median is the lower of the two middle salaries —
    // someone is actually paid it.
    const rows = await analytics.breakdownBy('country', filter({ country: 'IN' }));
    // India's four salaries are $40k, $50k, $60k, $80k.
    expect(rows[0]?.medianSalary?.amountMinor).toBe(5_000_000);
  });
});

describe('pay gap', () => {
  it('compares median pay by gender across the organisation', async () => {
    const { overall } = await analytics.payGap('department', filter());
    const byGender = new Map(overall.groups.map((group) => [group.gender, group]));

    expect(byGender.get('female')?.headcount).toBe(EXPECTED.gender.femaleHeadcount);
    expect(byGender.get('female')?.medianSalary?.amountMinor).toBe(
      EXPECTED.gender.femaleMedianUsdMinor,
    );
    expect(byGender.get('male')?.headcount).toBe(EXPECTED.gender.maleHeadcount);
    expect(byGender.get('male')?.medianSalary?.amountMinor).toBe(
      EXPECTED.gender.maleMedianUsdMinor,
    );
  });

  it('expresses the gap as women’s median against men’s', async () => {
    const { overall } = await analytics.payGap('department', filter());
    // Men's median $80,000, women's $90,000 -> women are paid 12.5% more, so a -12.5% gap.
    expect(overall.gapPercent).toBeCloseTo(-12.5, 10);
  });

  it('suppresses any group too small to disclose', async () => {
    // Every department/gender group in the fixture has fewer than five people.
    const { rows } = await analytics.payGap('department', filter());
    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      for (const group of row.groups) {
        expect(group.headcount).toBeLessThan(5);
        expect(group.suppressed).toBe(true);
        // The figure is never computed, so it cannot leak by accident downstream.
        expect(group.medianSalary).toBeNull();
      }
      expect(row.gapPercent).toBeNull();
    }
  });

  it('still reports the headcount of a suppressed group', async () => {
    const { rows } = await analytics.payGap('department', filter());
    const engineering = rows.find((row) => row.key === 'Engineering');
    expect(engineering?.headcount).toBe(EXPECTED.byDepartment.Engineering.headcount);
  });
});

describe('band health', () => {
  it('counts who sits below, within and above band', async () => {
    const { totals } = await analytics.bandHealth(filter());
    expect(totals.below).toBe(EXPECTED.bandPositions.below);
    expect(totals.within).toBe(EXPECTED.bandPositions.within);
    expect(totals.above).toBe(EXPECTED.bandPositions.above);
  });

  it('compares salary against the band in the same currency', async () => {
    // Esha earns ₹4,000,000 against an Indian IC3 band of ₹5,120,000–₹8,000,000.
    // Comparing her converted $50,000 against a rupee band would call her wildly underpaid.
    const { rows } = await analytics.bandHealth(filter());
    const indianIc3 = rows.find((row) => row.countryCode === 'IN' && row.level === 'IC3');
    expect(indianIc3?.below).toBe(1);
    expect(indianIc3?.headcount).toBe(2);
  });

  it('reports the median compa-ratio per level and country', async () => {
    const { rows } = await analytics.bandHealth(filter());
    const americanIc3 = rows.find((row) => row.countryCode === 'US' && row.level === 'IC3');
    // Compa-ratios 0.833, 1.0, 1.167, 1.333 -> nearest-rank median is 1.0.
    expect(americanIc3?.medianCompaRatio).toBeCloseTo(1, 10);
  });
});

describe('distribution', () => {
  it('buckets every employee exactly once', async () => {
    const buckets = await analytics.distribution(filter(), 6);
    expect(buckets).toHaveLength(6);
    expect(buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(EXPECTED.activeHeadcount);
  });

  it('spans from the lowest to the highest paid', async () => {
    const buckets = await analytics.distribution(filter(), 6);
    expect(buckets[0]?.lowerMinor).toBe(EXPECTED.organisation.minUsdMinor);
    expect(buckets.at(-1)?.upperMinor).toBeGreaterThanOrEqual(EXPECTED.organisation.maxUsdMinor);
  });

  it('returns contiguous buckets, including empty ones', async () => {
    const buckets = await analytics.distribution(filter(), 8);
    for (let index = 1; index < buckets.length; index += 1) {
      expect(buckets[index]?.lowerMinor).toBe((buckets[index - 1]?.upperMinor ?? 0) + 1);
    }
  });

  it('returns nothing when the filter matches nobody', async () => {
    expect(await analytics.distribution(filter({ country: 'ZZ' }), 6)).toEqual([]);
  });
});

describe('payroll trend', () => {
  it('returns one point per month, oldest first', async () => {
    const points = await analytics.payrollTrend(filter(), 12);
    expect(points.length).toBeGreaterThan(0);
    expect(points.length).toBeLessThanOrEqual(12);
    expect([...points].sort((a, b) => a.month.localeCompare(b.month))).toEqual(points);
  });

  it('ends at the current payroll, because the last month is today', async () => {
    const points = await analytics.payrollTrend(filter(), 12);
    const overview = await analytics.overview(filter());
    expect(points.at(-1)?.payrollMinor).toBe(overview.annualPayroll.amountMinor);
    expect(points.at(-1)?.headcount).toBe(overview.headcount);
  });

  it('shows payroll growing as salaries rise over time', async () => {
    const points = await analytics.payrollTrend(filter(), 60);
    const first = points[0]?.payrollMinor ?? 0;
    const last = points.at(-1)?.payrollMinor ?? 0;
    expect(last).toBeGreaterThan(first);
  });
});
