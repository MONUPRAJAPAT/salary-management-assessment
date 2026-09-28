import type { Generated, Insertable, Selectable } from 'kysely';
import type {
  ChangeReason,
  CurrencyCode,
  Department,
  EmployeeStatus,
  EmploymentType,
  Gender,
  Level,
} from '@acme/shared';

/**
 * The database shape, in TypeScript. Kysely infers every query's result from this, so a
 * column renamed here is a compile error at every call site rather than a runtime
 * `undefined`. Column names stay snake_case — this type describes SQL, and pretending
 * otherwise only hides where the mapping happens.
 */
export interface Database {
  currencies: CurrenciesTable;
  countries: CountriesTable;
  fx_rates: FxRatesTable;
  employees: EmployeesTable;
  compensation_records: CompensationRecordsTable;
  salary_bands: SalaryBandsTable;
  current_compensation: CurrentCompensationView;
}

export interface CurrenciesTable {
  code: CurrencyCode;
  name: string;
  exponent: number;
  base_scale: number;
}

export interface CountriesTable {
  code: string;
  name: string;
  region: string;
  currency_code: CurrencyCode;
}

export interface FxRatesTable {
  currency_code: CurrencyCode;
  rate_to_base_micros: number;
  as_of: string;
}

export interface EmployeesTable {
  id: Generated<number>;
  employee_number: string;
  first_name: string;
  last_name: string;
  email: string;
  job_title: string;
  department: Department;
  level: Level;
  country_code: string;
  employment_type: EmploymentType;
  status: EmployeeStatus;
  gender: Gender;
  hire_date: string;
  manager_id: number | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface CompensationRecordsTable {
  id: Generated<number>;
  employee_id: number;
  effective_from: string;
  base_salary_minor: number;
  currency_code: CurrencyCode;
  change_reason: ChangeReason;
  note: string | null;
  recorded_at: Generated<string>;
}

export interface SalaryBandsTable {
  id: Generated<number>;
  country_code: string;
  level: Level;
  currency_code: CurrencyCode;
  min_minor: number;
  mid_minor: number;
  max_minor: number;
}

/** Read-only view. See ADR-0004 and `schema.ts`. */
export interface CurrentCompensationView {
  employee_id: number;
  compensation_record_id: number;
  effective_from: string;
  base_salary_minor: number;
  currency_code: CurrencyCode;
  change_reason: ChangeReason;
}

export type EmployeeRow = Selectable<EmployeesTable>;
export type NewEmployee = Insertable<EmployeesTable>;
export type CompensationRow = Selectable<CompensationRecordsTable>;
export type NewCompensationRecord = Insertable<CompensationRecordsTable>;
export type SalaryBandRow = Selectable<SalaryBandsTable>;
