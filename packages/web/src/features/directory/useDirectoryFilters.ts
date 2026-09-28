import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { DirectoryFilters } from '../../api/queries';

const LIST_KEYS = ['country', 'department', 'level', 'status', 'bandPosition'] as const;

/**
 * Keeps the directory's state in the URL.
 *
 * "Show me everyone in India below band, sorted by compa-ratio" is then a link the HR
 * Manager can bookmark, send to a colleague, or land on after a browser refresh —
 * instead of a sequence of clicks they have to remember. It also makes the back button
 * behave the way people expect.
 */
export function useDirectoryFilters() {
  const [params, setParams] = useSearchParams();

  const filters = useMemo<DirectoryFilters>(() => {
    const list = (key: string): string[] | undefined => {
      const value = params.get(key);
      return value ? value.split(',').filter(Boolean) : undefined;
    };

    return {
      search: params.get('search') ?? undefined,
      country: list('country'),
      department: list('department'),
      level: list('level'),
      status: list('status'),
      bandPosition: list('bandPosition'),
      managerId: params.get('managerId') ? Number(params.get('managerId')) : undefined,
      sort: params.get('sort') ?? 'name',
      direction: (params.get('direction') as 'asc' | 'desc') ?? 'asc',
      page: Number(params.get('page') ?? 1),
      pageSize: Number(params.get('pageSize') ?? 25),
    };
  }, [params]);

  const update = useCallback(
    (changes: Partial<DirectoryFilters>) => {
      const next = new URLSearchParams(params);

      for (const [key, value] of Object.entries(changes)) {
        if (
          value === undefined ||
          value === null ||
          value === '' ||
          (Array.isArray(value) && value.length === 0)
        ) {
          next.delete(key);
        } else {
          next.set(key, Array.isArray(value) ? value.join(',') : String(value));
        }
      }

      // Any change other than paging returns to page one — otherwise narrowing a filter
      // while on page 12 lands on an empty table.
      if (!('page' in changes)) next.delete('page');

      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const toggleSort = useCallback(
    (field: string) => {
      const sameField = filters.sort === field;
      update({
        sort: field,
        direction: sameField && filters.direction === 'asc' ? 'desc' : 'asc',
      });
    },
    [filters.sort, filters.direction, update],
  );

  const clear = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams]);

  const activeFilterCount =
    LIST_KEYS.filter((key) => params.get(key)).length +
    (params.get('search') ? 1 : 0) +
    (params.get('managerId') ? 1 : 0);

  return { filters, update, toggleSort, clear, activeFilterCount, params };
}
