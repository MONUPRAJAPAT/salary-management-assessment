# ADR-0006 — Aggregate in SQL, normalise currency before aggregating

**Status:** accepted · **Date:** 2026-09-28

## Context
The answer engine needs medians, percentiles, totals and gaps, sliced by country, department, level
and gender, over 10,000 employees paid in 9 currencies. Two temptations: compute in JavaScript after
fetching rows, and compare raw local amounts.

Both are wrong. Fetching 10,000 rows per dashboard tile is wasteful, and a "median salary" that
averages ₹1,800,000 with €85,000 is not a number — it is a category error.

## Decision
1. **Every aggregate is computed by SQLite.** The Node process receives one row per group, never the
   underlying employees.
2. **Currency is normalised before aggregation**, not after. Each query joins `fx_rates` and computes
   a USD-normalised minor amount inline; grouping, ordering and percentiles all operate on that
   column. Normalising *after* grouping would compute a median of incomparable numbers.
3. **Percentiles use window functions** rather than `AVG`-based approximations:

```sql
SELECT dimension,
       COUNT(*) AS headcount,
       MIN(CASE WHEN pct >= 0.50 THEN usd_minor END) AS median_usd_minor,
       MIN(CASE WHEN pct >= 0.25 THEN usd_minor END) AS p25_usd_minor
FROM (SELECT dimension, usd_minor,
             CUME_DIST() OVER (PARTITION BY dimension ORDER BY usd_minor) AS pct
      FROM base)
GROUP BY dimension;
```

4. **The median definition is explicit and tested.** `MIN(value WHERE cume_dist >= p)` is the
   *nearest-rank* percentile: the smallest value at or above the p-th position. For an even-sized
   group it returns the lower of the two middle values, which is the standard convention in
   compensation benchmarking (it is always an actual salary someone is paid, not an interpolated
   figure that belongs to nobody).

   The `MAX(value WHERE cume_dist <= p)` formulation is the easy mistake here and is wrong for
   odd-sized groups: with five salaries it returns the second, not the third. The equivalent pure function lives in `shared/src/statistics.ts` and
   the integration tests assert that SQL and JavaScript agree on the same fixture — so the SQL is
   verified against a definition a human can read.

## Consequences
Dashboard tiles are single-digit milliseconds. The FX snapshot date is part of the response
(`fxAsOf`), because an aggregate without its conversion date is not reproducible. Rates are pinned
rather than live, which makes every number in the demo and the test suite stable.
