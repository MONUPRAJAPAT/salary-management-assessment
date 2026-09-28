# ADR-0002 — SQLite via better-sqlite3, with Kysely instead of an ORM

**Status:** accepted · **Date:** 2026-09-28

## Context

10,000 employees, ~25,000 compensation rows, one writer. The brief suggests SQLite. The real
decision is **how much abstraction sits between the code and the SQL**, because the product's core
value — medians, percentiles, pay gaps, band health — is expressed most clearly _as_ SQL.

## Decision

**better-sqlite3** for the driver and **Kysely** as a typed query builder. No ORM.

## Rationale

- better-sqlite3 is synchronous and in-process: no connection pool, no await noise in repositories,
  and a 10,000-row seed inside one transaction takes well under a second.
- SQLite 3.53 (shipped with the driver) has window functions, which is what makes the
  `current_compensation` view and the percentile queries possible at all.
- Kysely gives full type inference over the schema while leaving the SQL _visible_. An ORM would
  express `PERCENTILE via ROW_NUMBER() OVER (PARTITION BY ...)` as an escape hatch anyway — so the
  abstraction would buy nothing on exactly the queries that matter most.
- Kysely's `sql` template tag is used where a hand-written statement is clearer, and those statements
  are covered by integration tests rather than trusted.

## Consequences

**Accepted limits.** SQLite serialises writes — fine for one HR Manager, wrong for a multi-tenant
SaaS. No native `PERCENTILE_CONT`, so percentiles are computed with window functions (tested in
`analytics.repository.test.ts`). No decimal type, which is a non-issue because money is stored as
integers (ADR-0003).

**Migration path.** All SQL is confined to `repositories/`. Moving to Postgres means changing the
Kysely dialect and reviewing ~6 window-function queries — not rewriting the application.
