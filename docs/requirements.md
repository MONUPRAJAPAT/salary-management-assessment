# Salary Management — Requirements (v1)

**Author:** Monu Prajapat · **Date:** 2026-09-28 · **Status:** agreed scope for v1
**Written before implementation began.** Everything below is the contract the code is held to.

---

## 1. Goal

Replace ACME's spreadsheet-based salary administration with a web application that lets the HR
Manager maintain accurate compensation data for **10,000 employees across multiple countries**, and
**answer questions about how the org pays people** without ever exporting to Excel.

Two jobs, weighted equally:

- **System of record** — the salary data must be correct, auditable, and safe to change.
- **Answer engine** — the HR Manager must get an answer in seconds, not in a pivot table.

## 2. User & the questions they actually ask

**Persona:** HR Manager at ACME. One person, trusted, not technical, lives in this tool daily.

| Job to be done | What the product must do |
|---|---|
| "What does Priya earn?" | Find one person in 10,000 in under a second |
| "Give her a 7% raise from 1 Jan, because promotion" | Record a change *with a reason and an effective date* — never overwrite |
| "What did she earn last year?" | Show full compensation history |
| "What do we pay a Senior Engineer in Germany vs India?" | Compare like-for-like across currencies |
| "Is anyone paid below their band?" | Flag every out-of-band employee |
| "Do we have a pay gap in Sales?" | Median pay by gender, sliced by department/level |
| "What is our annual payroll, and where does it go?" | Total cost, split by country / department / level |

Questions 4–7 are the reason this product exists. A CRUD app that cannot answer them has failed the
brief, so the analytics layer is a first-class feature, not a dashboard bolted on at the end.

## 3. Scope — v1 features

1. **Employee directory** — server-side search, filter (country, department, level, status,
   band position), sort and pagination over 10,000 records.
2. **Employee profile** — identity, role, manager, current compensation, full salary history.
3. **Compensation changes** — record a raise / market adjustment / promotion / correction with an
   **effective date** and a **reason**. Append-only: history is never mutated.
4. **Salary bands** — min/mid/max per level per country. Every employee gets a **compa-ratio** and a
   below / within / above band verdict.
5. **Insights** — payroll cost, headcount, median and p25/p75/p90 by any dimension, pay-gap view,
   band-health view, salary distribution.
6. **Multi-currency** — salaries stored in the employee's local currency; every comparison is
   normalised to a base currency (USD) through a dated FX table.
7. **CSV export** of any filtered view — the off-ramp *from* Excel, deliberately not a road back to it.

## 4. Explicitly out of scope — and why

| Left out | Reasoning |
|---|---|
| **Authentication, roles, permissions** | The brief names exactly one persona. Real auth (sessions, RBAC, SSO) is well-understood, high-effort, low-signal work that would crowd out the compensation modelling and analytics that this exercise is actually about. The API is layered so an auth middleware drops in at one seam. **This is the first thing I would build next.** |
| **Payroll execution, tax, statutory deductions, pensions, benefits** | This is a system of record for *what we pay*, not a system that *pays*. Payroll carries a country-by-country compliance surface that cannot be done credibly at this size, and doing it badly is worse than not doing it. |
| **Bonus, commission, equity** | Real compensation, but each multiplies the data model and the analytics. Base salary is where the HR Manager's questions concentrate. The compensation record is typed so these become new component rows, not a rewrite. |
| **Bulk CSV import** | The genuine migration path off Excel, and the most tempting thing to ship. Doing it *safely* needs dry-run, row-level validation, duplicate detection and a diff-review UI. Deferred deliberately rather than shipped half-safe, because a silent bad import corrupts the system of record. |
| **Approval workflows / future-dated org changes** | One trusted user needs no approval chain. Adding one implies notifications, state machines and a second persona. |
| **Live FX rates** | Rates live in a dated table seeded with realistic values. A provider is one adapter behind an existing interface. Pinned rates also make analytics **reproducible**, which matters more here than being current. |
| **Org-chart visualisation, headcount planning, offer letters, performance reviews** | Adjacent products. Each would dilute the two jobs above. |

## 5. Non-functional requirements

- **Correctness of money.** All amounts are integer **minor units** (cents/paise). No floating-point
  arithmetic on money, anywhere.
- **Auditability.** Compensation history is append-only. A correction is a new row, not an edit.
- **Performance.** Directory and analytics queries return in **< 200 ms** at 10,000 employees and
  ~25,000 compensation records. Pagination and aggregation happen in SQL, never in JavaScript.
- **Tests.** Unit and integration tests are deterministic and complete in seconds. No network, no
  clock dependence, no random ordering.
- **Reproducibility.** The 10,000-employee seed is generated from a fixed PRNG seed — the same
  database every time, so numbers in the demo and in tests are stable.
- **Deployability.** One build command, one process, one artifact.

## 6. Acceptance criteria

- [ ] `npm run seed` produces exactly 10,000 employees across ≥ 8 countries with realistic
      compensation history.
- [ ] The directory lists, searches, filters, sorts and paginates 10,000 employees without a
      perceptible delay.
- [ ] A raise recorded today is visible on the profile, in history, and in org-wide medians.
- [ ] Median salary by country is shown in a single comparable currency.
- [ ] Every below-band employee can be listed in one click.
- [ ] `npm test` is green, fast, and covers money, statistics, band logic, the API and the UI.

## 7. Deliberate risks accepted

- **SQLite, not Postgres.** 10,000 employees is a small dataset; SQLite handles it comfortably and
  keeps the project to a single artifact. The data access layer is plain SQL behind repositories, so
  the migration is mechanical. See `docs/decisions/0002-sqlite-and-query-builder.md`.
- **Gender is stored** to make pay-equity analysis possible — it is optional, self-reported, includes
  an "undisclosed" value, and is only ever surfaced in aggregate. See
  `docs/decisions/0005-pay-equity-data.md`.
