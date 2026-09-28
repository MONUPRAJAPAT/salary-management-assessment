# Performance

Everything here was measured, on the real seeded database, with
`npm run benchmark --workspace @acme/server`. That script is committed, so these numbers
can be reproduced rather than taken on trust.

**Dataset:** 10,000 employees · 40,574 compensation records · 100 salary bands · 8.6 MB SQLite
**Machine:** Apple Silicon, macOS, Node 24, SQLite 3.53
**Method:** 5 warm-up requests, then 50 iterations per endpoint, over HTTP through Express.

---

## 1. Where it ended up

| Endpoint                            |     p50 |     p95 | Payload |
| ----------------------------------- | ------: | ------: | ------: |
| Directory, first page               |  6.8 ms |  8.6 ms |   11 KB |
| Directory, page 200                 | 11.4 ms | 11.8 ms |   12 KB |
| Directory, search                   |  5.7 ms |  6.0 ms |   11 KB |
| Directory, 3 filters + salary sort  |  2.6 ms |  2.9 ms |   12 KB |
| Directory, everyone below band      |  8.6 ms |  9.0 ms |   12 KB |
| Employee profile + full history     |  0.6 ms |  1.1 ms |    2 KB |
| Reference data                      |  0.3 ms |  0.4 ms |    1 KB |
| Analytics: overview                 | 52.8 ms | 53.3 ms |   <1 KB |
| Analytics: median by country        | 22.6 ms | 25.3 ms |    5 KB |
| Analytics: median by level          | 22.5 ms | 23.0 ms |    5 KB |
| Analytics: pay gap                  | 45.5 ms | 48.7 ms |    7 KB |
| Analytics: band health              | 54.0 ms | 54.7 ms |   19 KB |
| Analytics: distribution             | 22.2 ms | 22.6 ms |    1 KB |
| Analytics: payroll trend, 24 months | 66.5 ms | 69.7 ms |    2 KB |
| CSV export, whole organisation      | 62.3 ms | 65.3 ms |  1.7 MB |

The requirements document committed to **p95 under 200 ms**. The slowest endpoint is the
24-month payroll trend at 70 ms.

## 2. Where it started

The first working version missed that target on four endpoints. Profiling — not reading the
code and guessing — found three separate causes.

| Endpoint                    |   Before |   After |      |
| --------------------------- | -------: | ------: | ---: |
| Directory, first page       |  77.1 ms |  6.8 ms |  11× |
| Directory, 3 filters + sort |  74.4 ms |  2.6 ms |  29× |
| Employee profile            |  33.6 ms |  0.6 ms |  56× |
| Analytics: overview         | 459.6 ms | 52.8 ms | 8.7× |
| Analytics: band health      | 210.4 ms | 54.0 ms | 3.9× |
| Analytics: payroll trend    | 508.7 ms | 66.5 ms | 7.6× |

### Cause 1 — a view that ranked everything to answer anything

`current_compensation` resolved "latest record effective on or before today" with
`ROW_NUMBER() OVER (PARTITION BY employee_id ...)`. Correct, and the wrong shape: it ranked
all 40,574 records before returning a single row, so showing 25 names cost as much as
aggregating the whole company, and filtering to one country saved nothing at all.

Measured head to head:

|                                 | View (`ROW_NUMBER`) | Correlated `LIMIT 1` |
| ------------------------------- | ------------------: | -------------------: |
| Whole organisation, 10,000 rows |             33.1 ms |           **5.5 ms** |
| Filtered to India, 2,600 rows   |             32.7 ms |           **1.5 ms** |
| One directory page, 25 rows     |             32.8 ms |            **~0 ms** |

The correlated form is an index seek per _matching_ employee against
`idx_comp_employee_effective`, so it gets cheaper as the query narrows — which is what the
directory does all day. The view is kept in the schema as the readable statement of the
rule, and `current-compensation.test.ts` asserts the two select the same record for every
employee, so they cannot drift apart.

This also required the date to become a parameter instead of `DATE('now')` inside SQL.
That was a performance change that turned out to be a feature: _"what did she earn in
2021?"_ is now a first-class query.

