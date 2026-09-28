import { beforeAll, describe, expect, it } from 'vitest';
import { TOTAL_HEADCOUNT, COUNTRIES } from './reference-data';
import {
  generateDataset,
  jobTitleFor,
  roundSalary,
  SEED_AS_OF,
  type SeedDataset,
} from './generate';

let dataset: SeedDataset;

beforeAll(() => {
  dataset = generateDataset();
});

describe('the generated organisation', () => {
  it('has exactly 10,000 employees', () => {
    expect(TOTAL_HEADCOUNT).toBe(10_000);
    expect(dataset.employees).toHaveLength(10_000);
  });

  it('places them across every country in the expected numbers', () => {
    const byCountry = new Map<string, number>();
    for (const employee of dataset.employees) {
      byCountry.set(employee.countryCode, (byCountry.get(employee.countryCode) ?? 0) + 1);
    }
    for (const country of COUNTRIES) {
      expect(byCountry.get(country.code)).toBe(country.headcount);
    }
  });

  it('defines a salary band for every level in every country', () => {
    expect(dataset.bands).toHaveLength(COUNTRIES.length * 10);
    for (const band of dataset.bands) {
      expect(band.minMinor).toBeLessThanOrEqual(band.midMinor);
      expect(band.midMinor).toBeLessThanOrEqual(band.maxMinor);
    }
  });

  it('gives everyone a unique email address and employee number', () => {
    expect(new Set(dataset.employees.map((e) => e.email)).size).toBe(dataset.employees.length);
    expect(new Set(dataset.employees.map((e) => e.employeeNumber)).size).toBe(
      dataset.employees.length,
    );
  });

  it('is reproducible: the same seed yields the same organisation', () => {
    const second = generateDataset();
    expect(second.employees[0]).toEqual(dataset.employees[0]);
    expect(second.employees.at(-1)).toEqual(dataset.employees.at(-1));
    expect(second.compensation).toHaveLength(dataset.compensation.length);
    expect(second.compensation.at(-1)).toEqual(dataset.compensation.at(-1));
  });

  it('produces a different organisation for a different seed', () => {
    expect(generateDataset(1).employees[0]).not.toEqual(dataset.employees[0]);
  });
});

describe('compensation history', () => {
  it('starts every employee with a hire record on their hire date', () => {
    const firstRecordByEmployee = new Map<number, (typeof dataset.compensation)[number]>();
    for (const record of dataset.compensation) {
      if (!firstRecordByEmployee.has(record.employeeIndex)) {
        firstRecordByEmployee.set(record.employeeIndex, record);
      }
    }

    expect(firstRecordByEmployee.size).toBe(dataset.employees.length);
    dataset.employees.forEach((employee, index) => {
      const first = firstRecordByEmployee.get(index);
      expect(first?.changeReason).toBe('hire');
      expect(first?.effectiveFrom).toBe(employee.hireDate);
    });
  });

  it('never dates a record before the hire or after the reference date', () => {
    const hireDates = dataset.employees.map((employee) => employee.hireDate);
    for (const record of dataset.compensation) {
      const hireDate = hireDates[record.employeeIndex];
      expect(record.effectiveFrom >= (hireDate ?? '')).toBe(true);
      expect(record.effectiveFrom <= SEED_AS_OF).toBe(true);
    }
  });

  it('records salaries as positive whole minor units', () => {
    for (const record of dataset.compensation) {
      expect(Number.isSafeInteger(record.baseSalaryMinor)).toBe(true);
      expect(record.baseSalaryMinor).toBeGreaterThan(0);
    }
  });

  it('pays everyone in their own country currency', () => {
    const currencyByCountry = new Map(COUNTRIES.map((country) => [country.code, country.currency]));
    dataset.compensation.forEach((record) => {
      const employee = dataset.employees[record.employeeIndex];
      expect(record.currency).toBe(currencyByCountry.get(employee?.countryCode ?? ''));
    });
  });

  it('gives longer-tenured employees more of a history than recent hires', () => {
    const countFor = (predicate: (hireDate: string) => boolean): number => {
      const indices = new Set(
        dataset.employees
          .map((employee, index) => (predicate(employee.hireDate) ? index : -1))
          .filter((index) => index >= 0),
      );
      const records = dataset.compensation.filter((r) => indices.has(r.employeeIndex)).length;
      return records / indices.size;
    };

    expect(countFor((date) => date < '2018-01-01')).toBeGreaterThan(
      countFor((date) => date > '2025-01-01'),
    );
  });
});

describe('the org chart', () => {
  it('never makes anyone their own manager', () => {
    dataset.employees.forEach((employee, index) => {
      expect(employee.managerIndex).not.toBe(index);
    });
  });

  it('points every manager reference at a real employee', () => {
    for (const employee of dataset.employees) {
      if (employee.managerIndex === null) continue;
      expect(dataset.employees[employee.managerIndex]).toBeDefined();
    }
  });

  it('contains no reporting cycles', () => {
    // Walk each chain to the top. A cycle would hang the profile page's manager
    // breadcrumb, so this is worth proving rather than assuming.
    const resolved = new Set<number>();
    dataset.employees.forEach((_, start) => {
      const seen = new Set<number>();
      let cursor: number | null = start;
      while (cursor !== null && !resolved.has(cursor)) {
        expect(seen.has(cursor)).toBe(false);
        seen.add(cursor);
        cursor = dataset.employees[cursor]?.managerIndex ?? null;
      }
      for (const index of seen) resolved.add(index);
    });
  });

  it('leaves exactly one person at the top', () => {
    const roots = dataset.employees.filter((employee) => employee.managerIndex === null);
    expect(roots).toHaveLength(1);
    expect(roots[0]?.level).toBe('M4');
  });

  it('keeps spans of control plausible', () => {
    const reportCounts = new Map<number, number>();
    for (const employee of dataset.employees) {
      if (employee.managerIndex === null) continue;
      reportCounts.set(employee.managerIndex, (reportCounts.get(employee.managerIndex) ?? 0) + 1);
    }
    expect(Math.max(...reportCounts.values())).toBeLessThanOrEqual(30);
  });
});

describe('helpers', () => {
  it('rounds salaries to figures a compensation team would publish', () => {
    expect(roundSalary(14_732_412, 'USD')).toBe(14_732_000); // nearest $10
    expect(roundSalary(1_847_263_00, 'INR')).toBe(184_730_000); // nearest ₹100
    expect(roundSalary(8_512_345, 'JPY')).toBe(8_512_300); // nearest ¥100
  });

  it('builds job titles from department and level', () => {
    expect(jobTitleFor('Engineering', 'IC3')).toBe('Senior Software Engineer');
    expect(jobTitleFor('Engineering', 'IC1')).toBe('Associate Software Engineer');
    expect(jobTitleFor('Sales', 'M3')).toBe('Director, Sales');
    expect(jobTitleFor('People', 'M4')).toBe('Vice President, People');
  });
});
