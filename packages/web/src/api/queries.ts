import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  bandHealthReportSchema,
  compensationChangeResponseSchema,
  dimensionBreakdownSchema,
  distributionSchema,
  employeeDetailSchema,
  employeeListResponseSchema,
  overviewSchema,
  payGapReportSchema,
  payrollTrendSchema,
  referenceDataSchema,
  type AnalyticsDimension,
  type CreateCompensationChangeInput,
  type CreateEmployeeInput,
  type UpdateEmployeeInput,
} from '@acme/shared';
import { api, toQueryString } from './client';

/** Filters the directory understands, as the UI holds them. */
export interface DirectoryFilters {
  search?: string;
  country?: string[];
  department?: string[];
  level?: string[];
  status?: string[];
  bandPosition?: string[];
  managerId?: number;
  sort?: string;
  direction?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface InsightFilters {
  country?: string[];
  department?: string[];
  level?: string[];
  includeInactive?: boolean;
}

const insightParams = (filters: InsightFilters) => ({
  country: filters.country,
  department: filters.department,
  level: filters.level,
  includeInactive: filters.includeInactive ? 'true' : undefined,
});

export function useReferenceData() {
  return useQuery({
    queryKey: ['reference'],
    queryFn: () => api.get('/reference', referenceDataSchema),
    // Countries, bands and exchange rates do not change while someone is using the app.
    staleTime: Infinity,
  });
}

export function useEmployees(filters: DirectoryFilters) {
  return useQuery({
    queryKey: ['employees', filters],
    queryFn: () =>
      api.get(`/employees${toQueryString({ ...filters })}`, employeeListResponseSchema),
    // Keeps the previous page on screen while the next one loads, so paging and typing
    // in the search box do not flash an empty table.
    placeholderData: (previous) => previous,
  });
}

export function useEmployee(id: number | null) {
  return useQuery({
    queryKey: ['employee', id],
    queryFn: () => api.get(`/employees/${id}`, employeeDetailSchema),
    enabled: id !== null,
  });
}

export function useOverview(filters: InsightFilters) {
  return useQuery({
    queryKey: ['overview', filters],
    queryFn: () =>
      api.get(`/analytics/overview${toQueryString(insightParams(filters))}`, overviewSchema),
  });
}

export function useBreakdown(dimension: AnalyticsDimension, filters: InsightFilters) {
  return useQuery({
    queryKey: ['breakdown', dimension, filters],
    queryFn: () =>
      api.get(
        `/analytics/breakdown${toQueryString({ dimension, ...insightParams(filters) })}`,
        dimensionBreakdownSchema,
      ),
  });
}

export function usePayGap(groupBy: 'department' | 'level' | 'country', filters: InsightFilters) {
  return useQuery({
    queryKey: ['pay-gap', groupBy, filters],
    queryFn: () =>
      api.get(
        `/analytics/pay-gap${toQueryString({ groupBy, ...insightParams(filters) })}`,
        payGapReportSchema,
      ),
  });
}

export function useBandHealth(filters: InsightFilters) {
  return useQuery({
    queryKey: ['band-health', filters],
    queryFn: () =>
      api.get(
        `/analytics/band-health${toQueryString(insightParams(filters))}`,
        bandHealthReportSchema,
      ),
  });
}

export function useDistribution(filters: InsightFilters, bucketCount = 12) {
  return useQuery({
    queryKey: ['distribution', filters, bucketCount],
    queryFn: () =>
      api.get(
        `/analytics/distribution${toQueryString({ bucketCount, ...insightParams(filters) })}`,
        distributionSchema,
      ),
  });
}

export function usePayrollTrend(filters: InsightFilters, months = 24) {
  return useQuery({
    queryKey: ['payroll-trend', filters, months],
    queryFn: () =>
      api.get(
        `/analytics/payroll-trend${toQueryString({ months, ...insightParams(filters) })}`,
        payrollTrendSchema,
      ),
  });
}

/**
 * Every mutation invalidates the analytics as well as the employee.
 *
 * A raise changes the org's median, its payroll and possibly its band health. Refreshing
 * only the profile would leave the dashboard quietly stale, which in a salary tool means
 * showing a number that is no longer true.
 */
function useInvalidateOnChange() {
  const queryClient = useQueryClient();
  return (employeeId?: number) => {
    void queryClient.invalidateQueries({ queryKey: ['employees'] });
    void queryClient.invalidateQueries({ queryKey: ['overview'] });
    void queryClient.invalidateQueries({ queryKey: ['breakdown'] });
    void queryClient.invalidateQueries({ queryKey: ['pay-gap'] });
    void queryClient.invalidateQueries({ queryKey: ['band-health'] });
    void queryClient.invalidateQueries({ queryKey: ['distribution'] });
    void queryClient.invalidateQueries({ queryKey: ['payroll-trend'] });
    if (employeeId !== undefined) {
      void queryClient.invalidateQueries({ queryKey: ['employee', employeeId] });
    }
  };
}

export function useRecordCompensationChange(employeeId: number) {
  const invalidate = useInvalidateOnChange();
  return useMutation({
    mutationFn: (input: CreateCompensationChangeInput) =>
      api.post(`/employees/${employeeId}/compensation`, compensationChangeResponseSchema, input),
    onSuccess: () => invalidate(employeeId),
  });
}

export function useUpdateEmployee(employeeId: number) {
  const invalidate = useInvalidateOnChange();
  return useMutation({
    mutationFn: (input: UpdateEmployeeInput) =>
      api.patch(`/employees/${employeeId}`, employeeDetailSchema, input),
    onSuccess: () => invalidate(employeeId),
  });
}

export function useCreateEmployee() {
  const invalidate = useInvalidateOnChange();
  return useMutation({
    mutationFn: (input: CreateEmployeeInput) => api.post('/employees', employeeDetailSchema, input),
    onSuccess: () => invalidate(),
  });
}
