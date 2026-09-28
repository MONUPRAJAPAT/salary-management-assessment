import type { z } from 'zod';
import { apiErrorSchema } from '@acme/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * The single place the browser talks to the server.
 *
 * Responses are parsed against the same Zod schema the server validated them with. It
 * costs a fraction of a millisecond on a 25-row page and it means a contract that has
 * drifted fails loudly at the boundary, rather than as `undefined is not an object`
 * three components deep.
 */
async function request<T extends z.ZodTypeAny>(
  path: string,
  schema: T,
  init?: RequestInit,
): Promise<z.infer<T>> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload);
    if (parsed.success) {
      throw new ApiError(
        response.status,
        parsed.data.error.code,
        parsed.data.error.message,
        parsed.data.error.details,
      );
    }
    throw new ApiError(response.status, 'unknown', `Request failed with ${response.status}.`);
  }

  const result = schema.safeParse(payload);
  if (!result.success) {
    console.error('Response did not match the API contract', path, result.error.issues);
    throw new ApiError(
      response.status,
      'contract_mismatch',
      'The server sent an unexpected response.',
    );
  }
  return result.data;
}

export const api = {
  get: <T extends z.ZodTypeAny>(path: string, schema: T) => request(path, schema),
  post: <T extends z.ZodTypeAny>(path: string, schema: T, body: unknown) =>
    request(path, schema, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T extends z.ZodTypeAny>(path: string, schema: T, body: unknown) =>
    request(path, schema, { method: 'PATCH', body: JSON.stringify(body) }),
};

/** Builds a query string, dropping empty values so URLs stay readable and cacheable. */
export function toQueryString(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length > 0) search.set(key, value.join(','));
    } else {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}
