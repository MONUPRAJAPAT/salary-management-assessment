import { z } from 'zod';
import { currencyCodeSchema, isoDateSchema } from './common';
import { departmentSchema, levelSchema } from '../enums';

export const countrySchema = z.object({
  code: z.string().length(2),
  name: z.string(),
  region: z.string(),
  currency: currencyCodeSchema,
});
export type Country = z.infer<typeof countrySchema>;

export const salaryBandSchema = z.object({
  countryCode: z.string().length(2),
  level: levelSchema,
  currency: currencyCodeSchema,
  minMinor: z.number().int(),
  midMinor: z.number().int(),
  maxMinor: z.number().int(),
});
export type SalaryBand = z.infer<typeof salaryBandSchema>;

/**
 * One call the UI makes on boot: everything needed to render filters, labels and
 * currency formatting without a waterfall of small requests.
 */
export const referenceDataSchema = z.object({
  countries: z.array(countrySchema),
  departments: z.array(departmentSchema),
  levels: z.array(levelSchema),
  fx: z.object({
    asOf: isoDateSchema,
    baseCurrency: currencyCodeSchema,
    /** Micros of base currency per unit. See Money/FxRateTable. */
    rates: z.record(z.string(), z.number().int()),
  }),
});
export type ReferenceData = z.infer<typeof referenceDataSchema>;
