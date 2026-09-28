import {
  BASE_CURRENCY,
  CHANGE_REASONS,
  CURRENCIES,
  CURRENCY_CODES,
  DEPARTMENTS,
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  GENDERS,
  LEVELS,
  currencyExponent,
} from '@acme/shared';

/**
 * The schema is generated from the vocabularies in @acme/shared rather than repeating
 * them. The CHECK constraints are real defence in depth — they hold against the seed
 * script, a migration and a human with a sqlite3 prompt, not just against the API — but
 * they would be a liability if they could drift from the application's idea of a valid
 * department. Generating them means they cannot.
 */
const checkIn = (column: string, values: readonly string[]): string =>
  `CHECK (${column} IN (${values.map((value) => `'${value}'`).join(', ')}))`;

/**
 * Minor units of the base currency per minor unit of this currency, before applying the
 * exchange rate. JPY has exponent 0 and USD has 2, so one yen-minor-unit maps to 100
 * dollar-minor-units of scale. Precomputed so the normalisation SQL stays integer-only.
 */
export const baseScaleFor = (code: keyof typeof CURRENCIES): number =>
  10 ** (currencyExponent(BASE_CURRENCY) - currencyExponent(code));

export const SCHEMA_SQL = `
CREATE TABLE currencies (
  code            TEXT PRIMARY KEY,
  name            TEXT    NOT NULL,
  exponent        INTEGER NOT NULL CHECK (exponent >= 0 AND exponent <= 4),
  base_scale      INTEGER NOT NULL CHECK (base_scale > 0),
  ${checkIn('code', CURRENCY_CODES)}
) STRICT;

CREATE TABLE countries (
  code            TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  region          TEXT NOT NULL,
  currency_code   TEXT NOT NULL REFERENCES currencies(code),
  CHECK (length(code) = 2)
) STRICT;

-- A pinned snapshot, not a live feed: every analytic is reproducible because the rate
-- that produced it is recorded alongside it. See ADR-0006.
CREATE TABLE fx_rates (
  currency_code       TEXT PRIMARY KEY REFERENCES currencies(code),
  -- Millionths of one ${BASE_CURRENCY} per unit. 1_000_000 = parity. Integer, so the
  -- rate table itself never introduces floating-point drift.
  rate_to_base_micros INTEGER NOT NULL CHECK (rate_to_base_micros > 0),
  as_of               TEXT    NOT NULL
) STRICT;

CREATE TABLE employees (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_number TEXT    NOT NULL UNIQUE,
  first_name      TEXT    NOT NULL,
  last_name       TEXT    NOT NULL,
  email           TEXT    NOT NULL UNIQUE,
  job_title       TEXT    NOT NULL,
  department      TEXT    NOT NULL,
  level           TEXT    NOT NULL,
  country_code    TEXT    NOT NULL REFERENCES countries(code),
  employment_type TEXT    NOT NULL,
  status          TEXT    NOT NULL DEFAULT 'active',
  gender          TEXT    NOT NULL DEFAULT 'undisclosed',
  hire_date       TEXT    NOT NULL,
  manager_id      INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  ${checkIn('department', DEPARTMENTS)},
  ${checkIn('level', LEVELS)},
  ${checkIn('employment_type', EMPLOYMENT_TYPES)},
  ${checkIn('status', EMPLOYEE_STATUSES)},
  ${checkIn('gender', GENDERS)},
  CHECK (manager_id IS NULL OR manager_id <> id)
) STRICT;

-- Append-only compensation history. There is no salary column on employees: an
-- employee's pay on a date is the latest record effective on or before it. See ADR-0004.
CREATE TABLE compensation_records (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id       INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  effective_from    TEXT    NOT NULL,
  base_salary_minor INTEGER NOT NULL CHECK (base_salary_minor > 0),
  currency_code     TEXT    NOT NULL REFERENCES currencies(code),
  change_reason     TEXT    NOT NULL,
  note              TEXT,
  recorded_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  ${checkIn('change_reason', CHANGE_REASONS)}
) STRICT;
-- Deliberately NOT unique on (employee_id, effective_from). A correction recorded the
-- same day as the change it fixes is a real and necessary event, and forbidding it
-- would force a wrong effective date onto the record. Two rows on one date are resolved
-- by the view's id DESC tie-break: the most recently recorded row wins. Accidental
-- duplicates are a service-layer warning, not a database-level impossibility.

CREATE TABLE salary_bands (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  country_code  TEXT    NOT NULL REFERENCES countries(code),
  level         TEXT    NOT NULL,
  currency_code TEXT    NOT NULL REFERENCES currencies(code),
  min_minor     INTEGER NOT NULL CHECK (min_minor > 0),
  mid_minor     INTEGER NOT NULL,
  max_minor     INTEGER NOT NULL,
  ${checkIn('level', LEVELS)},
  UNIQUE (country_code, level),
  CHECK (min_minor <= mid_minor AND mid_minor <= max_minor)
) STRICT;

-- Directory filters. Each one is a column the HR Manager can narrow the 10,000 by.
CREATE INDEX idx_employees_country      ON employees(country_code);
CREATE INDEX idx_employees_department   ON employees(department);
CREATE INDEX idx_employees_level        ON employees(level);
CREATE INDEX idx_employees_status       ON employees(status);
CREATE INDEX idx_employees_manager      ON employees(manager_id);
CREATE INDEX idx_employees_name         ON employees(last_name, first_name);

-- The index that makes the current_compensation view cheap: the window function walks
-- each employee's records already ordered, so it never sorts.
CREATE INDEX idx_comp_employee_effective
  ON compensation_records(employee_id, effective_from DESC, id DESC);
CREATE INDEX idx_comp_effective ON compensation_records(effective_from);

-- One definition of "current salary" for the whole system. Every read path goes
-- through it, so the directory, the profile and the analytics can never disagree.
CREATE VIEW current_compensation AS
SELECT
  employee_id,
  id AS compensation_record_id,
  effective_from,
  base_salary_minor,
  currency_code,
  change_reason
FROM (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY employee_id
      ORDER BY effective_from DESC, id DESC
    ) AS row_number_desc
  FROM compensation_records
  WHERE effective_from <= DATE('now')
)
WHERE row_number_desc = 1;
`;
