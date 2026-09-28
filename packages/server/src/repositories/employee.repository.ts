import { sql, type Kysely, type SelectQueryBuilder } from 'kysely';
import {
  BASE_CURRENCY,
  money,
  type CompensationRecord,
  type CurrencyCode,
  type EmployeeDetail,
  type EmployeeListQuery,
  type EmployeeSummary,
  type Paginated,
} from '@acme/shared';
import type { Database } from '../db/types';
import { baseSalaryMinorSql, bandPositionSql, compaRatioSql, levelSortOrderSql } from './sql';
import { percentageChangeBetween } from '../domain/compensation';

/**
 * All SQL for reading employees. Nothing above this layer knows what a JOIN is, and
 * nothing below it knows what an HTTP request is.
 */
export class EmployeeRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async list(query: EmployeeListQuery): Promise<Paginated<EmployeeSummary>> {
    const filtered = this.applyFilters(this.baseQuery(), query);

    const [{ total }, rows] = await Promise.all([
      filtered
        .select(sql<number>`COUNT(*)`.as('total'))
        .executeTakeFirstOrThrow(),
      this.applySort(filtered.select(EMPLOYEE_COLUMNS), query)
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize)
        .execute(),
    ]);

    return {
      items: rows.map(toEmployeeSummary),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  /** Streams the full filtered set for CSV export, bypassing pagination by design. */
  async listAllForExport(query: EmployeeListQuery): Promise<EmployeeSummary[]> {
    const filtered = this.applyFilters(this.baseQuery(), query);
    const rows = await this.applySort(filtered.select(EMPLOYEE_COLUMNS), query).execute();
    return rows.map(toEmployeeSummary);
  }

  async findById(id: number): Promise<EmployeeDetail | null> {
    const row = await this.baseQuery()
      .leftJoin('employees as mgr', 'mgr.id', 'e.manager_id')
      .where('e.id', '=', id)
      .select(EMPLOYEE_COLUMNS)
      .select([
        'e.gender',
        'e.manager_id',
        sql<string | null>`mgr.first_name || ' ' || mgr.last_name`.as('manager_name'),
        sql<number>`(SELECT COUNT(*) FROM employees r WHERE r.manager_id = e.id)`.as(
          'direct_report_count',
        ),
      ])
      .executeTakeFirst();

    if (!row) return null;

    return {
      ...toEmployeeSummary(row),
      gender: row.gender,
      managerId: row.manager_id,
      managerName: row.manager_name,
      directReportCount: row.direct_report_count,
      band:
        row.band_min_minor !== null && row.band_mid_minor !== null && row.band_max_minor !== null
          ? {
              currency: (row.band_currency ?? row.currency_code) as CurrencyCode,
              minMinor: row.band_min_minor,
              midMinor: row.band_mid_minor,
              maxMinor: row.band_max_minor,
            }
          : null,
      compensationHistory: await this.compensationHistory(id),
    };
  }

  /**
   * Full history, newest first, with each record's change against the one before it.
   * The percentage is computed here rather than in the UI so the profile page, the CSV
   * export and any future report all quote the same number.
   */
  async compensationHistory(employeeId: number): Promise<CompensationRecord[]> {
    const rows = await this.db
      .selectFrom('compensation_records as cr')
      .innerJoin('currencies as cur', 'cur.code', 'cr.currency_code')
      .innerJoin('fx_rates as fx', 'fx.currency_code', 'cr.currency_code')
      .where('cr.employee_id', '=', employeeId)
      .orderBy('cr.effective_from', 'asc')
      .orderBy('cr.id', 'asc')
      .select([
        'cr.id',
        'cr.effective_from',
        'cr.base_salary_minor',
        'cr.currency_code',
        'cr.change_reason',
        'cr.note',
        'cr.recorded_at',
        sql<number>`((cr.base_salary_minor * fx.rate_to_base_micros * cur.base_scale) + 500000) / 1000000`.as(
          'base_salary_minor_in_base_currency',
        ),
      ])
      .execute();

    return rows
      .map((row, index) => ({
        id: row.id,
        effectiveFrom: row.effective_from,
        amount: money(row.base_salary_minor, row.currency_code),
        amountBase: money(row.base_salary_minor_in_base_currency, BASE_CURRENCY),
        changeReason: row.change_reason,
        note: row.note,
        recordedAt: row.recorded_at,
        changeFromPreviousPercent: percentageChangeBetween(
          rows[index - 1]?.base_salary_minor,
          row.base_salary_minor,
        ),
      }))
      .reverse();
  }

  async existsById(id: number): Promise<boolean> {
    const row = await this.db
      .selectFrom('employees')
      .select('id')
      .where('id', '=', id)
      .executeTakeFirst();
    return row !== undefined;
  }

  /**
   * The shape every employee read starts from.
   *
   * Compensation is LEFT JOINed: an employee with no salary record is a hole in the
   * system of record, and the HR Manager needs to see them rather than have them quietly
   * vanish from the directory.
   */
  private baseQuery() {
    return this.db
      .selectFrom('employees as e')
      .innerJoin('countries as co', 'co.code', 'e.country_code')
      .leftJoin('current_compensation as cc', 'cc.employee_id', 'e.id')
      .leftJoin('currencies as cur', 'cur.code', 'cc.currency_code')
      .leftJoin('fx_rates as fx', 'fx.currency_code', 'cc.currency_code')
      .leftJoin('salary_bands as b', (join) =>
        join.onRef('b.country_code', '=', 'e.country_code').onRef('b.level', '=', 'e.level'),
      );
  }

  private applyFilters<O>(
    query: EmployeeQuery<O>,
    filter: EmployeeListQuery,
  ): EmployeeQuery<O> {
    let result = query;

    if (filter.search) {
      // 10,000 rows is small enough that a scan with LIKE costs about 3 ms — measured,
      // not assumed (see docs/performance.md). Full-text search would be machinery
      // bought for a problem this dataset does not have.
      const term = `%${filter.search.toLowerCase()}%`;
      result = result.where((eb) =>
        eb.or([
          eb(sql`LOWER(e.first_name || ' ' || e.last_name)`, 'like', term),
          eb(sql`LOWER(e.email)`, 'like', term),
          eb(sql`LOWER(e.employee_number)`, 'like', term),
          eb(sql`LOWER(e.job_title)`, 'like', term),
        ]),
      );
    }

    if (filter.country?.length) result = result.where('e.country_code', 'in', filter.country);
    if (filter.department?.length) result = result.where('e.department', 'in', filter.department);
    if (filter.level?.length) result = result.where('e.level', 'in', filter.level);
    if (filter.status?.length) result = result.where('e.status', 'in', filter.status);
    if (filter.employmentType?.length) {
      result = result.where('e.employment_type', 'in', filter.employmentType);
    }
    if (filter.managerId !== undefined) result = result.where('e.manager_id', '=', filter.managerId);
    if (filter.bandPosition?.length) {
      result = result.where(bandPositionSql, 'in', filter.bandPosition);
    }

    return result;
  }

  private applySort<O>(query: EmployeeQuery<O>, filter: EmployeeListQuery): EmployeeQuery<O> {
    const direction = filter.direction;

    switch (filter.sort) {
      case 'salary':
        // Sorting must use the normalised amount. Ordering by the local figure would
        // rank ₹2,000,000 above $150,000 because 2,000,000 is the bigger number.
        return query.orderBy(baseSalaryMinorSql, direction).orderBy('e.id', 'asc');
      case 'hireDate':
        return query.orderBy('e.hire_date', direction).orderBy('e.id', 'asc');
      case 'level':
        return query.orderBy(levelSortOrderSql, direction).orderBy('e.id', 'asc');
      case 'department':
        return query.orderBy('e.department', direction).orderBy('e.last_name', 'asc');
      case 'country':
        return query.orderBy('co.name', direction).orderBy('e.last_name', 'asc');
      case 'compaRatio':
        return query.orderBy(compaRatioSql, direction).orderBy('e.id', 'asc');
      case 'name':
      default:
        return query.orderBy('e.last_name', direction).orderBy('e.first_name', direction);
    }
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type EmployeeQuery<O> = SelectQueryBuilder<any, any, O>;
/* eslint-enable @typescript-eslint/no-explicit-any */

const EMPLOYEE_COLUMNS = [
  'e.id',
  'e.employee_number',
  'e.first_name',
  'e.last_name',
  'e.email',
  'e.job_title',
  'e.department',
  'e.level',
  'e.country_code',
  'e.employment_type',
  'e.status',
  'e.hire_date',
  'co.name as country_name',
  'cc.base_salary_minor',
  'cc.currency_code',
  'b.currency_code as band_currency',
  'b.min_minor as band_min_minor',
  'b.mid_minor as band_mid_minor',
  'b.max_minor as band_max_minor',
  baseSalaryMinorSql.as('base_salary_minor_in_base_currency'),
  compaRatioSql.as('compa_ratio'),
  bandPositionSql.as('band_position'),
] as const;

interface EmployeeRow {
  id: number;
  employee_number: string;
  first_name: string;
  last_name: string;
  email: string;
  job_title: EmployeeSummary['jobTitle'];
  department: EmployeeSummary['department'];
  level: EmployeeSummary['level'];
  country_code: string;
  employment_type: EmployeeSummary['employmentType'];
  status: EmployeeSummary['status'];
  hire_date: string;
  country_name: string;
  base_salary_minor: number | null;
  currency_code: CurrencyCode | null;
  band_currency: CurrencyCode | null;
  band_min_minor: number | null;
  band_mid_minor: number | null;
  band_max_minor: number | null;
  base_salary_minor_in_base_currency: number | null;
  compa_ratio: number | null;
  band_position: string | null;
}

/** The one place a database row becomes the shape the API promises. */
function toEmployeeSummary(row: EmployeeRow): EmployeeSummary {
  return {
    id: row.id,
    employeeNumber: row.employee_number,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    jobTitle: row.job_title,
    department: row.department,
    level: row.level,
    countryCode: row.country_code,
    countryName: row.country_name,
    employmentType: row.employment_type,
    status: row.status,
    hireDate: row.hire_date,
    salary:
      row.base_salary_minor !== null && row.currency_code !== null
        ? money(row.base_salary_minor, row.currency_code)
        : null,
    salaryBase:
      row.base_salary_minor_in_base_currency !== null
        ? money(row.base_salary_minor_in_base_currency, BASE_CURRENCY)
        : null,
    compaRatio: row.compa_ratio,
    bandPosition: (row.band_position as EmployeeSummary['bandPosition']) ?? null,
  };
}
