import { z } from 'zod';
import { ValidationError } from './errors';

/**
 * Parses request input against a shared contract schema, turning a Zod failure into a
 * 400 with field-level detail rather than letting it surface as a 500.
 *
 * Every route parses its input here. Nothing downstream of a route handler ever sees an
 * unvalidated value, which is why the services and repositories can take typed arguments
 * without defensive checks.
 */
export function parseOrThrow<T extends z.ZodTypeAny>(
  schema: T,
  value: unknown,
  what: string,
): z.infer<T> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  throw new ValidationError(
    `Invalid ${what}.`,
    result.error.issues.map((issue) => ({
      field: issue.path.join('.') || '(root)',
      message: issue.message,
    })),
  );
}

export const idParamSchema = z.coerce.number().int().positive();
