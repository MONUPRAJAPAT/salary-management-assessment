import type { DatabaseHandle } from '../db/connection';
import { COUNTRIES, FX_AS_OF, FX_RATES_TO_USD_MICROS, currencyRows } from './reference-data';
import { generateDataset, type SeedDataset } from './generate';

export interface SeedResult {
  employees: number;
  compensationRecords: number;
  bands: number;
  countries: number;
  asOf: string;
  durationMs: number;
}

/**
 * Writes a generated dataset into an empty database.
 *
 * Everything happens inside one transaction with prepared statements reused across rows.
 * That is the difference between ~0.5 seconds and several minutes: without an explicit
 * transaction, SQLite commits — and fsyncs — once per INSERT.
 */
export function seedDatabase(handle: DatabaseHandle, dataset?: SeedDataset): SeedResult {
  const data = dataset ?? generateDataset();
  const { sqlite } = handle;
  const startedAt = performance.now();

  const insertCurrency = sqlite.prepare(
    'INSERT INTO currencies (code, name, exponent, base_scale) VALUES (@code, @name, @exponent, @base_scale)',
  );
  const insertCountry = sqlite.prepare(
    'INSERT INTO countries (code, name, region, currency_code) VALUES (?, ?, ?, ?)',
  );
  const insertFxRate = sqlite.prepare(
    'INSERT INTO fx_rates (currency_code, rate_to_base_micros, as_of) VALUES (?, ?, ?)',
  );
  const insertBand = sqlite.prepare(
    `INSERT INTO salary_bands (country_code, level, currency_code, min_minor, mid_minor, max_minor)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertEmployee = sqlite.prepare(
    `INSERT INTO employees
       (id, employee_number, first_name, last_name, email, job_title, department, level,
        country_code, employment_type, status, gender, hire_date, manager_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  );
  const setManager = sqlite.prepare('UPDATE employees SET manager_id = ? WHERE id = ?');
  const insertCompensation = sqlite.prepare(
    `INSERT INTO compensation_records
       (employee_id, effective_from, base_salary_minor, currency_code, change_reason, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  const writeAll = sqlite.transaction((seed: SeedDataset) => {
    for (const currency of currencyRows()) insertCurrency.run(currency);
    for (const country of COUNTRIES) {
      insertCountry.run(country.code, country.name, country.region, country.currency);
    }
    for (const [currency, rate] of Object.entries(FX_RATES_TO_USD_MICROS)) {
      insertFxRate.run(currency, rate, FX_AS_OF);
    }
    for (const band of seed.bands) {
      insertBand.run(
        band.countryCode,
        band.level,
        band.currency,
        band.minMinor,
        band.midMinor,
        band.maxMinor,
      );
    }

    // Employees go in without managers, then managers are filled in a second pass. A
    // manager can appear later in the array than their report, and SQLite checks foreign
    // keys immediately, so a single pass would fail on forward references.
    seed.employees.forEach((employee, index) => {
      insertEmployee.run(
        index + 1,
        employee.employeeNumber,
        employee.firstName,
        employee.lastName,
        employee.email,
        employee.jobTitle,
        employee.department,
        employee.level,
        employee.countryCode,
        employee.employmentType,
        employee.status,
        employee.gender,
        employee.hireDate,
      );
    });

    seed.employees.forEach((employee, index) => {
      if (employee.managerIndex !== null) setManager.run(employee.managerIndex + 1, index + 1);
    });

    for (const record of seed.compensation) {
      insertCompensation.run(
        record.employeeIndex + 1,
        record.effectiveFrom,
        record.baseSalaryMinor,
        record.currency,
        record.changeReason,
        record.note,
      );
    }
  });

  writeAll(data);

  // Query planner statistics. Without ANALYZE, SQLite guesses at index selectivity, and
  // guesses badly on the directory's multi-filter queries.
  sqlite.exec('ANALYZE');

  return {
    employees: data.employees.length,
    compensationRecords: data.compensation.length,
    bands: data.bands.length,
    countries: COUNTRIES.length,
    asOf: data.asOf,
    durationMs: Math.round(performance.now() - startedAt),
  };
}
