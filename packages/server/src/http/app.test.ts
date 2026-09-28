import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import {
  bandHealthReportSchema,
  dimensionBreakdownSchema,
  distributionSchema,
  employeeDetailSchema,
  employeeListResponseSchema,
  overviewSchema,
  payGapReportSchema,
  payrollTrendSchema,
  referenceDataSchema,
} from '@acme/shared';
import { createFixture, EXPECTED } from '../testing/fixture';
import type { DatabaseHandle } from '../db/connection';
import { createApp } from './app';

let handle: DatabaseHandle;
let app: Express;

beforeEach(() => {
  handle = createFixture();
  app = createApp({ db: handle.db });
});

afterEach(async () => {
  await handle.close();
});

describe('GET /api/health', () => {
  it('reports that the service is up', async () => {
    const response = await request(app).get('/api/health').expect(200);
    expect(response.body.status).toBe('ok');
  });
});

describe('GET /api/reference', () => {
  it('returns everything the UI needs to render filters and format money', async () => {
    const response = await request(app).get('/api/reference').expect(200);
    const reference = referenceDataSchema.parse(response.body);

    expect(reference.countries.map((country) => country.code)).toEqual(['IN', 'JP', 'US']);
    expect(reference.fx.baseCurrency).toBe('USD');
    expect(reference.fx.rates.INR).toBe(12_500);
  });
});

describe('GET /api/employees', () => {
  it('returns a page that matches the published contract', async () => {
    const response = await request(app).get('/api/employees').expect(200);
    const page = employeeListResponseSchema.parse(response.body);

    expect(page.total).toBe(EXPECTED.totalHeadcount);
    expect(page.items[0]?.salary).toHaveProperty('amountMinor');
  });

  it('accepts filters as repeated or comma-separated parameters', async () => {
    const commas = await request(app).get('/api/employees?country=IN,JP').expect(200);
    const repeated = await request(app).get('/api/employees?country=IN&country=JP').expect(200);

    expect(commas.body.total).toBe(5);
    expect(repeated.body.total).toBe(5);
  });

  it('rejects an unknown sort field instead of quietly ignoring it', async () => {
    const response = await request(app).get('/api/employees?sort=favourite').expect(400);
    expect(response.body.error.code).toBe('validation_failed');
    expect(response.body.error.details[0].field).toBe('sort');
  });

  it('rejects a page size beyond the cap', async () => {
    await request(app).get('/api/employees?pageSize=100000').expect(400);
  });
});

describe('GET /api/employees/:id', () => {
  it('returns the full profile with compensation history', async () => {
    const response = await request(app).get('/api/employees/1').expect(200);
    const employee = employeeDetailSchema.parse(response.body);

    expect(employee.firstName).toBe('Alice');
    expect(employee.compensationHistory).toHaveLength(3);
    expect(employee.directReportCount).toBe(2);
  });

  it('is a 404 for an employee who does not exist', async () => {
    const response = await request(app).get('/api/employees/9999').expect(404);
    expect(response.body.error.code).toBe('not_found');
  });

  it('is a 400 for an id that is not a number', async () => {
    await request(app).get('/api/employees/banana').expect(400);
  });
});

describe('GET /api/employees/export', () => {
  it('exports the filtered view as CSV, not as an employee id', async () => {
    const response = await request(app).get('/api/employees/export?country=JP').expect(200);

    expect(response.headers['content-type']).toMatch(/text\/csv/);
    expect(response.headers['content-disposition']).toMatch(/acme-salaries\.csv/);

    const lines = response.text.trim().split('\r\n');
    expect(lines).toHaveLength(2); // header plus Mio
    expect(lines[0]).toContain('Employee number');
    expect(lines[1]).toContain('Tanaka');
    // Major units, unformatted, so a spreadsheet can sum the column.
    expect(lines[1]).toContain('16000000');
  });

  it('quotes a job title containing a comma, so the columns stay aligned', async () => {
    await request(app)
      .patch('/api/employees/1')
      .send({ jobTitle: 'Director, Engineering' })
      .expect(200);

    const response = await request(app).get('/api/employees/export?search=Alice').expect(200);
    const row = response.text.trim().split('\r\n')[1] ?? '';

    expect(row).toContain('"Director, Engineering"');
    // Unquoted, that title would split into two cells and shift every column after it.
    expect(row.split(',')).toHaveLength(17);
  });
});

