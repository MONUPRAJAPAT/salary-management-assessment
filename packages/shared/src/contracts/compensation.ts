import { z } from 'zod';
import { isoDateSchema } from './common';
import { changeReasonSchema } from '../enums';
import { compensationRecordSchema } from './employee';

/**
 * Two ways to express the same change, because HR Managers think in both:
 * an absolute new salary, or a percentage increase. Exactly one must be given —
 * accepting both would mean deciding which wins, and silently ignoring one is how
 * a payroll system pays someone the wrong amount.
 */
export const createCompensationChangeSchema = z
  .object({
    effectiveFrom: isoDateSchema,
    changeReason: changeReasonSchema,
    note: z.string().trim().max(500).optional(),
    newSalaryMinor: z.number().int().positive().optional(),
    increasePercent: z.number().min(-100).max(200).optional(),
  })
  .refine(
    (value) =>
      (value.newSalaryMinor === undefined) !== (value.increasePercent === undefined),
    { message: 'Provide either newSalaryMinor or increasePercent, not both' },
  );
export type CreateCompensationChangeInput = z.infer<typeof createCompensationChangeSchema>;

export const compensationChangeResponseSchema = z.object({
  record: compensationRecordSchema,
  /** The record that is current as of today after this change was applied. */
  currentRecordId: z.number().int(),
});
export type CompensationChangeResponse = z.infer<typeof compensationChangeResponseSchema>;
