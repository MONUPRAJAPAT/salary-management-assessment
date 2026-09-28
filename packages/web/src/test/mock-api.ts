import { vi } from 'vitest';
import type {
  BandHealthReport,
  DimensionBreakdown,
  Distribution,
  Overview,
  PayGapReport,
  PayrollTrend,
  ReferenceData,
} from '@acme/shared';
import { employeeDetail, employeeSummary } from './fixtures';

const usd = (amountMinor: number) => ({ amountMinor, currency: 'USD' as const });

export const referenceData: ReferenceData = {
  countries: [
    { code: 'IN', name: 'India', region: 'APAC', currency: 'INR' },
    { code: 'US', name: 'United States', region: 'Americas', currency: 'USD' },
  ],
  departments: ['Engineering', 'Sales'],
  levels: ['IC1', 'IC2', 'IC3', 'IC4', 'IC5', 'IC6', 'M1', 'M2', 'M3', 'M4'],
  fx: { asOf: '2026-01-01', baseCurrency: 'USD', rates: { USD: 1_000_000, INR: 12_500 } },
};

export const overview: Overview = {
  baseCurrency: 'USD',
  fxAsOf: '2026-01-01',
  headcount: 9812,
  countryCount: 10,
  departmentCount: 11,
  annualPayroll: usd(88_519_911_354),
  medianSalary: usd(7_701_882),
  meanSalary: usd(9_022_617),
  p25Salary: usd(4_612_000),
  p75Salary: usd(12_090_000),
  p90Salary: usd(16_400_000),
  belowBandCount: 211,
  aboveBandCount: 158,
  missingCompensationCount: 0,
};

const breakdown: DimensionBreakdown = {
  baseCurrency: 'USD',
  fxAsOf: '2026-01-01',
  dimension: 'country',
  rows: [
    {
      key: 'US',
      label: 'United States',
      headcount: 2352,
      totalPayroll: usd(36_000_000_000),
      medianSalary: usd(14_094_000),
      meanSalary: usd(15_000_000),
      p25Salary: usd(11_000_000),
      p75Salary: usd(18_000_000),
      minSalary: usd(6_000_000),
      maxSalary: usd(40_000_000),
      payrollShare: 0.62,
    },
    {
      key: 'IN',
      label: 'India',
      headcount: 2550,
      totalPayroll: usd(11_000_000_000),
      medianSalary: usd(4_180_700),
      meanSalary: usd(4_500_000),
      p25Salary: usd(3_200_000),
      p75Salary: usd(5_500_000),
      minSalary: usd(1_800_000),
      maxSalary: usd(14_000_000),
      payrollShare: 0.38,
    },
  ],
};

const payGap: PayGapReport = {
  baseCurrency: 'USD',
  fxAsOf: '2026-01-01',
  groupBy: 'department',
  minimumGroupSize: 5,
  overall: {
    key: 'overall',
    label: 'Whole organisation',
    headcount: 9197,
    gapPercent: 6.55,
    groups: [
      { gender: 'female', headcount: 4170, medianSalary: usd(7_429_000), suppressed: false },
      { gender: 'male', headcount: 5027, medianSalary: usd(7_949_700), suppressed: false },
    ],
  },
  rows: [
    {
      key: 'Engineering',
      label: 'Engineering',
      headcount: 3100,
      gapPercent: 3.2,
      groups: [
        { gender: 'female', headcount: 1400, medianSalary: usd(8_100_000), suppressed: false },
        { gender: 'male', headcount: 1700, medianSalary: usd(8_368_000), suppressed: false },
      ],
    },
    {
      key: 'Legal',
      label: 'Legal',
      headcount: 6,
      gapPercent: null,
      groups: [
        { gender: 'female', headcount: 3, medianSalary: null, suppressed: true },
        { gender: 'male', headcount: 3, medianSalary: null, suppressed: true },
      ],
    },
  ],
};

const bandHealth: BandHealthReport = {
  totals: { below: 211, within: 9443, above: 158, unbanded: 0 },
  rows: [
    {
      level: 'IC3',
      countryCode: 'IN',
      countryName: 'India',
      headcount: 640,
      below: 18,
      within: 610,
      above: 12,
      medianCompaRatio: 0.99,
    },
  ],
  mostUnderpaid: [
    employeeSummary({
      id: 77,
      firstName: 'Meera',
      lastName: 'Rao',
      compaRatio: 0.71,
      bandPosition: 'below',
    }),
  ],
};

const distribution: Distribution = {
  baseCurrency: 'USD',
  fxAsOf: '2026-01-01',
  bucketCount: 12,
  buckets: Array.from({ length: 12 }, (_, index) => ({
    lowerMinor: 1_000_000 + index * 3_000_000,
    upperMinor: 1_000_000 + (index + 1) * 3_000_000 - 1,
    count: [120, 640, 1400, 2100, 1900, 1300, 800, 500, 300, 160, 70, 30][index] ?? 0,
  })),
};

const payrollTrend: PayrollTrend = {
  baseCurrency: 'USD',
  fxAsOf: '2026-01-01',
  points: Array.from({ length: 12 }, (_, index) => ({
    month: `2025-${String(index + 1).padStart(2, '0')}`,
    payroll: usd(70_000_000_000 + index * 1_500_000_000),
    headcount: 9000 + index * 60,
  })),
};

const employeeList = {
  items: [
    employeeSummary(),
    employeeSummary({
      id: 2,
      firstName: 'Hank',
      lastName: 'Hughes',
      countryCode: 'US',
      countryName: 'United States',
      salary: { amountMinor: 8_000_000, currency: 'USD' },
      salaryBase: usd(8_000_000),
      compaRatio: 0.72,
      bandPosition: 'below',
    }),
  ],
  page: 1,
  pageSize: 25,
  total: 2,
  totalPages: 1,
};

/**
 * Routes a mocked fetch by path. The page tests exist to prove these screens mount and
 * render real data without throwing — the charts in particular are the components most
 * likely to fail at render time and least likely to be caught by anything else.
 */
export function mockApi(overrides: Record<string, unknown> = {}) {
  const routes: Record<string, unknown> = {
    '/api/reference': referenceData,
    '/api/analytics/overview': overview,
    '/api/analytics/breakdown': breakdown,
    '/api/analytics/pay-gap': payGap,
    '/api/analytics/band-health': bandHealth,
    '/api/analytics/distribution': distribution,
    '/api/analytics/payroll-trend': payrollTrend,
    '/api/employees': employeeList,
    '/api/employees/1': employeeDetail(),
    ...overrides,
  };

  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) => {
      const path = String(input).split('?')[0] ?? '';
      const body = routes[path];
      if (body === undefined) {
        return Promise.resolve({
          ok: false,
          status: 404,
          json: () =>
            Promise.resolve({ error: { code: 'not_found', message: `No mock for ${path}` } }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    }),
  );
}
