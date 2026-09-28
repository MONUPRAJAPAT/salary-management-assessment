import { sql } from 'kysely';
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
