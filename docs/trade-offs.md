# Trade-offs

The decisions with real alternatives, and what each one costs. Structural choices have
their own records in `docs/decisions/`; this is the shorter list of things a reviewer is
likely to want justified.

---

### Effective-dated compensation instead of `employees.salary`

**Cost:** every read of "current salary" becomes a top-1-per-group query, which turned out
to be the system's single biggest performance consideration (`docs/performance.md`).

**Why anyway:** the naive column loses the organisation's memory. A raise overwrites the
previous number and "what did we pay her before the promotion?" is simply gone. Spreadsheets
fail HR teams for exactly this reason. Keeping history makes corrections visible rather than
silent, makes future-dated raises work without a scheduler, and turns payroll-over-time into
a query rather than a feature.

### Money as integer minor units rather than a decimal library

**Cost:** more verbose on the wire (`{ amountMinor, currency }` rather than a number), and
every display site must call a formatter.

**Why anyway:** this is payroll. Integers are exact by construction and need no dependency.
The verbosity is the point — it is impossible to accidentally add a salary to a formatted
string, and impossible to add rupees to euros because the arithmetic throws. A decimal
library would solve the precision problem and not the currency-mixing one, which is the
error more likely to reach production.

### SQLite rather than Postgres

**Cost:** writes serialise, so a second concurrent HR user would eventually feel it. No
`PERCENTILE_CONT`, so percentiles are hand-written with window functions.

**Why anyway:** 10,000 employees is a small dataset and one HR Manager is one writer. It
keeps the whole thing to a single artifact with no service to run. All SQL is confined to
`repositories/`, so the migration is a dialect change and a review of about six queries
rather than an application rewrite.

### Kysely rather than an ORM

**Cost:** more SQL to write by hand; no migration framework in the box.

**Why anyway:** this product's value *is* the SQL — percentiles, grouped medians, band
comparison, a running payroll total. An ORM would express every one of those through an
escape hatch, so the abstraction would cost type-safety-shaped ceremony and buy nothing on
exactly the queries that matter. Kysely keeps full inference over the schema while leaving
the SQL visible and reviewable.

### Validating API responses on the client as well as the server

**Cost:** a fraction of a millisecond per response, and a second place the contract is
checked.

**Why anyway:** both sides parse the *same* schema object, so it is not a second definition —
it is the same definition enforced twice. A contract that has drifted fails at the network
boundary with a readable message instead of three components deep as `undefined is not an
object`.

### Filter state in the URL rather than in component state

**Cost:** more machinery than `useState`, and every filter has to survive a round trip
through a string.

**Why anyway:** "everyone in India below band, worst compa-ratio first" becomes a link the
HR Manager can bookmark, send to a colleague, or return to after a refresh. The back button
behaves the way people expect. For a tool someone lives in daily, this is a product feature
wearing an implementation detail's clothing.

### Storing gender

**Cost:** a real privacy obligation, and a field that has to be handled carefully forever.

**Why anyway:** "do we have a pay gap in Sales?" cannot be answered without it, and in
several of ACME's jurisdictions reporting on it is a legal requirement. Mitigated by
aggregate-only exposure, suppression of any group under five people enforced *inside the
SQL*, and no ability to filter or sort the directory by it. See ADR-0005.

### A deliberately modelled pay gap in the seed data

**Cost:** it has to be explained, or it looks like a claim about the real world.

**Why anyway:** a pay-equity feature demonstrated on data with no gap in it cannot be
evaluated at all. The seed models a documented real-world pattern — under-representation at
senior levels plus a small within-level difference — and says so in the source. The result
is instructive: the organisation-wide gap is 6.6%, while within-level gaps are close to
zero, which is exactly the composition effect real pay-gap reporting exists to surface.

### A pinned FX snapshot rather than a live rate feed

**Cost:** the numbers are not today's rates.

**Why anyway:** an aggregate computed from rates that move is not reproducible — the same
query gives a different median tomorrow for reasons that have nothing to do with pay. Every
response carries its `fxAsOf` date. A live provider is one adapter behind an existing
interface, and the right time to add it is when someone asks for today's number rather than
a stable one.

### No authentication

**Cost:** it is not deployable to the real internet as it stands.

**Why anyway:** the brief names exactly one persona. Real auth — sessions, RBAC, SSO,
password reset — is well-understood, high-effort, low-signal work that would have consumed
the budget that went into compensation modelling and the analytics layer. The API is layered
so a middleware drops in at one seam, and this is the first thing listed under "what next".

### No bulk CSV import

**Cost:** it is the genuine migration path off Excel, and it is missing.

**Why anyway:** it was the most tempting thing to ship and the worst thing to ship badly. A
safe importer needs dry-run, row-level validation, duplicate detection and a diff-review
screen before anything is written, because a silent bad import corrupts the system of record
in a way that is very hard to unpick. Export exists; import is deferred on purpose rather
than delivered half-safe.

### Two statements of "current compensation"

**Cost:** the same rule is expressed twice — as a view and as a correlated join — and two
statements of one rule can drift.

**Why anyway:** the view is the readable, declarative statement of the rule and is what a
reader should look at first; the join is what performs. Rather than accept the drift risk,
a test asserts the two select the same record for every employee in the fixture. This is the
same technique used to hold the percentile SQL to the TypeScript `percentile()` function.