describe('POST /api/employees', () => {
  const newEmployee = {
    firstName: 'Nina',
    lastName: 'Novak',
    email: 'nina.novak@acme.example',
    jobTitle: 'Staff Software Engineer',
    department: 'Engineering',
    level: 'IC4',
    countryCode: 'US',
    employmentType: 'full_time',
    gender: 'female',
    hireDate: '2026-02-01',
    managerId: null,
    startingSalaryMinor: 15_000_000,
  };

  it('creates the employee and their first compensation record together', async () => {
    const response = await request(app).post('/api/employees').send(newEmployee).expect(201);
    const created = employeeDetailSchema.parse(response.body);

    expect(created.employeeNumber).toBe('ACME-00013');
    expect(created.salary).toEqual({ amountMinor: 15_000_000, currency: 'USD' });
    expect(created.compensationHistory).toHaveLength(1);
    expect(created.compensationHistory[0]?.changeReason).toBe('hire');
  });

  it('pays them in their country currency, which the client never chooses', async () => {
    const response = await request(app)
      .post('/api/employees')
      .send({ ...newEmployee, countryCode: 'IN', startingSalaryMinor: 400_000_000 })
      .expect(201);

    expect(response.body.salary.currency).toBe('INR');
    expect(response.body.salaryBase).toEqual({ amountMinor: 5_000_000, currency: 'USD' });
  });

  it('refuses a duplicate email address', async () => {
    await request(app).post('/api/employees').send(newEmployee).expect(201);
    const response = await request(app).post('/api/employees').send(newEmployee).expect(409);
    expect(response.body.error.code).toBe('conflict');
  });

  it('refuses a country ACME does not operate in', async () => {
    await request(app)
      .post('/api/employees')
      .send({ ...newEmployee, countryCode: 'ZZ' })
      .expect(400);
  });

  it('refuses a manager who does not exist', async () => {
    await request(app)
      .post('/api/employees')
      .send({ ...newEmployee, managerId: 9999 })
      .expect(400);
  });

  it('refuses to create an employee with no salary', async () => {
    const { startingSalaryMinor: _omitted, ...withoutSalary } = newEmployee;
    const response = await request(app).post('/api/employees').send(withoutSalary).expect(400);
    expect(response.body.error.details.map((d: { field: string }) => d.field)).toContain(
      'startingSalaryMinor',
    );
  });

  it('leaves no orphan employee behind when the transaction is rolled back', async () => {
    await request(app)
      .post('/api/employees')
      .send({ ...newEmployee, startingSalaryMinor: -1 })
      .expect(400);

    const page = await request(app).get('/api/employees?search=Novak').expect(200);
    expect(page.body.total).toBe(0);
  });
});

