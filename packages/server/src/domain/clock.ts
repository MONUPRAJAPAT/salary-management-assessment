/**
 * "Today", in one place.
 *
 * Every query that resolves current compensation takes the date as a parameter rather
 * than calling DATE('now') inside SQL. That is partly a performance decision — SQLite
 * cannot optimise around a value it must recompute per row — and partly a correctness
 * one: a date that can be passed in is a date a test can control.
 */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
