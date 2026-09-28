/**
 * Minimal RFC 4180 CSV writing.
 *
 * A dependency for this would be 40 lines of code and a supply-chain decision. The rules
 * that matter are: quote anything containing a comma, quote or newline, and double any
 * embedded quote.
 */
export function toCsv(headers: readonly string[], rows: ReadonlyArray<readonly unknown[]>): string {
  const lines = [headers.map(escapeCell).join(',')];
  for (const row of rows) lines.push(row.map(escapeCell).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}
