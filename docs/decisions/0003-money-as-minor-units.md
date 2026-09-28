# ADR-0003 — Money is an integer count of minor units, never a float

**Status:** accepted · **Date:** 2026-09-28

## Context
This is a payroll system. `0.1 + 0.2 !== 0.3` is not a curiosity here; it is a wrong number on
someone's salary. The dataset also spans currencies with different minor-unit exponents (USD/EUR = 2,
JPY = 0).

## Decision
Every monetary amount in the database, on the wire, and in the domain is an **integer of minor
units**, always carried together with its currency code:

```ts
type Money = { amountMinor: number; currency: CurrencyCode };
// ₹85,000.00 -> { amountMinor: 8_500_000, currency: 'INR' }
// ¥8,500,000 -> { amountMinor: 8_500_000, currency: 'JPY' }  // exponent 0
```

Rules enforced in `shared/src/money.ts`:
1. Arithmetic on two `Money` values with different currencies **throws**. Mixing currencies is a bug,
   not a rounding question.
2. Conversion and percentage changes round **half-up at the final step only**, and return integers.
3. Formatting happens at the edge (`Intl.NumberFormat`) and is never stored or transported.
4. `Number.MAX_SAFE_INTEGER` is ~9.0e15 — nine trillion yen. Amounts are validated as safe integers
   on entry, so the representation is provably sufficient for salaries.

## Consequences
Serialising `{ amountMinor, currency }` rather than `"₹85,000"` is slightly more verbose over the
wire, and every display site must call a formatter. That verbosity is the point: it is impossible to
accidentally do arithmetic on a formatted string, and the UI can format per the viewer's locale.
