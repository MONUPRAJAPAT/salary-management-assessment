import { z } from 'zod';
import { CURRENCY_CODES } from '../currency';

export const currencyCodeSchema = z.enum(CURRENCY_CODES);

/** Money crosses the wire as its two irreducible parts, never as a formatted string. */
export const moneySchema = z.object({
  amountMinor: z.number().int().safe(),
  currency: currencyCodeSchema,
});

/** ISO date, no time component. Compensation is effective on a day, not an instant. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date as YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Not a real calendar date');

/**
 * Accepts a repeated query parameter (`?country=DE&country=IN`) or a comma-separated
 * one (`?country=DE,IN`), because both are things a URL in the wild actually contains.
 */
export const csvOf = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      const parts = value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
      return parts.length > 0 ? parts : undefined;
    }
    return value;
  }, z.array(inner).optional());

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

export const paginatedSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  });

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
