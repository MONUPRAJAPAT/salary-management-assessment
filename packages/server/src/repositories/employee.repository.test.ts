import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { employeeListQuerySchema, type EmployeeListQuery } from '@acme/shared';
import { createFixture, EXPECTED } from '../testing/fixture';
import type { DatabaseHandle } from '../db/connection';
import { EmployeeRepository } from './employee.repository';

let handle: DatabaseHandle;
let repository: EmployeeRepository;

beforeEach(() => {
  handle = createFixture();
  repository = new EmployeeRepository(handle.db);
});

afterEach(async () => {
  await handle.close();
});

/** Builds a query the same way the HTTP layer does, so defaults are exercised too. */
const query = (overrides: Partial<Record<string, unknown>> = {}): EmployeeListQuery =>
  employeeListQuerySchema.parse({ pageSize: 50, ...overrides });

const namesOf = (items: Array<{ firstName: string }>): string[] =>
  items.map((item) => item.firstName);

describe('listing', () => {
  it('returns everyone, including terminated employees, by default', async () => {
    const result = await repository.list(query());
    expect(result.total).toBe(EXPECTED.totalHeadcount);
    expect(result.items).toHaveLength(EXPECTED.totalHeadcount);
  });

  it('paginates without losing or repeating anyone', async () => {
    const first = await repository.list(query({ pageSize: 5, page: 1 }));
    const second = await repository.list(query({ pageSize: 5, page: 2 }));
    const third = await repository.list(query({ pageSize: 5, page: 3 }));

    expect([first.items.length, second.items.length, third.items.length]).toEqual([5, 5, 2]);
    expect(first.totalPages).toBe(3);
    const everyone = [...first.items, ...second.items, ...third.items].map((e) => e.id);
    expect(new Set(everyone).size).toBe(12);
  });
});

describe('search', () => {
  it('matches on name', async () => {
    const result = await repository.list(query({ search: 'tanaka' }));
    expect(namesOf(result.items)).toEqual(['Mio']);
  });

  it('matches on email, employee number and job title', async () => {
    expect((await repository.list(query({ search: 'esha.iyer@' }))).total).toBe(1);
    expect((await repository.list(query({ search: 'ACME-00004' }))).total).toBe(1);
    expect((await repository.list(query({ search: 'IC2 Sales' }))).total).toBe(4);
  });

  it('ignores case', async () => {
    expect((await repository.list(query({ search: 'KIRAN' }))).total).toBe(1);
  });

  it('returns an empty page rather than failing when nothing matches', async () => {
    const result = await repository.list(query({ search: 'nobody here' }));
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(1);
  });
});

describe('filters', () => {
  it('narrows by country', async () => {
    expect((await repository.list(query({ country: 'IN' }))).total).toBe(4);
  });

  it('accepts several values for one filter', async () => {
    expect((await repository.list(query({ country: 'IN,JP' }))).total).toBe(5);
  });

  it('combines filters with AND', async () => {
    const result = await repository.list(query({ country: 'US', department: 'Sales' }));
    expect(namesOf(result.items).sort()).toEqual(['Hank', 'Iris']);
  });

  it('excludes terminated employees when asked for active ones', async () => {
    expect((await repository.list(query({ status: 'active' }))).total).toBe(
      EXPECTED.activeHeadcount,
    );
  });

  it('finds everyone paid below their band', async () => {
    const result = await repository.list(query({ bandPosition: 'below' }));
    expect(namesOf(result.items)).toEqual(['Esha']);
  });

  it('finds everyone paid above their band', async () => {
    const result = await repository.list(query({ bandPosition: 'above', sort: 'name' }));
    expect(namesOf(result.items).sort()).toEqual(['Dan', 'Kiran']);
  });

  it('narrows to a manager’s direct reports', async () => {
    const result = await repository.list(query({ managerId: 1 }));
    expect(namesOf(result.items).sort()).toEqual(['Hank', 'Iris']);
  });
});

