import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { InsightFilters } from '../../api/queries';

/** Same reasoning as the directory: a filtered dashboard should be a shareable link. */
export function useInsightFilters() {
  const [params, setParams] = useSearchParams();

  const filters = useMemo<InsightFilters>(() => {
    const list = (key: string): string[] | undefined => {
      const value = params.get(key);
      return value ? value.split(',').filter(Boolean) : undefined;
    };
    return {
      country: list('country'),
      department: list('department'),
      level: list('level'),
      includeInactive: params.get('includeInactive') === 'true',
    };
  }, [params]);

  const update = useCallback(
    (changes: Partial<InsightFilters>) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(changes)) {
        if (
          value === undefined ||
          value === false ||
          (Array.isArray(value) && value.length === 0)
        ) {
          next.delete(key);
        } else {
          next.set(key, Array.isArray(value) ? value.join(',') : String(value));
        }
      }
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const isFiltered = Boolean(filters.country || filters.department || filters.level);

  return {
    filters,
    update,
    isFiltered,
    clear: () => setParams(new URLSearchParams(), { replace: true }),
  };
}
