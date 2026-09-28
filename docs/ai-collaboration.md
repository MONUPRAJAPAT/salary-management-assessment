# Working with AI on this build

The brief asks for intentional use of AI tools while maintaining correctness and quality.
This is an account of how that actually went, including the parts where the first answer
was wrong.

**Tool:** Claude Code (agentic — reads, writes and runs the repository directly).

---

## 1. The working method

The order of work was deliberate, and it is visible in the commit history:

1. **Requirements first, in prose.** The one-page requirements document is the first
   commit, before any code. Writing down what was *out* of scope and why did more to shape
   the build than anything else — it is the reason there is no half-finished CSV importer
   or approval workflow in here.
2. **Decisions before implementation.** Six ADRs, committed second. Money as integer minor
   units, append-only compensation, aggregate-in-SQL — each of these constrains hundreds of
   later lines. Deciding them on paper, where they are cheap to change, meant the
   implementation had something to be held to rather than something to invent.
3. **Tests as the specification for anything subtle.** `test(red)` for money and statistics
   is a real red commit: the tests were written and committed before the implementations
   existed.
4. **Measure before optimising, and after.** No performance claim in this repository was
   written before it was measured. One that was is described below.

## 2. Where AI's first answer was wrong, and what caught it

This is the useful part. In every case below the mistake was caught by something
mechanical — a test, a constraint, a profiler — rather than by re-reading the code.

| What went wrong | What caught it | Commit |
|---|---|---|
| The generated org chart had VPs in a reporting cycle and nobody at the top. Plausible-looking code, structurally broken. | A test that walks every reporting chain looking for a repeat. It would never have shown up by inspection at 10,000 rows. | `feat(server): seed script` |
| `MAX(value WHERE cume_dist <= p)` looks like a percentile and is off by one position for odd-sized groups — five salaries returns the second, not the third. | Working the definition through on paper with n=4 and n=5 before writing the SQL. | `docs: correct the percentile SQL in ADR-0006` |
| The test fixture's `INSERT` had `gender` and `status` swapped — fourteen positional columns in a row. | A `CHECK` constraint in the schema. Rewritten with named parameters rather than reordered, because the positional form is the bug. | `feat(server): employee repository` |
| A bound numeric parameter reaches SQLite as REAL, so `(x - ?) / ?` did floating-point division and produced fractional histogram buckets — silently dropping nine of eleven employees from the chart. | A test asserting the buckets sum to the headcount. | `feat(server): analytics engine` |
| A CSV test asserted a field was quoted. It passed — but the field contained no comma, so it proved nothing. | Reading the failure output properly instead of just making it green. Replaced with a field that genuinely contains a comma, plus unit tests for the escaper. | `feat(server): HTTP API` |
| `UNIQUE (employee_id, effective_from)` seemed obviously right, and made a same-day correction impossible — contradicting the append-only model in ADR-0004. | Writing the tie-break test and noticing it could only pass by cheating. | `feat(server): database schema` |
| ADR-0004 claimed the current-salary query took "~11 ms". Written before measuring. The real figure was 33 ms, which is why that design was later replaced. | Running the benchmark. The number was invented, plausible, and wrong. | `docs: correct architecture and ADR-0004` |
| The `current_compensation` view was correct and 10–50× slower than it needed to be. No amount of reading the code would have shown this. | Profiling with `EXPLAIN QUERY PLAN` and a head-to-head timing harness. | `perf(server): 8-56x faster reads` |

**The pattern.** AI is fluent, and fluent code reads as correct. Every one of these was
caught by something that does not care how the code reads: a constraint that rejects bad
data, a test that walks the structure, a profiler that times the real thing. The practice
that mattered was not reviewing harder — it was arranging for mistakes to be *caught
mechanically*, then actually reading what the mechanism said.

The last two are worth separating out. Both were places where the code was **correct** and
still wrong — one slow, one carrying a fabricated number. Correctness review would have
passed both.

## 3. Where AI was genuinely quick

- **Breadth of test cases.** Boundary conditions — a salary exactly at band minimum, an
  even-sized group's median, JPY's zero exponent, an employee with no compensation record —
  are the ones that get skipped under time pressure and are exactly where the bugs live.
- **Consistency at volume.** 10 currencies, 10 countries, 11 departments, 10 levels, 100
  bands, 15 endpoints. Keeping the enums, the CHECK constraints, the Zod schemas and the UI
  labels in agreement is tedious and error-prone; generating the schema DDL from the shared
  enums removed the class of error entirely.
- **Realistic seed data.** Salary distributions with a genuine shape — a pyramid of levels,
  a plausible band spread, ~2% below band emerging naturally rather than being hardcoded.
  Data with a shape is what makes a dashboard demonstrable.
- **Plumbing.** CSV escaping, pagination arithmetic, query-string parsing, loading and
  error states. Necessary, uninteresting, easy to get subtly wrong by hand.

## 4. Where it needed to be directed

- **Scope.** The strong default is to build more. The requirements document's "out of
  scope" section was written first specifically to have something to push back with.
- **Deleting work.** `employee.helpers.ts` was created as a wrapper around one function and
  a re-export; it was deleted the same session. A proposed `UNIQUE` constraint was removed
  once it conflicted with the design it was meant to protect.
- **Not trusting a green test.** Two tests in this repository passed for the wrong reason
  before being fixed. A green suite is evidence only if you have read what each test
  actually asserts.
- **Refusing a plausible number.** The "~11 ms" in ADR-0004 is the clearest example of the
  specific failure mode to watch for: AI will produce a confident, well-formatted,
  entirely invented measurement, and it will look exactly like a real one.
- **Chart design.** The default for "show payroll and headcount over time" is one chart with
  two y-axes, which invites the reader to see a relationship the axis ranges invented. It
  is two charts here.

## 5. What I would tell someone starting the same exercise

1. **Write the requirements and the ADRs first.** Not for the reviewer — for the AI. A
   model given "money is integer minor units, compensation is append-only, aggregate in
   SQL" writes materially different code from one given "build a salary app".
2. **Put the invariants where the machine enforces them.** CHECK constraints, a strict
   `tsconfig`, Zod schemas shared by both sides. Every rule that lives only in a comment is
   a rule that will be broken by the next plausible-looking change.
3. **Be specific about what a test must prove.** "Add tests" produces tests that pass.
   "Prove the org chart has no cycles" produces a test that found one.
4. **Measure before believing any performance claim, including your own.**
5. **Read the failure output.** The most expensive minutes in this build were spent on a
   test made green without understanding why it was red.
