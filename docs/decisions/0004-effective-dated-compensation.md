# ADR-0004 — Compensation is effective-dated and append-only

**Status:** accepted · **Date:** 2026-09-28

## Context
The naive model is `employees.salary`. It is also the model that loses the organisation's memory: a
raise overwrites the previous number and the answer to "what did we pay her before the promotion?"
is gone. Spreadsheets fail HR teams for exactly this reason — the history lives in a tab called
`salaries_FINAL_v3_USE_THIS`.

## Decision
`employees` has **no salary column**. Compensation lives in `compensation_records`:

| employee_id | effective_from | base_salary_minor | currency | change_reason |
|---|---|---|---|---|
| 42 | 2023-04-01 | 12000000 | INR | `hire` |
| 42 | 2024-04-01 | 13200000 | INR | `merit` |
| 42 | 2025-07-01 | 16500000 | INR | `promotion` |

An employee's salary *on a date* is the latest record with `effective_from <= date`. Rows are never
updated or deleted. A mistake is corrected by appending a `correction` row.

## Consequences
**Good.** Full audit trail for free. "Payroll cost over time" and "who got a raise this year"
become queries rather than features. Future-dated raises work naturally — record it now, it takes
effect on its date. Corrections are visible rather than silent.

**Cost.** Every read of "current salary" is a top-1-per-group query. Solved once with the
`current_compensation` view over `ROW_NUMBER() OVER (PARTITION BY employee_id ...)`, backed by
`idx_comp_employee_effective`. Measured at ~11 ms for all 10,000 employees — see
`docs/performance.md`.

**Invariant enforced in the service layer.** A compensation record must be in the employee's own
country currency. Changing an employee's country is therefore a separate, explicit operation.
