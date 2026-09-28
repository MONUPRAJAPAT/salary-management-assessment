# Demo script

A five-minute walkthrough that shows the product doing the job it was built for, in the
order an HR Manager would actually hit it. Each step notes what to say, because the
interesting part is usually *why* the screen behaves that way.

**Setup:** `npm run seed && npm run dev`, then open http://localhost:5173.

---

### 1 · The question the spreadsheet cannot answer (60s) — Insights

Land on the dashboard.

> "ACME has 10,000 people in 10 countries paid in 9 currencies. Annual payroll is $885
> million. The median salary is $77,000 — and that number is only meaningful because every
> salary has been converted to one currency first, at rates pinned to a date that is
> printed on the page. A median that mixes rupees and euros isn't a number."

Point at **369 outside band**, split 211 below / 158 above.

### 2 · Comparing like with like (45s)

Switch the breakdown to **Country**.

> "A Senior Engineer costs $141,000 in the US and $42,000 in India. That's the real
> comparison, not a currency artefact."

Switch to **Level** to show the seniority ladder in order — IC1 through M4, ranked by
seniority rather than alphabetically.

### 3 · Pay equity (60s)

Scroll to **Pay equity**.

> "Organisation-wide, women's median pay is 6.5% below men's. But look at the within-level
> rows — those gaps are close to zero. The organisation-wide gap is almost entirely a
> composition effect: women are under-represented at the senior levels. That distinction is
> the whole point of pay-gap reporting, and it's the one a single headline number hides."

Point at the withheld groups.

> "These groups have fewer than five people of a gender. The server never computes their
> median at all — it's suppressed inside the SQL query, not filtered out afterwards, so it
> can't leak through a forgotten line of UI code. And they're shown as *withheld* rather
> than dropped, because 'we're not telling you' and 'there's nobody here' are different
> answers."

### 4 · From a statistic to an action (45s)

Scroll to **Salary band health** → click a name in *Furthest below band*.

> "The count is a statistic. The list is something you can act on this afternoon."

### 5 · The profile (45s)

On the employee page.

> "Paid in their own currency, shown alongside the USD equivalent. Their position in band,
> drawn to scale. And the full history — every change, with its date, its reason and the
> percentage it moved."

If they have a scheduled change, point at it.

> "A raise dated in the future is recorded now and takes effect on its date. It's visible
> here and it is not counted as today's pay."

### 6 · Giving a raise (60s)

Click **Record change**, set +12%.

> "You can work in percentages or in an absolute figure — both, because HR managers think
> in both. Either way the resulting salary is shown before you commit."

Push it to +30% to trigger the band warning.

> "That would put her above band. It warns, and it still lets you do it — sometimes paying
> above band is the right call, and a tool that refuses is a tool people work around."

Bring it back to a sensible number and save.

> "Nothing was overwritten. That's a new row. The previous salary is still there, and if
> this was a mistake, the fix is another row, not an edit."

Click **Edit** to show that salary is deliberately absent from it.

> "There is no screen in this product that silently changes someone's pay."

### 7 · The numbers move (30s)

Go back to **Insights**.

> "The median, the payroll total and the band health have all already updated. A salary
> tool that shows a stale number is showing a number that isn't true."

### 8 · The directory and the way out (45s)

Go to **Employees** → filter to India + below band → sort by compa-ratio.

> "Search, filter and sort across 10,000 people — all done in SQL, so the browser only ever
> receives 25 rows. This whole view came back in under three milliseconds."

Point at the URL.

> "The filters are in the URL, so this is a link you can bookmark or send to a colleague."

Click **Export CSV**.

> "And when you do need it in a spreadsheet, it exports exactly what's on screen — the
> filtered view, not the whole company. That's the way *out* of Excel, not the way back in."

---

### If there's time: the engineering

- `docs/requirements.md` — written before any code, including what was left out and why.
- `docs/performance.md` — the directory was 77 ms and is now 6.8 ms; the profile was 33.6 ms
  and is now 0.6 ms. Three fixes, each found by profiling rather than by reading the code.
- `docs/ai-collaboration.md` — the eight places AI's first answer was wrong, and what caught
  each one.
- `npm test` — 218 tests in 2.6 seconds.