describe('PATCH /api/employees/:id', () => {
  it('updates attributes that are not compensation', async () => {
    const response = await request(app)
      .patch('/api/employees/8')
      .send({ level: 'IC3', jobTitle: 'Senior Account Executive' })
      .expect(200);

    expect(response.body.level).toBe('IC3');
    expect(response.body.jobTitle).toBe('Senior Account Executive');
  });

  it('offers no way to change a salary', async () => {
    // Pay changes must carry an effective date and a reason, so this field is not part
    // of the update contract at all and is rejected rather than silently dropped.
    const before = await request(app).get('/api/employees/8').expect(200);
    await request(app).patch('/api/employees/8').send({ salaryMinor: 99_000_000 }).expect(400);
    const after = await request(app).get('/api/employees/8').expect(200);
    expect(after.body.salary).toEqual(before.body.salary);
  });

  it('refuses to let someone manage themselves', async () => {
    await request(app).patch('/api/employees/8').send({ managerId: 8 }).expect(400);
  });

  it('refuses a reporting line that would close a loop', async () => {
    // Hank (8) already reports to Alice (1). Making Alice report to Hank would create a
    // cycle that hangs anything walking the chain.
    const response = await request(app)
      .patch('/api/employees/1')
      .send({ managerId: 8 })
      .expect(400);
    expect(response.body.error.message).toMatch(/cycle/i);
  });

  it('is a 404 for an employee who does not exist', async () => {
    await request(app).patch('/api/employees/9999').send({ level: 'IC3' }).expect(404);
  });

  it('rejects an empty update', async () => {
    await request(app).patch('/api/employees/8').send({}).expect(400);
  });
});

describe('POST /api/employees/:id/compensation', () => {
  it('records an absolute raise and makes it current', async () => {
    const response = await request(app)
      .post('/api/employees/8/compensation')
      .send({ effectiveFrom: '2026-01-01', changeReason: 'merit', newSalaryMinor: 8_800_000 })
      .expect(201);

    expect(response.body.record.amount).toEqual({ amountMinor: 8_800_000, currency: 'USD' });
    expect(response.body.record.changeFromPreviousPercent).toBeCloseTo(10, 10);

    const employee = await request(app).get('/api/employees/8').expect(200);
    expect(employee.body.salary.amountMinor).toBe(8_800_000);
    expect(employee.body.compensationHistory).toHaveLength(2);
  });

  it('applies a percentage to the salary in force on the effective date', async () => {
    // Alice earned $80,000 from 2020, $90,000 from April 2022 and $100,000 from April
    // 2024. A 10% rise backdated to 2023 must build on $90,000, not on today's $100,000.
    const response = await request(app)
      .post('/api/employees/1/compensation')
      .send({ effectiveFrom: '2023-01-01', changeReason: 'correction', increasePercent: 10 })
      .expect(201);

    expect(response.body.record.amount.amountMinor).toBe(9_900_000);

    // And it does not disturb today's salary, which is set by a later record.
    const alice = await request(app).get('/api/employees/1').expect(200);
    expect(alice.body.salary.amountMinor).toBe(10_000_000);
  });

  it('refuses a change dated before the employee was hired', async () => {
    const response = await request(app)
      .post('/api/employees/8/compensation')
      .send({ effectiveFrom: '2000-01-01', changeReason: 'merit', increasePercent: 5 })
      .expect(400);
    expect(response.body.error.message).toMatch(/before the employee was hired/i);
  });

  it('refuses both an amount and a percentage at once', async () => {
    await request(app)
      .post('/api/employees/8/compensation')
      .send({
        effectiveFrom: '2026-01-01',
        changeReason: 'merit',
        newSalaryMinor: 9_000_000,
        increasePercent: 5,
      })
      .expect(400);
  });

  it('refuses neither an amount nor a percentage', async () => {
    await request(app)
      .post('/api/employees/8/compensation')
      .send({ effectiveFrom: '2026-01-01', changeReason: 'merit' })
      .expect(400);
  });

  it('treats an identical repeated submission as a conflict', async () => {
    const change = {
      effectiveFrom: '2026-01-01',
      changeReason: 'merit',
      newSalaryMinor: 8_800_000,
    };
    await request(app).post('/api/employees/8/compensation').send(change).expect(201);
    await request(app).post('/api/employees/8/compensation').send(change).expect(409);
  });

  it('allows a same-day correction with a different amount', async () => {
    await request(app)
      .post('/api/employees/8/compensation')
      .send({ effectiveFrom: '2026-01-01', changeReason: 'merit', newSalaryMinor: 8_800_000 })
      .expect(201);
    await request(app)
      .post('/api/employees/8/compensation')
      .send({ effectiveFrom: '2026-01-01', changeReason: 'correction', newSalaryMinor: 8_600_000 })
      .expect(201);

    const employee = await request(app).get('/api/employees/8').expect(200);
    expect(employee.body.salary.amountMinor).toBe(8_600_000);
  });

  it('is a 404 for an employee who does not exist', async () => {
    await request(app)
      .post('/api/employees/9999/compensation')
      .send({ effectiveFrom: '2026-01-01', changeReason: 'merit', newSalaryMinor: 1_000_000 })
      .expect(404);
  });

  it('shows up in the organisation median straight away', async () => {
    const before = await request(app).get('/api/analytics/overview').expect(200);
    await request(app)
      .post('/api/employees/11/compensation')
      .send({ effectiveFrom: '2026-01-01', changeReason: 'promotion', newSalaryMinor: 960_000_000 })
      .expect(201);
    const after = await request(app).get('/api/analytics/overview').expect(200);

    // Kiran goes from ₹4,800,000 ($60,000) to ₹9,600,000 ($120,000).
    expect(after.body.annualPayroll.amountMinor - before.body.annualPayroll.amountMinor).toBe(
      6_000_000,
    );
  });
});

