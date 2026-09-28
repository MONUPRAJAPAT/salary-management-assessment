# Implementation guide

A complete walkthrough of what is built, how it works, and **why each decision was made**.
The reasoning matters more than the inventory — anyone can list files, but the questions
worth answering are "why that and not the obvious alternative?".

Read `docs/requirements.md` for scope, `docs/decisions/` for the formal ADRs, and this for
the joined-up picture.

---

## 0. The product in one paragraph

An HR Manager at a 10,000-person company across 10 countries currently keeps salary data in
spreadsheets. This replaces that with a web app doing two jobs of equal weight: a **system
of record** (correct, auditable, safe to change) and an **answer engine** ("what do we pay a
Senior Engineer in Germany vs India?", "is anyone below band?", "do we have a pay gap?").
Everything else follows from taking both jobs seriously.

---

## 1. Stack, and why each piece

| Layer        | Choice                               | Why this, not the obvious alternative                                                                                                                                                                                                                                                |
| ------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Language     | TypeScript 5.9, strict               | `noUncheckedIndexedAccess` on — array access returns `T \| undefined`, which is true and catches real bugs                                                                                                                                                                           |
| Runtime      | Node 24 (floor 20.11)                | Role is Node/React/TypeScript                                                                                                                                                                                                                                                        |
| HTTP         | Express 5                            | Boring and universally readable. v5 auto-forwards rejected promises, so no `asyncHandler` wrapper noise                                                                                                                                                                              |
| Database     | SQLite 3.53 via better-sqlite3 12    | Synchronous, in-process: no pool, no `await` in repositories, 10k rows seed in 526 ms. Window functions make the percentile queries possible at all                                                                                                                                  |
| Query layer  | **Kysely 0.27 — not an ORM**         | This product's value _is_ the SQL: medians, pay gaps, band comparison, running payroll totals. An ORM expresses all of those through an escape hatch, so it would cost ceremony and buy nothing exactly where it matters. Kysely gives full type inference while leaving SQL visible |
| Validation   | Zod 3                                | Shared by both sides — see §2                                                                                                                                                                                                                                                        |
| UI           | React 18 + Mantine 7                 | Dense admin UI: tables, filters, date pickers, modals **and charts** from one design system. Mantine 7 (not 8) for maturity, which pins React at 18                                                                                                                                  |
| Server state | TanStack Query 5                     | Cache invalidation is the real feature: a raise invalidates the dashboard, so you never see a stale median                                                                                                                                                                           |
| Routing      | React Router 6                       | Filter state lives in the URL                                                                                                                                                                                                                                                        |
| Build        | Vite 6 (web), tsup (server)          | 3 s web build; esbuild server bundle                                                                                                                                                                                                                                                 |
| Tests        | Vitest 3, Testing Library, supertest | One command runs all three packages                                                                                                                                                                                                                                                  |

**Two deliberate non-choices.** No ORM (above). No decimal library — money is integer minor
units, exact by construction, needs no dependency, and makes currency-mixing _throw_ rather
than silently produce a wrong number.

---

## 2. The monorepo, and the single most important structural decision

```
packages/
  shared/   Zod contracts, money, statistics, vocabularies   (1,106 lines)
  server/   Express + SQLite + Kysely                        (5,283 lines)
  web/      React + Mantine + TanStack Query                 (4,108 lines)
```

npm workspaces. `@acme/shared` is consumed as **TypeScript source**, not a compiled
artifact — Vite, tsx and Vitest all transpile it directly, so there is no `build:shared`
step to forget. The production server bundles it via tsup's `noExternal`.

### Why the shared package exists

**Every request and response shape is one Zod schema, declared once.** The server validates
with it; the web client infers its TypeScript types from it _and_ parses responses back
through it.

```ts
// packages/shared/src/contracts/employee.ts
export const employeeSummarySchema = z.object({/* ... */});
export type EmployeeSummary = z.infer<typeof employeeSummarySchema>;
```

Rename a field on the server and the UI fails to compile. Without this you hand-write a
matching interface on the client and it silently drifts within a week.

The same package also holds the domain vocabularies (`DEPARTMENTS`, `LEVELS`, `GENDERS`,
`CHANGE_REASONS`) — and **the database schema is generated from them**, so the SQL `CHECK`
constraints cannot disagree with the TypeScript about what a valid department is. That is
in `packages/server/src/db/schema.ts`:

```ts
const checkIn = (column, values) =>
  `CHECK (${column} IN (${values.map((v) => `'${v}'`).join(', ')}))`;
```

> **Interview point.** Defence in depth normally means duplication, and duplication drifts.
> Generating one from the other gives you the constraint without the drift.

---

## 3. Money — the decision that touches everything

`packages/shared/src/money.ts` (162 lines, 20 tests)

This is a payroll system. `0.1 + 0.2 !== 0.3` is not a curiosity here; it is a wrong number
on someone's salary.

```ts
interface Money {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
}
// ₹85,000.00 -> { amountMinor: 8_500_000, currency: 'INR' }
// ¥8,500,000 -> { amountMinor: 8_500_000, currency: 'JPY' }   // exponent 0!
```

### Five rules, each enforced in code

1. **Integer minor units, always with the currency.** Never a float, never a formatted
   string.
2. **Mixed-currency arithmetic throws** (`CurrencyMismatchError`) rather than coercing. This
   is the error more likely to reach production than a rounding error, and a decimal library
   would not catch it.
3. **JPY has exponent 0.** `currencyExponent()` is consulted everywhere; `/ 100` is never
   hardcoded. A dedicated fixture employee (Mio, paid ¥16,000,000) exists so that dropping
   this makes a test fail by a factor of 100.
4. **Rounding is half-away-from-zero**, applied once at the end.
5. **Conversion is one exact BigInt rational with a single rounding:**

```ts
target = amountMinor × (rateFrom / rateTo) × 10^(targetExponent − sourceExponent)
```

Routing EUR→INR through USD would round twice. Evaluating it as one rational over BigInt
means no intermediate overflows or rounds. A test asserts exactness where the intermediate
product exceeds `Number.MAX_SAFE_INTEGER`.

Formatting happens only at the edge (`Intl.NumberFormat`) and is never stored or
transported.

---

## 4. Statistics — the percentile definition

`packages/shared/src/statistics.ts` (93 lines, 14 tests)

**Nearest-rank percentile:** the smallest value at or above the p-th position.

```ts
const index = clamp(Math.ceil(p * sorted.length) - 1, 0, sorted.length - 1);
```

**Why nearest-rank, not interpolated?** It always returns a salary _someone is actually
paid_. An interpolated median is a figure that belongs to nobody, which is the wrong answer
for a compensation benchmark.

**Empty sets return `null`, not `0`.** "No data" is not "paid nothing" — and a zero would
silently drag an average down.

> **A real bug caught on paper.** The first ADR wrote the SQL as
> `MAX(value WHERE cume_dist <= p)`. That is off by one position for odd-sized groups: with
> five salaries it returns the second, not the third. The correct form is
> `MIN(value WHERE cume_dist >= p)`. Caught by working n=4 and n=5 through by hand before
> writing the query. There is a commit fixing the ADR _before_ the code existed.

---

## 5. The database

### Tables

| Table                  |   Rows | Purpose                                                |
| ---------------------- | -----: | ------------------------------------------------------ |
| `employees`            | 10,000 | Identity, role, country, manager. **No salary column** |
| `compensation_records` | 40,574 | Append-only salary history                             |
| `salary_bands`         |    100 | min/mid/max per level per country (10 × 10)            |
| `countries`            |     10 | code, name, region, currency                           |
| `currencies`           |     10 | code, name, `exponent`, `base_scale`                   |
| `fx_rates`             |     10 | `rate_to_base_micros`, `as_of`                         |

All tables are `STRICT` (SQLite type enforcement) and `PRAGMA foreign_keys = ON` is set on
every connection — **SQLite leaves foreign keys off by default**, which is a decades-old
compatibility default rather than a recommendation. Without it the schema's references are
documentation, not constraints.

### The three modelling decisions

**(a) Compensation is effective-dated and append-only** — ADR-0004

`employees` has no `salary` column and must never gain one. An employee's pay on a date is
the latest `compensation_records` row with `effective_from <= date`.

| employee_id | effective_from | base_salary_minor | currency | change_reason |
| ----------- | -------------- | ----------------- | -------- | ------------- |
| 42          | 2023-04-01     | 12000000          | INR      | `hire`        |
| 42          | 2024-04-01     | 13200000          | INR      | `merit`       |
| 42          | 2025-07-01     | 16500000          | INR      | `promotion`   |

Rows are never updated or deleted. A mistake is corrected by **appending** a `correction`
row.

_Why:_ the naive `employees.salary` loses the organisation's memory — a raise overwrites the
previous number and "what did she earn before the promotion?" is gone. This is exactly why
spreadsheets fail HR teams. Consequences: full audit trail for free, future-dated raises
work without a scheduler, and "payroll over time" becomes a query rather than a feature.

_Cost:_ every read of "current salary" is a top-1-per-group query. That became the system's
single biggest performance problem — see §9.

> **A constraint removed by a test.** `UNIQUE (employee_id, effective_from)` looked obviously
> right and made a **same-day correction impossible**, contradicting the append-only model.
> Dropped; two rows on one date are resolved by the view's `id DESC` tie-break. Duplicate
> detection is a service-layer concern, not a database-level impossibility.

**(b) Money as integers, all the way into SQL**

`currencies.base_scale` is precomputed as `10^(baseExponent − currencyExponent)` — 100 for
JPY, 1 for the rest. That lets currency normalisation stay **integer-only inside SQL**:

```sql
((cc.base_salary_minor * fx.rate_to_base_micros * cur.base_scale) + 500000) / 1000000
```

`+ 500000` before integer division rounds half up instead of truncating. Using SQLite's
`REAL` would have been simpler and would have put floating point back into the one place
ADR-0003 exists to keep it out of.

**(c) Normalise currency _before_ aggregating** — ADR-0006

A median mixing ₹1,800,000 and €85,000 is not a number, it is a category error. Every
aggregate joins `fx_rates` and groups on the base-currency amount. Every analytics response
carries `fxAsOf`, because a converted figure without its conversion date is not reproducible.

### Indexes

| Index                                                                          | Why                                                                          |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `idx_comp_employee_effective` on `(employee_id, effective_from DESC, id DESC)` | **The important one.** Makes "latest record for this employee" an index seek |
| `idx_comp_effective`                                                           | Date-range scans for the trend                                               |
| `idx_employees_country / department / level / status / manager`                | Each is a directory filter                                                   |
| `idx_employees_name` on `(last_name, first_name)`                              | Default sort order                                                           |

`ANALYZE` is run after seeding — without statistics SQLite guesses at index selectivity,
and guesses badly on multi-filter queries.

### The `current_compensation` view

The rule is stated **twice, deliberately**:

- **Declaratively**, as a view using `ROW_NUMBER() OVER (PARTITION BY employee_id ORDER BY effective_from DESC, id DESC)` — the readable statement.
- **Operationally**, as a correlated `LIMIT 1` lookup, because the view was 10–50× slower (§9).

Two statements of one rule can drift, so `current-compensation.test.ts` asserts they select
**the same record for every employee** in the fixture. Same technique as the SQL-vs-TypeScript
percentile test.

---

## 6. The seed

`packages/server/src/seed/` — generates 10,000 employees + 40,574 records in **526 ms**.

### Deterministic by construction

A seeded mulberry32 PRNG (`random.ts`) and a **pinned reference date** (`SEED_AS_OF =
'2026-09-28'`). `Math.random()` would make every number in the docs, the demo and the
benchmarks a moving target. Same command, same organisation, every machine.

### Written in one transaction

Prepared statements reused across rows, inside `sqlite.transaction()`. Without an explicit
transaction SQLite commits — and fsyncs — **once per INSERT**. That is the difference between
0.5 seconds and several minutes.

Employees are inserted with `manager_id` NULL, then a second pass fills them: a manager can
appear later in the array than their report, and SQLite checks foreign keys immediately, so
one pass would fail on forward references.

### The distributions are chosen so the analytics have something to find

|               |                                                                                       |
| ------------- | ------------------------------------------------------------------------------------- |
| Countries     | IN 2600, US 2400, PL 900, GB 800, DE 800, BR 700, CA 550, AU 450, SG 450, JP 350      |
| Levels        | A pyramid: IC3 25%, IC2 22%, IC4 16%… M4 0.5%                                         |
| Salary        | Compa-ratio ~ Normal(0.995 + tenure bump, 0.105), clamped                             |
| Band outliers | ~2% below, ~1.6% above — **emerges naturally** from that spread, not hardcoded        |
| History       | Built **backwards** from each employee's target current salary, then replayed forward |

**Why backwards?** Generating forward from a random start would produce a current-salary
distribution nobody chose. Instead the raise chain is decided first (April review cycle,
82% chance per cycle, 14% promotion / 8% market / rest merit), the starting salary is derived
by dividing the target back through it, then replayed forward.

Names come from per-locale pools so an employee in Osaka is not called "Bob Smith" —
reviewers have to believe the data.

### The modelled pay gap, stated openly

Women are modelled as under-represented at senior levels, with a small (−2.2%) within-level
compa offset. **This is synthetic data reproducing a documented real-world pattern so the
pay-equity feature can be evaluated at all** — a gap-detection feature demonstrated on data
with no gap proves nothing. It is labelled as such in the source.

The result is genuinely instructive: **the org-wide gap is 6.55%, while within-level gaps are
near zero.** The headline gap is almost entirely a _composition_ effect. That distinction is
what real pay-gap reporting exists to surface.

> **Two bugs the tests caught, not inspection.** The org chart had VPs in a **reporting
> cycle**, and **nobody at the top**. Found by a test that walks every chain looking for a
> repeat. At 10,000 rows that is invisible to the eye. Fix: department heads report to a
> single chief executive, and 1% M4 was too many for 10,000 people anyway.

---

## 7. Backend architecture

### Layering, and the rule that never bends

```
http/routes  →  services  →  repositories  →  SQLite
                    ↓             ↓
                 domain/ (pure functions)
```

| Layer          | May contain                               | Never contains             |
| -------------- | ----------------------------------------- | -------------------------- |
| `http/routes`  | Parsing, status codes, error mapping      | SQL, arithmetic            |
| `services`     | Use-cases, invariants, transactions       | SQL                        |
| `repositories` | **Every SQL statement in the codebase**   | HTTP concepts              |
| `domain`       | Pure functions: money, bands, percentages | Anything about HTTP or SQL |

The arrow never reverses. That is why `domain/` is trivial to test and why the interesting
rules are the easiest code in the repo to read.

### The endpoints

| Method | Path                                       | Notes                                                                             |
| ------ | ------------------------------------------ | --------------------------------------------------------------------------------- |
| GET    | `/api/health`                              | Container healthcheck                                                             |
| GET    | `/api/reference`                           | Countries, departments, levels, FX. One call on boot, `staleTime: Infinity`       |
| GET    | `/api/employees`                           | Search, 7 filters, 7 sorts, pagination                                            |
| GET    | `/api/employees/export`                    | CSV of the filtered set. **Registered before `/:id`** or "export" parses as an id |
| GET    | `/api/employees/:id`                       | Profile + full history                                                            |
| POST   | `/api/employees`                           | Creates employee **and** hire record in one transaction                           |
| PATCH  | `/api/employees/:id`                       | Everything except pay                                                             |
| GET    | `/api/employees/:id/compensation`          | History alone                                                                     |
| POST   | `/api/employees/:id/compensation`          | Record a change                                                                   |
| GET    | `/api/analytics/overview`                  | Headcount, payroll, percentiles, band counts                                      |
| GET    | `/api/analytics/breakdown?dimension=`      | country / department / level / gender                                             |
| GET    | `/api/analytics/pay-gap?groupBy=`          | department / level / country                                                      |
| GET    | `/api/analytics/band-health`               | Counts + the actionable underpaid list                                            |
| GET    | `/api/analytics/distribution?bucketCount=` | Histogram                                                                         |
| GET    | `/api/analytics/payroll-trend?months=`     | Monthly cost                                                                      |

### The invariants that make it a system of record

1. **Currency is derived from the employee's country, never accepted from the client.**
   Paying a German employee in rupees is not a request the API can be asked to serve by
   mistake. (Tested: sending `currency: "USD"` on a Japan hire is ignored; they get JPY.)
2. **A percentage raise applies to the salary in force on the _effective date_, not today's.**
   Those differ whenever a change is backdated, and using the wrong one silently pays the
   wrong amount.
3. **Creating an employee writes their first compensation record in the same transaction.**
   An employee with no salary is a hole in the record, so the API cannot create one — and a
   rolled-back salary takes the employee with it.
4. **No API path overwrites a salary.** `PATCH` covers everything except pay.
5. **Reporting cycles are rejected** — the service walks up from the proposed manager.
6. **Identical resubmission is a 409**, but a same-day _correction_ with a different amount is
   allowed.

### Error handling

`ApplicationError` subclasses (`NotFoundError` 404, `ValidationError` 400, `ConflictError` 409) carry their own status and a user-facing message. Anything else is a bug: logged in
full, returned as a bare 500 — an unexpected exception's message is as likely to contain a
SQL fragment as anything useful.

---

## 8. The analytics engine

`analytics.repository.ts` — 509 lines, the heart of the product. Three rules, each tested.

**(1) SQLite does the aggregating.** The Node process receives one row per group, never the
underlying employees. A dashboard tile does not fetch 10,000 rows to count them.

**(2) Currency normalised before grouping** (§5c).

**(3) Percentiles via `CUME_DIST()`, nearest-rank:**

```sql
SELECT group_key,
       COUNT(*) AS headcount,
       MIN(CASE WHEN percentile >= 0.50 THEN base_minor END) AS median,
       MIN(CASE WHEN percentile >= 0.25 THEN base_minor END) AS p25
FROM (SELECT ..., CUME_DIST() OVER (PARTITION BY key ORDER BY base_minor) AS percentile FROM base)
GROUP BY group_key;
```

A test asserts this agrees with the TypeScript `percentile()` on the same data.

### Pay-gap suppression happens _inside the query_

```sql
CASE WHEN COUNT(*) >= 5
     THEN MIN(CASE WHEN percentile >= 0.50 THEN base_minor END)
     END AS median_minor
```

For a group below the threshold the median is **never computed**, so it never leaves the
database. Filtering in JavaScript would mean the figure had already been read and was one
forgotten `.map()` from being served.

The UI shows suppressed groups as **explicitly withheld** rather than dropping them — "we
are not telling you" and "there is nobody here" are different answers.

### Band health compares in local currency

Esha earns ₹4,000,000 against an Indian IC3 band of ₹5,120,000–₹8,000,000. Comparing her
converted $50,000 against a _rupee_ band would report every Indian employee as wildly
underpaid. Tested.

### Payroll trend — a running total of deltas

The naive version joined 24 months against 40,574 intervals: ~1M comparisons, 333 ms.

Rewritten: each compensation record contributes **its amount minus the employee's previous
amount**, and payroll in any month is the cumulative sum of every delta up to it. `LAG()`
gets the previous amount; a recursive CTE generates the month series; a window `SUM() OVER
(ORDER BY month)` does the running total. One pass over history — **66 ms**.

**The sum telescopes**, so the final month must equal the sum of everyone's current salary.
A test asserts exactly that against the overview endpoint — the optimisation carries its own
correctness check.

---

## 9. Performance — measured, not assumed

Every number comes from `npm run benchmark --workspace @acme/server`, which is committed.

| Endpoint                    |   Before |   After |      |
| --------------------------- | -------: | ------: | ---: |
| Directory, first page       |  77.1 ms |  6.8 ms |  11× |
| Directory, 3 filters + sort |  74.4 ms |  2.6 ms |  29× |
| Employee profile            |  33.6 ms |  0.6 ms |  56× |
| Analytics overview          | 459.6 ms | 52.8 ms | 8.7× |
| Band health                 | 210.4 ms | 54.0 ms | 3.9× |
| Payroll trend               | 508.7 ms | 66.5 ms | 7.6× |

The requirements committed to **p95 < 200 ms**. Slowest endpoint is now 70 ms.

### Three causes, found by profiling — not by reading the code

**(1) A view that ranked everything to answer anything.** `current_compensation` used
`ROW_NUMBER()` over all 40,574 records before returning a single row. Showing 25 names cost
the same as aggregating the whole company, and filtering to one country saved _nothing_.

|                           |    View | Correlated `LIMIT 1` |
| ------------------------- | ------: | -------------------: |
| Whole org (10,000)        | 33.1 ms |           **5.5 ms** |
| Filtered to India (2,600) | 32.7 ms |           **1.5 ms** |
| One page (25)             | 32.8 ms |            **~0 ms** |

The correlated form is an index seek **per matching employee**, so it gets cheaper as the
query narrows — which is what a directory does all day.

This required the date to become a **parameter** rather than `DATE('now')` inside SQL. A
performance change that turned out to be a feature: "what did she earn in 2021?" is now a
first-class query, and tested.

**(2) A CTE evaluated once per reference.** The overview reads seven figures from the same
base set; SQLite inlined and re-evaluated it seven times.

|                       |             |
| --------------------- | ----------: |
| One reference         |     40.9 ms |
| Seven references      |    358.6 ms |
| Seven, `MATERIALIZED` | **46.9 ms** |

One keyword — applied _only_ where the CTE is genuinely scanned more than once, since
forcing materialisation on a single-use CTE blocks filter pushdown.

**(3) The nested-loop trend** — see §8.

### Two SQLite behaviours that caused real bugs

**Bound numeric parameters arrive as REAL.** `(x - ?) / ?` is floating-point division; the
identical expression with literals does integer division. This produced fractional histogram
bucket keys and **silently dropped nine of eleven employees from the chart**. Fixed with an
explicit `CAST(... AS INTEGER)`. Caught by a test asserting buckets sum to headcount.

**Foreign keys are off by default** — see §5.

### Deliberately left alone

- **Search is `LIKE '%term%'`** over 10,000 rows, ~3 ms, cannot use an index. FTS5 would add a
  second copy of the data, a sync trigger and a tokenisation decision — machinery bought for
  a problem this dataset does not have. First thing to revisit at 100k.
- **`AVG()` returns REAL.** Money stays integer wherever stored, summed or compared; the mean
  is rounded to an integer at the query edge. A mean is a derived statistic, not an amount
  anyone is paid.

---

## 10. Frontend

### Structure

```
api/        client.ts (fetch + Zod), queries.ts (TanStack hooks)
components/ StatCard, BandPositionBadge, QueryState, TableSkeleton, ThemeToggle
features/
  directory/  DirectoryPage, EmployeeTable, useDirectoryFilters
  employee/   EmployeePage, CompensationHistory, BandPositionBar,
              RecordChangeModal, EditEmployeeModal, NewEmployeeModal
  insights/   InsightsPage, BreakdownPanel, PayGapPanel, BandHealthPanel,
              DistributionPanel, TrendPanel, useInsightFilters
lib/        format.ts, chart.ts, theme.ts
```

### The API client validates responses

```ts
const result = schema.safeParse(payload);
if (!result.success) throw new ApiError(status, 'contract_mismatch', ...);
```

It costs a fraction of a millisecond on a 25-row page. **Both sides parse the same schema
object**, so it is not a second definition — it is one definition enforced twice. A drifted
contract fails at the network boundary with a readable message instead of three components
deep as `undefined is not an object`.

### Filter state lives in the URL

`useDirectoryFilters` reads and writes `URLSearchParams`.

_Why:_ "everyone in India below band, worst compa-ratio first" becomes a link you can
bookmark or send to a colleague, and the back button behaves. For a tool someone lives in
daily, this is a product feature wearing an implementation detail's clothing.

Detail: any change **other than paging resets to page 1** — otherwise narrowing a filter on
page 12 lands on an empty table.

### Cache invalidation is the interesting part

A compensation change invalidates `employees`, `overview`, `breakdown`, `pay-gap`,
`band-health`, `distribution`, `payroll-trend` **and** that employee.

_Why:_ a raise changes the org's median, its payroll and possibly its band health.
Refreshing only the profile leaves the dashboard quietly stale — which in a salary tool
means showing a number that is no longer true.

`placeholderData: (previous) => previous` keeps the previous page on screen while the next
loads, so typing in search does not flash an empty table.

### The three screens

**Insights** — one filter row drives every panel, so narrowing to "Engineering, in Europe"
re-answers every question about that same population rather than leaving half the screen
describing the whole company.

**Directory** — server-side everything. The browser receives 11 KB and renders 25 rows.
Sticky table header; skeleton rows on first load.

**Profile** — current pay in both currencies, position drawn _to scale_ inside the band
(`BandPositionBar`), and the full append-only history **including future-dated changes,
labelled `Scheduled`** rather than hidden.

### Recording a change

Percentage **or** absolute, because HR managers think in both. Either way the **resulting
salary and percentage are shown before committing** — a raise is not a thing to find out the
size of afterwards. A change pushing someone outside their band **warns without blocking**:
sometimes paying above band is right, and a tool that refuses is a tool people work around.

### Charts — deliberate, not default

Following the data-viz method:

- The two-series palette was run through a **colour-vision validator** against Mantine's
  actual light _and_ dark surfaces before adoption.
- **No dual-axis charts.** Payroll and headcount are small multiples sharing an x-axis —
  two y-scales invite the reader to see a relationship the axis ranges invented.
- **Status colours are fixed**, never reused as series colours, and always carry an icon and
  a word. Colour never holds meaning alone.
- **Every chart has a table beside it** — the accessible reading, and the one that answers
  "by how much".
- **Band health is deliberately not a chart.** The useful output is a list of names to act on,
  not "97% in band".

### Theming

Ten-step brand scale with `primaryShade` stepping **up** in dark mode — a mid-blue reads
washed out on a dark surface, and reusing one swatch is what makes dark themes look muddy.
An inline script in `index.html` applies the stored scheme **before React boots**, so the
page does not flash light then snap to dark.

---

## 11. Testing — 240 tests, 22 files, ~2.6 s

| Area                             | Tests |
| -------------------------------- | ----: |
| API, end to end with supertest   |    45 |
| Analytics repository             |    30 |
| Web pages and components         |    29 |
| Employee repository              |    23 |
| Money                            |    20 |
| Seed generator                   |    18 |
| Statistics                       |    14 |
| Theme, formatting, API client    |    19 |
| Schema and constraints           |     8 |
| URL filter state                 |     8 |
| Salary bands                     |     7 |
| CSV writing                      |     6 |
| Seed-on-boot guards              |     5 |
| Current-compensation drift guard |     5 |
| Search flow                      |     3 |

### The fixture is the point

`testing/fixture.ts` — **twelve hand-written employees** whose medians you can verify by
reading the table, with rates chosen to be exact and memorable: **$1 = ₹80 = ¥160**.

When a test says "the median Engineering salary is $100,000", you can check it in your head.
That is the difference between a test that **documents behaviour** and one that merely
**detects change**.

Japan is in the fixture _specifically_ because JPY has a zero exponent — drop `base_scale`
from the normalisation SQL and Mio's salary reads 100× wrong.

### Two tests exist purely to stop duplication drifting

1. SQL percentiles vs TypeScript `percentile()` on the same data.
2. The `current_compensation` view vs the correlated join — same record, every employee.

### Properties, not just examples

The org-chart test walks every reporting chain looking for a repeat. It found a real cycle.

### Determinism

No network, no clock dependence, no shared state — every test builds its own `:memory:`
database, so they are safe to run in parallel by construction.

---

## 12. Delivery

**One process.** In production the Node server serves the API _and_ the built React bundle
from the same origin: no CORS config, no second service, no reverse proxy.

**Docker.** Three stages (deps / build / runtime). Runtime carries production dependencies
and compiled output only — no dev deps, no TypeScript source, no compiler. 391 MB, healthy,
runs as unprivileged `node`.

Three defects were found here, and **the third only by actually building it:**

1. The seed needed `tsx`, absent under `--omit=dev`. Fixed by compiling the seed to
   `dist/seed.js` as a second tsup entry.
2. `/data` was unwritable under `USER node` — `VOLUME` was declared for a directory that did
   not exist in the image, so Docker created it owned by root.
3. **`npm ci --omit=dev` at a workspace root installs every workspace's production
   dependencies.** The runtime image carried 143 MB of `@tabler/icons-react` — a React icon
   library, in an image whose only job is to serve those same components as pre-built static
   files. Scoping to the server workspace: `node_modules` 250 MB → 29 MB, image 637 → 391 MB.

**Not Vercel.** Its filesystem is read-only except `/tmp` and functions are ephemeral.
SQLite is a _file_. Render/Fly/Railway with a persistent disk is the right shape; `render.yaml`
includes the 1 GB disk mounted at `/var/data`.

**CI** runs the same `npm run verify` you run locally, plus the build, plus seeding the full
10,000 and running the benchmark — the only check that the _real_ seed still works, since
unit tests use the 12-person fixture.

---

## 13. What was deliberately left out

| Left out                             | Why                                                                                                                                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Auth / RBAC**                      | Brief names one persona. Real auth is well-understood, high-effort, low-signal work that would have crowded out the compensation modelling. API is layered so a middleware drops in at one seam. **First thing to build next** |
| **Bulk CSV import**                  | The genuine migration path off Excel, and the worst thing to ship half-safe: needs dry-run, row validation, dedupe and a diff-review screen. A silent bad import corrupts the system of record. Export exists                  |
| **Payroll execution, tax, benefits** | This records _what we pay_; it is not a system that _pays_. Different compliance surface entirely                                                                                                                              |
| **Bonus / equity / commission**      | Each multiplies the model and the analytics. Base salary is where the questions concentrate                                                                                                                                    |
| **Live FX**                          | Pinned and dated, so every figure is reproducible. A provider is one adapter behind an existing interface                                                                                                                      |
| **Termination dates**                | Their absence is why the payroll trend is labelled "cost of the current roster over time" rather than historical payroll — stated in the UI, not hidden                                                                        |

---

## 14. Questions this design invites

**"Why SQLite for 10,000 employees?"**
It is a small dataset and one HR Manager is one writer. It keeps the whole thing to a single
artifact with no service to run. SQLite serialises writes, so a second concurrent writer
would eventually feel it — but all SQL is confined to `repositories/`, making Postgres a
dialect change plus a review of ~6 window-function queries, not a rewrite.

**"Why not an ORM?"**
The product's value is the SQL. An ORM would express percentiles, grouped medians and
running totals through a raw escape hatch anyway, so the abstraction costs ceremony and buys
nothing exactly where it matters.

**"How do you handle multi-currency?"**
Salaries are stored in the employee's own currency; every comparison normalises to USD via a
**dated** FX table, in integer arithmetic, **before** grouping. Every response carries
`fxAsOf`.

**"How do you know the analytics are right?"**
A twelve-person fixture with exact rates where every median is verifiable by eye, plus a test
asserting the SQL and TypeScript percentile implementations agree on the same data.

**"What would you do at 100,000 employees?"**
Nothing to the data model. In order: Postgres (for concurrent writers, not speed); replace
`LIKE` search with trigram/FTS; cache the unfiltered analytics with invalidation on write;
only then consider a materialised current-salary table — and only with a _scheduled_ refresh,
because "current" depends on the passage of time, which no write trigger sees.

**"What's the weakest part?"**
No authentication. After that, the payroll trend's lack of termination dates, which is
labelled in the UI rather than hidden.

**"Where did AI get it wrong?"**
Eight documented cases in `docs/ai-collaboration.md`. The instructive ones are the two where
the code was **correct and still wrong**: a view that was 10–50× slower than it needed to be,
and an ADR quoting a performance figure that had been invented rather than measured.
Correctness review passes both. Only a profiler and a benchmark catch them.
