# ACME Salary Management

Salary management for an organisation of **10,000 employees across 10 countries**, built for
one persona: the HR Manager who currently does this in spreadsheets.

Two jobs, weighted equally:

- **A system of record** — salary data that is correct, auditable, and safe to change.
- **An answer engine** — _"what do we pay a Senior Engineer in Germany versus India?"_,
  _"is anyone paid below band?"_, _"do we have a pay gap in Sales?"_ — answered in seconds.

---

## Running it

Requires **Node 20.11+** (developed on Node 24). No database server, no Docker needed.

```bash
npm install
npm run seed     # generates 10,000 employees and ~40,000 compensation records (~0.6s)
npm run dev      # API on :4000, UI on :5173
```

Open **http://localhost:5173**.

The seed is deterministic — a fixed PRNG and a pinned reference date — so the same command
produces the same organisation on every machine. `npm run seed -- --force` replaces an
existing database.

### Production build

```bash
npm run build    # builds the web bundle, then bundles the server
npm start        # one process serving the API and the UI on :4000
```

### The rest of the commands

| Command                                      |                                                             |
| -------------------------------------------- | ----------------------------------------------------------- |
| `npm test`                                   | all 240 tests, three packages, ~2.6s                        |
| `npm run test:watch`                         | watch mode                                                  |
| `npm run test:coverage`                      | coverage report                                             |
| `npm run verify`                             | format check, lint, typecheck and tests — what CI would run |
| `npm run benchmark --workspace @acme/server` | reproduces the numbers in `docs/performance.md`             |

---

## What it does

**Employee directory** — server-side search, six filters, seven sorts and pagination over
10,000 records. Filter state lives in the URL, so _"everyone in India below band, worst
compa-ratio first"_ is a link you can bookmark or send to someone. Any filtered view exports
to CSV.

**Employee profile** — current pay in local currency and in USD, position drawn to scale
inside the salary band, and the full compensation history including changes dated in the
future.

**Recording a pay change** — by percentage or by absolute amount, with an effective date and
a reason. The resulting salary and percentage are shown before you commit, and a change that
would push someone outside their band warns without blocking. Nothing is ever overwritten: a
correction is a new record.

**Insights** — payroll cost, median and percentiles by country / department / level /
gender, pay-equity reporting with small-group suppression, salary band health with an
actionable list of who is underpaid, salary distribution, and payroll over time.

Everything comparative is normalised to a single currency through a dated exchange-rate
table, because a median that mixes ₹1,800,000 with €85,000 is not a number.

---

## How it is built

```
packages/
  shared/   Zod contracts, money primitives, statistics, domain vocabularies
  server/   Express + SQLite (better-sqlite3) + Kysely
  web/      React + Mantine + TanStack Query
```

`@acme/shared` holds one Zod schema per request and response. The server validates with it;
the web client infers its types from it and parses responses back through it. A renamed
field is a compile error, not a runtime surprise.

Three modelling decisions carry the design:

1. **Money is an integer count of minor units**, always with its currency. No floating point
   anywhere near a salary. JPY's zero exponent is handled in the one place it belongs.
2. **Compensation is effective-dated and append-only.** `employees` has no salary column; an
   employee's pay on a date is the latest record effective on or before it.
3. **Every aggregate is computed by SQLite**, with currency normalised _before_ grouping.

### Performance

The requirements committed to p95 under 200 ms at this scale. Measured, over HTTP, against
the real seeded database:

|                                  |     p50 |     p95 |
| -------------------------------- | ------: | ------: |
| Directory page, 3 filters + sort |  2.6 ms |  2.9 ms |
| Employee profile + full history  |  0.6 ms |  1.1 ms |
| Analytics overview               | 52.8 ms | 53.3 ms |
| Payroll trend, 24 months         | 66.5 ms | 69.7 ms |

Getting there took three specific fixes, each found by profiling rather than by reading the
code — the largest was 56×. `docs/performance.md` has the before-and-after and the method.

### Tests

240 tests in about 2.6 seconds. No network, no clock dependence, no shared state — every
test builds its own in-memory database.

The integration fixture is **twelve hand-written employees** whose medians you can verify by
reading the table, with exchange rates chosen to be exact and memorable ($1 = ₹80 = ¥160).
When a test says _"the median Engineering salary is $100,000"_, that is checkable by eye —
the difference between a test that documents behaviour and one that merely detects change.

Two tests exist specifically to stop duplicated definitions drifting: one asserts the
percentile SQL and the TypeScript `percentile()` agree on the same data, another asserts the
two statements of "current compensation" select the same record for every employee.

---

## Documentation

|                                                                |                                                                                          |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [`docs/requirements.md`](docs/requirements.md)                 | The one-pager, written before any code — including what is deliberately left out         |
| [`docs/architecture.md`](docs/architecture.md)                 | Diagrams, layering rules, data model, request path                                       |
| [`docs/implementation-guide.md`](docs/implementation-guide.md) | Complete walkthrough of every part of the system and why it is built that way            |
| [`docs/decisions/`](docs/decisions/)                           | Six ADRs for the choices that shape everything downstream                                |
| [`docs/performance.md`](docs/performance.md)                   | Measurements, the three optimisations, and what was left alone                           |
| [`docs/trade-offs.md`](docs/trade-offs.md)                     | The decisions with real alternatives, and what each costs                                |
| [`CLAUDE.md`](CLAUDE.md)                                       | The standing instructions AI tools work under in this repository                         |
| [`docs/ai-collaboration.md`](docs/ai-collaboration.md)         | How AI was used — the instructions it worked under, and where its first answer was wrong |
| [`docs/deployment.md`](docs/deployment.md)                     | Running it as one container or one process                                               |

---

## Deliberately not built

Each of these was a decision, not an oversight. The reasoning is in
[`docs/requirements.md`](docs/requirements.md) §4 and [`docs/trade-offs.md`](docs/trade-offs.md).

- **Authentication and roles.** The brief names one persona. The API is layered so a
  middleware drops in at one seam. This is the first thing to build next.
- **Bulk CSV import.** The real migration path off Excel, and the worst thing to ship
  half-safe — it needs dry-run, row-level validation and a diff review before anything is
  written. Export exists; import is deferred on purpose.
- **Payroll execution, tax, benefits.** This records what we pay. It is not a system that
  pays, and that is a different compliance surface entirely.
- **Bonus, equity, commission.** Real compensation, but each multiplies the model and the
  analytics. Base salary is where the HR Manager's questions concentrate.
- **Live exchange rates.** Pinned and dated, so every figure is reproducible. A provider is
  one adapter behind an existing interface.
