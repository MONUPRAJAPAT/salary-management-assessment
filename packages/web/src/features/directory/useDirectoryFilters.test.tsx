import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useDirectoryFilters } from './useDirectoryFilters';

const wrapper = (initial: string) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[initial]}>{children}</MemoryRouter>;
  };

const setup = (initial = '/employees') =>
  renderHook(() => ({ ...useDirectoryFilters(), location: useLocation() }), {
    wrapper: wrapper(initial),
  });

/**
 * The directory's state lives in the URL so that "everyone in India below band" is a
 * link the HR Manager can bookmark or send to a colleague, and so the back button works.
 */
describe('directory filters in the URL', () => {
  it('starts with sensible defaults when the URL is bare', () => {
    const { result } = setup();
    expect(result.current.filters).toMatchObject({
      page: 1,
      pageSize: 25,
      sort: 'name',
      direction: 'asc',
    });
    expect(result.current.activeFilterCount).toBe(0);
  });

  it('reads multi-value filters out of the query string', () => {
    const { result } = setup('/employees?country=IN,JP&bandPosition=below&search=priya');
    expect(result.current.filters.country).toEqual(['IN', 'JP']);
    expect(result.current.filters.bandPosition).toEqual(['below']);
    expect(result.current.activeFilterCount).toBe(3);
  });

  it('writes a filter change back into the URL', () => {
    const { result } = setup();
    act(() => result.current.update({ country: ['IN'] }));
    expect(result.current.location.search).toContain('country=IN');
  });

  it('removes a filter rather than leaving an empty parameter behind', () => {
    const { result } = setup('/employees?country=IN');
    act(() => result.current.update({ country: [] }));
    expect(result.current.location.search).not.toContain('country');
  });

  it('returns to the first page whenever the filters change', () => {
    // Narrowing a filter while on page 12 would otherwise land on an empty table.
    const { result } = setup('/employees?page=12');
    act(() => result.current.update({ department: ['Engineering'] }));
    expect(result.current.filters.page).toBe(1);
  });

  it('keeps the page when paging', () => {
    const { result } = setup('/employees?country=IN');
    act(() => result.current.update({ page: 3 }));
    expect(result.current.filters.page).toBe(3);
    expect(result.current.filters.country).toEqual(['IN']);
  });

  it('flips direction when the same column is sorted twice, and resets on a new one', () => {
    const { result } = setup();

    act(() => result.current.toggleSort('salary'));
    expect(result.current.filters).toMatchObject({ sort: 'salary', direction: 'asc' });

    act(() => result.current.toggleSort('salary'));
    expect(result.current.filters).toMatchObject({ sort: 'salary', direction: 'desc' });

    act(() => result.current.toggleSort('hireDate'));
    expect(result.current.filters).toMatchObject({ sort: 'hireDate', direction: 'asc' });
  });

  it('clears everything at once', () => {
    const { result } = setup('/employees?country=IN&search=priya&page=4');
    act(() => result.current.clear());
    expect(result.current.location.search).toBe('');
    expect(result.current.activeFilterCount).toBe(0);
  });
});