describe('analytics endpoints', () => {
  it('returns an overview matching the contract', async () => {
    const response = await request(app).get('/api/analytics/overview').expect(200);
    const overview = overviewSchema.parse(response.body);
    expect(overview.headcount).toBe(EXPECTED.activeHeadcount);
    expect(overview.fxAsOf).toBe('2026-01-01');
  });

  it('breaks down by each supported dimension', async () => {
    for (const dimension of ['country', 'department', 'level', 'gender'] as const) {
      const response = await request(app)
        .get(`/api/analytics/breakdown?dimension=${dimension}`)
        .expect(200);
      const breakdown = dimensionBreakdownSchema.parse(response.body);
      expect(breakdown.dimension).toBe(dimension);
      expect(breakdown.rows.length).toBeGreaterThan(0);
    }
  });

  it('rejects a dimension that is not supported', async () => {
    await request(app).get('/api/analytics/breakdown?dimension=astrology').expect(400);
  });

  it('returns a pay-gap report that states its suppression threshold', async () => {
    const response = await request(app).get('/api/analytics/pay-gap?groupBy=level').expect(200);
    const report = payGapReportSchema.parse(response.body);
    expect(report.minimumGroupSize).toBe(5);
    expect(report.overall.groups.length).toBeGreaterThan(0);
  });

  it('returns band health with an actionable list of underpaid people', async () => {
    const response = await request(app).get('/api/analytics/band-health').expect(200);
    const report = bandHealthReportSchema.parse(response.body);

    expect(report.totals.below).toBe(EXPECTED.bandPositions.below);
    expect(report.mostUnderpaid[0]?.firstName).toBe('Esha');
  });

  it('returns a distribution and a payroll trend', async () => {
    const distribution = await request(app)
      .get('/api/analytics/distribution?bucketCount=8')
      .expect(200);
    expect(distributionSchema.parse(distribution.body).buckets).toHaveLength(8);

    const trend = await request(app).get('/api/analytics/payroll-trend?months=6').expect(200);
    expect(payrollTrendSchema.parse(trend.body).points.length).toBeGreaterThan(0);
  });

  it('applies filters to every view', async () => {
    const response = await request(app).get('/api/analytics/overview?country=US').expect(200);
    expect(response.body.headcount).toBe(EXPECTED.byCountry.US.headcount);
  });
});

describe('unknown routes', () => {
  it('answers an unknown API path with JSON, not HTML', async () => {
    const response = await request(app).get('/api/nonsense').expect(404);
    expect(response.body.error.code).toBe('not_found');
  });
});
