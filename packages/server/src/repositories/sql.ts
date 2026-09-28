import { sql, type SqlBool } from 'kysely';
import { LEVELS, LEVEL_METADATA } from '@acme/shared';

/**
 * SQL fragments shared across repositories.
 *
 * These are the two pieces of SQL that would otherwise be copied into every analytics
 * query and drift. Both are built from our own constants, never from request data.
 */

/**
 * Converts a local salary to base-currency minor units using integer arithmetic only.
 *
 *   base_minor = salary_minor × rate_micros × base_scale ÷ 1,000,000
 *
 * `base_scale` carries the minor-unit exponent difference (100 for JPY, 1 for the rest),
 * and `+ 500000` before the integer division rounds half up instead of truncating.
 * Salaries are positive, so truncation toward zero is always downward here — the extra
 * half is what stops a $99,999.995 conversion reading as $99,999.99.
 *
 * Using SQLite's REAL type instead would be simpler and wrong: it would put floating
 * point back into the one place ADR-0003 exists to keep it out of.
 */
/*
 * An employee's pay on a date is the latest compensation record effective on or before
 * it. The two fragments below are that rule.
 *
 * They replaced a view built on ROW_NUMBER() OVER (PARTITION BY employee_id ...), which
 * was correct but had to rank all 40,574 records before answering any question — 33 ms
 * even to show 25 names, and the same 33 ms when filtered to one country. As a correlated
 * lookup it is an index seek per matching employee instead: 5.5 ms for the whole
 * organisation, 1.5 ms filtered to India, and effectively free for one page.
 *
 * The view still exists in the schema as the readable statement of the rule, and a test
 * asserts the two agree on every employee in the fixture, so they cannot drift.
 */

/**
 * The join condition that resolves current compensation for the employee aliased 'e',
 * against a compensation_records alias 'cc'. See the note above.
 */
export const currentCompensationOn = (asOf: string) => sql<SqlBool>`
  cc.id = (
    SELECT r.id FROM compensation_records r
    WHERE r.employee_id = e.id AND r.effective_from <= ${asOf}
    ORDER BY r.effective_from DESC, r.id DESC
    LIMIT 1
  )
`;

/**
 * The same rule as a raw join clause, for the analytics queries that are not built with
 * Kysely. `left` keeps employees who have no compensation record at all — they are a
 * data problem the HR Manager needs to see, not rows to drop silently.
 */
export const currentCompensationJoinSql = (asOf: string, { left = false } = {}) => sql`
  ${left ? sql.raw('LEFT JOIN') : sql.raw('JOIN')} compensation_records cc ON cc.id = (
    SELECT r.id FROM compensation_records r
    WHERE r.employee_id = e.id AND r.effective_from <= ${asOf}
    ORDER BY r.effective_from DESC, r.id DESC
    LIMIT 1
  )
`;

export const baseSalaryMinorSql = sql<number>`
  ((cc.base_salary_minor * fx.rate_to_base_micros * cur.base_scale) + 500000) / 1000000
`;

/**
 * Orders levels by seniority rather than alphabetically, which would sort M1 above IC6.
 * Generated from LEVEL_METADATA so a new level cannot be added without an ordering.
 */
export const levelSortOrderSql = sql.raw(
  `CASE e.level ${LEVELS.map(
    (level) => `WHEN '${level}' THEN ${LEVEL_METADATA[level].sortOrder}`,
  ).join(' ')} ELSE 0 END`,
);

/** Compa-ratio as a sortable expression. REAL is fine here: it is a ratio, not money. */
export const compaRatioSql = sql<number | null>`
  CASE WHEN b.mid_minor > 0
       THEN CAST(cc.base_salary_minor AS REAL) / b.mid_minor
       ELSE NULL END
`;

export const bandPositionSql = sql<string | null>`
  CASE
    WHEN b.id IS NULL OR cc.base_salary_minor IS NULL THEN NULL
    WHEN cc.base_salary_minor < b.min_minor THEN 'below'
    WHEN cc.base_salary_minor > b.max_minor THEN 'above'
    ELSE 'within'
  END
`;
