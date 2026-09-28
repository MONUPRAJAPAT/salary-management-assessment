import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { employeeListQuerySchema } from '@acme/shared';
import { createFixture } from '../testing/fixture';
import type { DatabaseHandle } from '../db/connection';
import { EmployeeRepository } from './employee.repository';

/**
 * "An employee's pay on a date is the latest record effective on or before it" is stated
 * twice in this codebase: declaratively, as the `current_compensation` view in the
 * schema, and operationally, as the correlated join the queries actually use — because
 * the view had to rank all 40,574 records to answer any question.
 *
 * Two statements of one rule can drift. These tests are what stops them.
 */

let handle: DatabaseHandle;

beforeEach(() => {
  handle = createFixture();
});

afterEach(async () => {
  await handle.close();
});

const viewResults = (): Map<number, number> =>
  new Map(
    (
      handle.sqlite
        .prepare('SELECT employee_id, compensation_record_id FROM current_compensation')
        .all() as Array<{ employee_id: number; compensation_record_id: number }>
    ).map((row) => [row.employee_id, row.compensation_record_id]),
  );

const fragmentResults = (asOf: string): Map<number, number> =>
  new Map(
    (
      handle.sqlite
        .prepare(
          `SELECT e.id AS employee_id, cc.id AS compensation_record_id
           FROM employees e
           JOIN compensation_records cc ON cc.id = (
             SELECT r.id FROM compensation_records r
             WHERE r.employee_id = e.id AND r.effective_from <= ?
             ORDER BY r.effective_from DESC, r.id DESC LIMIT 1)`,
        )
        .all(asOf) as Array<{ employee_id: number; compensation_record_id: number }>
    ).map((row) => [row.employee_id, row.compensation_record_id]),
  );

describe('the two statements of "current compensation"', () => {
  it('pick the same record for every employee', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(fragmentResults(today)).toEqual(viewResults());
  });

  it('both exclude a future-dated raise', () => {
    // Carol has a promotion recorded for 2099-01-01.
    const today = new Date().toISOString().slice(0, 10);
    const carolsRecord = fragmentResults(today).get(3);
    const future = handle.sqlite
      .prepare(`SELECT id FROM compensation_records WHERE effective_from = '2099-01-01'`)
      .get() as { id: number };

    expect(carolsRecord).not.toBe(future.id);
    expect(viewResults().get(3)).toBe(carolsRecord);
  });
});

describe('resolving compensation at a past date', () => {
  it('reports what an employee earned then, not what they earn now', async () => {
    // Alice: $80,000 from 2020-01-01, $90,000 from 2022-04-01, $100,000 from 2024-04-01.
    const asAt = (date: string) => new EmployeeRepository(handle.db, date);

    expect((await asAt('2021-06-01').findById(1))?.salary?.amountMinor).toBe(8_000_000);
    expect((await asAt('2023-06-01').findById(1))?.salary?.amountMinor).toBe(9_000_000);
    expect((await asAt('2026-01-01').findById(1))?.salary?.amountMinor).toBe(10_000_000);
  });

  it('treats an employee as unpaid before they were hired', async () => {
    // Mio joined in April 2023.
    const repository = new EmployeeRepository(handle.db, '2022-01-01');
    const mio = await repository.findById(7);
    expect(mio?.salary).toBeNull();
    expect(mio?.salaryBase).toBeNull();
  });

  it('ranks the directory by what people earned at that date', async () => {
    const repository = new EmployeeRepository(handle.db, '2021-01-01');
    const page = await repository.list(
      employeeListQuerySchema.parse({ sort: 'salary', direction: 'desc', pageSize: 3 }),
    );
    // In January 2021 Bob had not joined and Alice was still on $80,000.
    expect(page.items.map((employee) => employee.firstName)).toEqual(['Liam', 'Dan', 'Carol']);
  });
});
