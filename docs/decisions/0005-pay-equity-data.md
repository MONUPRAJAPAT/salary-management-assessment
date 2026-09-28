# ADR-0005 — Storing gender to enable pay-equity analysis

**Status:** accepted · **Date:** 2026-09-28

## Context

"Do we have a gender pay gap in Sales?" is one of the highest-value questions an HR Manager asks, and
in several of ACME's jurisdictions (UK, EU Pay Transparency Directive) reporting on it is a legal
obligation. It cannot be answered without the attribute. Storing it is also a real privacy decision
that deserves to be made deliberately rather than by accident.

## Decision

Store an optional, self-reported `gender` on the employee, with values
`female | male | non_binary | undisclosed`, defaulting to `undisclosed`.

Constraints applied:

- **Aggregate-only surfacing.** The analytics endpoints expose gender _only_ as group aggregates.
- **Small-group suppression.** Any pay-gap group with fewer than **5** employees is returned as
  `suppressed: true` with no figures, so an individual's salary cannot be reverse-engineered from a
  group of one. Enforced in SQL, tested in `analytics.repository.test.ts`.
- The employee directory does not filter or sort by gender.

## Consequences

The product can answer the equity question and support statutory reporting. The suppression
threshold makes some small-team views deliberately blank — correct behaviour, and surfaced in the UI
as an explanation rather than an empty state.

A production system would go further: field-level access control, an access audit log, and a
retention policy. Those are noted as follow-on work rather than pretended at.