### Cause 2 — a CTE evaluated once per reference

The overview reads seven figures from the same base set. SQLite inlined the CTE and
re-evaluated it seven times:

|                                                     |             |
| --------------------------------------------------- | ----------: |
| `WITH base AS (...)`, one reference                 |     40.9 ms |
| `WITH base AS (...)`, seven references              |    358.6 ms |
| `WITH base AS MATERIALIZED (...)`, seven references | **46.9 ms** |

One keyword. The hint is applied only where the CTE is genuinely scanned more than once;
forcing materialisation on a single-use CTE would block SQLite from pushing filters into it.

### Cause 3 — a nested loop where a running total would do

The payroll trend joined 24 months against 40,574 salary intervals — roughly a million
comparisons, and `MATERIALIZED` made no difference because the cost was the join itself.

Rewritten as a **running total of deltas**: each compensation record contributes its amount
minus the employee's previous amount, and payroll in any month is the cumulative sum of
every delta up to it. One pass over the history instead of a nested loop, 333 ms → 66 ms.

The sum telescopes, so the final month must equal the sum of everyone's current salary —
which is exactly what a test asserts against the overview endpoint. The optimisation carries
its own correctness check.

## 3. Things that were measured and deliberately left alone

- **Search is `LIKE '%term%'` over 10,000 rows**, which cannot use an index. It costs about
  3 ms. FTS5 would be faster in principle and would add a second copy of the data, a trigger
  to keep it in sync, and a tokenisation decision — machinery bought for a problem this
  dataset does not have. At 100,000 employees this is the first thing to revisit.
- **`AVG()` returns a REAL.** Money stays integer everywhere it is stored, summed or
  compared; the mean is rounded to an integer minor amount at the edge of the query. A mean
  is a derived statistic, not an amount anyone is paid.
- **CSV export streams the whole organisation in one response** — 1.7 MB in 62 ms. Chunked
  streaming would lower peak memory, but 1.7 MB is not a memory problem, and a single
  response means the browser either gets a complete file or an error, never a truncated one.

## 4. Two non-obvious SQLite behaviours worth recording

**Bound numeric parameters arrive as REAL.** `(x - ?) / ?` is floating-point division;
the identical expression written with literals is integer division. This silently produced
fractional bucket keys in the salary histogram and dropped nine of eleven employees from the
chart. The fix is an explicit `CAST(... AS INTEGER)` — stating the intent rather than relying
on how a value happened to be bound. Caught by a test asserting the buckets sum to the
headcount.

**Foreign keys are off by default.** `PRAGMA foreign_keys = ON` is set on every connection.
Without it the schema's references are documentation, not constraints.

## 5. Front end

|                   |    Raw | Gzipped |
| ----------------- | -----: | ------: |
| Application code  | 158 KB |   42 KB |
| Mantine           | 481 KB |  150 KB |
| Charts (Recharts) | 406 KB |  112 KB |
| React + Router    |  21 KB |    8 KB |
| CSS               | 218 KB |   32 KB |

Vendor code is split into three chunks so that an application deploy does not invalidate
Mantine and Recharts in everyone's browser cache. Route-level code splitting would drop the
charting library from the directory's initial load — worth doing if the dashboard stopped
being the landing page, and premature while it is.

The directory never holds more than one page of employees in memory. Filtering, sorting,
pagination and every aggregate happen in SQLite; the browser receives 11 KB and renders 25
rows.

## 6. How this would change at 100,000 employees

Nothing in the data model. The order of work would be:

1. Move to Postgres — not for speed, but because SQLite serialises writes and a second HR
   user would start to feel it. The repository boundary makes this a dialect change plus a
   review of about six window-function queries.
2. Replace `LIKE` search with a real index (Postgres trigram or full-text).
3. Cache the analytics for the unfiltered case, invalidated on any compensation write.
4. Only then consider a materialised current-salary table — and only with a scheduled
   refresh, because "current" depends on the passage of time, which no write trigger sees.
