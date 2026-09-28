import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openTestDatabase, type DatabaseHandle } from './connection';

let handle: DatabaseHandle;

beforeEach(() => {
  handle = openTestDatabase();
  handle.sqlite.exec(`
    INSERT INTO currencies (code, name, exponent, base_scale) VALUES ('USD', 'US Dollar', 2, 1);
    INSERT INTO countries (code, name, region, currency_code) VALUES ('US', 'United States', 'Americas', 'USD');
    INSERT INTO employees (id, employee_number, first_name, last_name, email, job_title,
                           department, level, country_code, employment_type, hire_date)
    VALUES (1, 'E-0001', 'Ada', 'Lovelace', 'ada@acme.test', 'Engineer',
            'Engineering', 'IC4', 'US', 'full_time', '2020-01-01');
  `);
});

afterEach(async () => {
  await handle.close();
});

const addCompensation = (effectiveFrom: string, salaryMinor: number, reason = 'merit'): void => {
  handle.sqlite
    .prepare(
      `INSERT INTO compensation_records
         (employee_id, effective_from, base_salary_minor, currency_code, change_reason)
       VALUES (1, ?, ?, 'USD', ?)`,
    )
    .run(effectiveFrom, salaryMinor, reason);
};

const currentSalary = (): number | undefined =>
  (
    handle.sqlite
      .prepare('SELECT base_salary_minor FROM current_compensation WHERE employee_id = 1')
      .get() as { base_salary_minor: number } | undefined
  )?.base_salary_minor;

describe('current_compensation view', () => {
  it('is the latest record effective on or before today', () => {
    addCompensation('2020-01-01', 10_000_000, 'hire');
    addCompensation('2022-04-01', 12_000_000);
    addCompensation('2024-04-01', 14_000_000);

    expect(currentSalary()).toBe(14_000_000);
  });

  it('ignores a future-dated raise until it takes effect', () => {
    addCompensation('2020-01-01', 10_000_000, 'hire');
    addCompensation('2099-01-01', 99_000_000, 'promotion');

    expect(currentSalary()).toBe(10_000_000);
  });

  it('is empty for an employee with no compensation records', () => {
    expect(currentSalary()).toBeUndefined();
  });

  it('breaks ties on the same effective date with the most recently recorded row', () => {
    // Recording a raise and then correcting it the same day is a real event. The
    // correction is a later row on the same date, and it must win.
    addCompensation('2024-04-01', 14_000_000, 'merit');
    addCompensation('2024-04-01', 14_500_000, 'correction');

    expect(currentSalary()).toBe(14_500_000);
  });
});

describe('schema constraints', () => {
  it('rejects a department that is not in the shared vocabulary', () => {
    expect(() =>
      handle.sqlite.exec(`
        INSERT INTO employees (employee_number, first_name, last_name, email, job_title,
                               department, level, country_code, employment_type, hire_date)
        VALUES ('E-0002', 'Grace', 'Hopper', 'grace@acme.test', 'Engineer',
                'Astrology', 'IC4', 'US', 'full_time', '2020-01-01')`),
    ).toThrow(/CHECK constraint failed/i);
  });

  it('rejects a zero or negative salary', () => {
    expect(() => addCompensation('2021-01-01', 0)).toThrow(/CHECK constraint failed/i);
  });

  it('rejects a band whose minimum exceeds its maximum', () => {
    expect(() =>
      handle.sqlite.exec(`
        INSERT INTO salary_bands (country_code, level, currency_code, min_minor, mid_minor, max_minor)
        VALUES ('US', 'IC4', 'USD', 20000000, 15000000, 10000000)`),
    ).toThrow(/CHECK constraint failed/i);
  });

  it('enforces foreign keys, which SQLite leaves off unless asked', () => {
    expect(() =>
      handle.sqlite.exec(`
        INSERT INTO employees (employee_number, first_name, last_name, email, job_title,
                               department, level, country_code, employment_type, hire_date)
        VALUES ('E-0003', 'Alan', 'Turing', 'alan@acme.test', 'Engineer',
                'Engineering', 'IC4', 'ZZ', 'full_time', '2020-01-01')`),
    ).toThrow(/FOREIGN KEY constraint failed/i);
  });
});