describe('sorting', () => {
  it('sorts by salary in the base currency, not the local figure', async () => {
    // Kiran earns ₹4,800,000 and Hank earns $80,000. Ordering by the raw number would
    // put Kiran at the top of the company; converted, he is paid $60,000.
    const result = await repository.list(
      query({ status: 'active', sort: 'salary', direction: 'desc' }),
    );
    expect(namesOf(result.items)).toEqual([
      'Dan', // $160,000
      'Carol', // $140,000
      'Bob', // $120,000
      'Alice', // $100,000
      'Mio', // $100,000
      'Iris', //  $90,000
      'Farhan', //  $80,000
      'Hank', //  $80,000
      'Kiran', //  $60,000
      'Esha', //  $50,000
      'Jaya', //  $40,000
    ]);
  });

  it('sorts levels by seniority, not alphabetically', async () => {
    const result = await repository.list(query({ sort: 'level', direction: 'desc' }));
    // M2 outranks IC3 despite sorting after it as a string.
    expect(result.items[0]?.level).toBe('M2');
  });

  it('sorts by compa-ratio, which is comparable across countries and levels', async () => {
    const result = await repository.list(query({ sort: 'compaRatio', direction: 'desc' }));
    expect(namesOf(result.items).slice(0, 2)).toEqual(['Kiran', 'Dan']); // 1.5 then 1.33
    expect(namesOf(result.items).at(-1)).toBe('Esha'); // 0.625
  });
});

describe('currency normalisation', () => {
  it('converts a zero-exponent currency correctly', async () => {
    // ¥16,000,000 at ¥160 = $1 is $100,000. If base_scale were dropped from the SQL this
    // would read as $1,000 and every Japanese salary in the product would be wrong.
    const result = await repository.list(query({ search: 'Mio' }));
    expect(result.items[0]?.salary).toEqual({ amountMinor: 16_000_000, currency: 'JPY' });
    expect(result.items[0]?.salaryBase).toEqual({ amountMinor: 10_000_000, currency: 'USD' });
  });

  it('converts rupees to dollars', async () => {
    const result = await repository.list(query({ search: 'Esha' }));
    expect(result.items[0]?.salary).toEqual({ amountMinor: 400_000_000, currency: 'INR' });
    expect(result.items[0]?.salaryBase).toEqual({ amountMinor: 5_000_000, currency: 'USD' });
  });
});

describe('an employee profile', () => {
  it('shows the current salary, ignoring a future-dated raise', async () => {
    // Carol has a promotion recorded for 2099. It is real, it is in her history, and it
    // is not her pay today.
    const carol = await repository.findById(3);
    expect(carol?.salary?.amountMinor).toBe(14_000_000);
    expect(carol?.compensationHistory).toHaveLength(2);
    expect(carol?.compensationHistory[0]?.effectiveFrom).toBe('2099-01-01');
  });

  it('returns history newest first, with the change against the previous record', async () => {
    const alice = await repository.findById(1);
    expect(alice?.compensationHistory.map((record) => record.amount.amountMinor)).toEqual([
      10_000_000, 9_000_000, 8_000_000,
    ]);
    expect(alice?.compensationHistory[0]?.changeFromPreviousPercent).toBeCloseTo(11.11, 2);
    expect(alice?.compensationHistory[1]?.changeFromPreviousPercent).toBeCloseTo(12.5, 10);
    // The hire record has nothing to compare against.
    expect(alice?.compensationHistory[2]?.changeFromPreviousPercent).toBeNull();
    expect(alice?.compensationHistory[2]?.changeReason).toBe('hire');
  });

  it('includes the salary band and the manager', async () => {
    const hank = await repository.findById(8);
    expect(hank?.band).toEqual({
      currency: 'USD',
      minMinor: 6_400_000,
      midMinor: 8_000_000,
      maxMinor: 10_000_000,
    });
    expect(hank?.managerName).toBe('Alice Anand');
    expect(hank?.compaRatio).toBe(1);
  });

  it('counts direct reports', async () => {
    expect((await repository.findById(1))?.directReportCount).toBe(2);
    expect((await repository.findById(8))?.directReportCount).toBe(0);
  });

  it('returns null for an employee who does not exist', async () => {
    expect(await repository.findById(9999)).toBeNull();
  });
});
