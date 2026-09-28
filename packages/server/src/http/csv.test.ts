import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

describe('toCsv', () => {
  it('writes a header row and one row per record, CRLF terminated', () => {
    expect(toCsv(['name', 'salary'], [['Alice', 120000]])).toBe('name,salary\r\nAlice,120000\r\n');
  });

  it('quotes a field containing a comma', () => {
    // Management job titles are "Director, Engineering" — unquoted, that is two columns
    // and every field after it in the row is shifted.
    expect(toCsv(['title'], [['Director, Engineering']])).toBe('title\r\n"Director, Engineering"\r\n');
  });

  it('doubles an embedded quote', () => {
    expect(toCsv(['note'], [['She said "no"']])).toBe('note\r\n"She said ""no"""\r\n');
  });

  it('quotes a field containing a newline', () => {
    expect(toCsv(['note'], [['line one\nline two']])).toBe('note\r\n"line one\nline two"\r\n');
  });

  it('writes null and undefined as empty cells, not as the words', () => {
    expect(toCsv(['a', 'b'], [[null, undefined]])).toBe('a,b\r\n,\r\n');
  });

  it('writes a header-only file when there are no rows', () => {
    expect(toCsv(['a', 'b'], [])).toBe('a,b\r\n');
  });
});
