# Instructions for AI tools working in this repository

This file is read automatically by Claude Code, and is written to be useful to any coding
agent. It is the standing brief: the rules below were decided before the code existed and
are what the code is held to. Nothing here is a style preference — each rule exists
because breaking it produced, or would produce, a wrong number in a payroll system.

Read `docs/requirements.md` first. It defines the scope, and more importantly what is
deliberately out of it.

---

## Non-negotiable domain rules

**Money is an integer count of minor units, always carried with its currency.**
Never a float, never a formatted string, never a bare number. Use `Money` from
`@acme/shared`. Arithmetic on two different currencies must throw, not coerce. JPY has a
zero minor-unit exponent — never hardcode `/ 100`. See ADR-0003.

**Compensation is append-only and effective-dated.**
`employees` has no salary column and must never gain one. An employee's pay on a date is
the latest `compensation_records` row effective on or before that date. Never UPDATE or
DELETE a compensation record: a mistake is corrected by appending a `correction` row.
There must be no API path that changes pay without an effective date and a reason.
See ADR-0004.

**Normalise currency before aggregating, never after.**
A median that mixes ₹ and € is a category error, not a rounding question. Every aggregate
joins `fx_rates` and groups on the base-currency amount. Every response carries `fxAsOf` —
a converted figure without its conversion date is not reproducible. See ADR-0006.

**Pay-equity suppression happens in SQL.**
Groups below `MIN_GROUP_SIZE_FOR_DISCLOSURE` must never have their median computed at all.
Filtering it out in JavaScript means the figure was already read and is one forgotten
`.map()` from being served. Gender is aggregate-only and is never a directory filter.
See ADR-0005.

## Structure

```
packages/shared/   Zod contracts, money, statistics, vocabularies — imported by both sides
packages/server/   http/routes -> services -> repositories -> db;  domain/ is pure
packages/web/      api/ -> features/ -> components/
```

- **All SQL lives in `packages/server/src/repositories/`.** No query in a route, a service
  or a component.
- **Routes are thin**: parse with the shared schema, call a service, map errors. No
  arithmetic, no SQL.
- **Services hold invariants**; `domain/` holds pure functions and knows nothing about
  HTTP or SQL.
- **Every request and response shape is a Zod schema in `@acme/shared`.** The server
  validates with it and the client infers from it. Never hand-write a matching type on
  one side.
- Aggregation, filtering, sorting and pagination happen in SQLite. Never fetch rows to
  count or sort them in JavaScript.

## Tests

- `npm run verify` must pass: format, lint, typecheck, tests.
- Integration tests use `createFixture()` — twelve hand-written employees whose medians are
  verifiable by reading the table. **Add to it rather than replacing it**, and keep the
  figures round. If a test's expected value cannot be checked by eye, it documents nothing.
- Deterministic: no network, no `Date.now()` in assertions, no shared state. Each test
  builds its own in-memory database.
- When a definition is stated twice, add a test that holds the two together. There are two
  such tests already — SQL percentiles against `percentile()`, and the
  `current_compensation` view against the correlated join. Follow that pattern rather than
  accepting drift.
- A test that passes is not the same as a test that proves something. Two tests in this
  repo passed for the wrong reason before being fixed.

## Performance

- Never state a performance figure you have not measured. `npm run benchmark --workspace
  @acme/server` is the source of every number in `docs/performance.md`. An ADR in this
  repo once quoted an invented figure that was 3x wrong.
- Bound numeric parameters arrive in SQLite as REAL, so `(x - ?) / ?` is floating-point
  division. Cast explicitly when integer division is intended.
- `MATERIALIZED` on a CTE referenced more than once; leave it off for single-use CTEs.

## Commits

- Incremental and self-contained. The message explains **why**, not what the diff shows.
- Corrections get their own commit and say plainly what was wrong.
- Trailer: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

## Scope

Do not add authentication, bulk CSV import, payroll processing, bonus/equity, or live FX
rates. Each was considered and excluded with reasoning in `docs/requirements.md` §4 and
`docs/trade-offs.md`. If one becomes genuinely necessary, update the requirements document
in the same commit rather than quietly widening the scope.
