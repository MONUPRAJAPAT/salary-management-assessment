import { z } from 'zod';
import { csvOf, isoDateSchema, moneySchema, paginatedSchema, paginationQuerySchema } from './common';
import {
  bandPositionSchema,
  departmentSchema,
  employeeStatusSchema,
  employmentTypeSchema,
  genderSchema,
  levelSchema,
} from '../enums';

/** What the directory shows for each of the 10,000 rows. */
export const employeeSummarySchema = z.object({
  id: z.number().int(),
  employeeNumber: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  jobTitle: z.string(),
  department: departmentSchema,
  level: levelSchema,
  countryCode: z.string().length(2),
  countryName: z.string(),
  employmentType: employmentTypeSchema,
  status: employeeStatusSchema,
  hireDate: isoDateSchema,

  /** Null only for an employee with no compensation record yet — a data problem, shown as such. */
  salary: moneySchema.nullable(),
  /** The same salary normalised to the base currency; the only figure safe to compare. */
  salaryBase: moneySchema.nullable(),
  /** Salary ÷ band midpoint. 1.0 means paid exactly at midpoint. */
  compaRatio: z.number().nullable(),
  bandPosition: bandPositionSchema.nullable(),
});
export type EmployeeSummary = z.infer<typeof employeeSummarySchema>;

export const compensationRecordSchema = z.object({
  id: z.number().int(),
  effectiveFrom: isoDateSchema,
  amount: moneySchema,
  amountBase: moneySchema,
  changeReason: z.enum(['hire', 'merit', 'promotion', 'market_adjustment', 'correction']),
  note: z.string().nullable(),
  recordedAt: z.string(),
  /** Change against the previous record, computed server-side so every view agrees. */
  changeFromPreviousPercent: z.number().nullable(),
});
export type CompensationRecord = z.infer<typeof compensationRecordSchema>;

export const employeeDetailSchema = employeeSummarySchema.extend({
  gender: genderSchema,
  managerId: z.number().int().nullable(),
  managerName: z.string().nullable(),
  directReportCount: z.number().int(),
  band: z
    .object({
      currency: moneySchema.shape.currency,
      minMinor: z.number().int(),
      midMinor: z.number().int(),
      maxMinor: z.number().int(),
    })
    .nullable(),
  compensationHistory: z.array(compensationRecordSchema),
});
export type EmployeeDetail = z.infer<typeof employeeDetailSchema>;

export const EMPLOYEE_SORT_FIELDS = [
  'name',
  'salary',
  'hireDate',
  'level',
  'department',
  'country',
  'compaRatio',
] as const;
export const employeeSortFieldSchema = z.enum(EMPLOYEE_SORT_FIELDS);
export type EmployeeSortField = z.infer<typeof employeeSortFieldSchema>;

export const employeeListQuerySchema = paginationQuerySchema.extend({
  /** Matches name, employee number, email or job title. */
  search: z.string().trim().max(120).optional(),
  country: csvOf(z.string().length(2)),
  department: csvOf(departmentSchema),
  level: csvOf(levelSchema),
  status: csvOf(employeeStatusSchema),
  employmentType: csvOf(employmentTypeSchema),
  bandPosition: csvOf(bandPositionSchema),
  managerId: z.coerce.number().int().positive().optional(),
  sort: employeeSortFieldSchema.default('name'),
  direction: z.enum(['asc', 'desc']).default('asc'),
});
export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>;

export const employeeListResponseSchema = paginatedSchema(employeeSummarySchema);
export type EmployeeListResponse = z.infer<typeof employeeListResponseSchema>;

const nameSchema = z.string().trim().min(1).max(80);

export const createEmployeeSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  email: z.string().trim().email().max(160),
  jobTitle: z.string().trim().min(1).max(120),
  department: departmentSchema,
  level: levelSchema,
  countryCode: z.string().trim().length(2).toUpperCase(),
  employmentType: employmentTypeSchema,
  gender: genderSchema.default('undisclosed'),
  hireDate: isoDateSchema,
  managerId: z.number().int().positive().nullable().default(null),
  /**
   * The starting salary, in the employee's country currency. Required: an employee
   * with no compensation record is a hole in the system of record, so the API does
   * not let one be created.
   */
  startingSalaryMinor: z.number().int().positive(),
});
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

/**
 * Compensation is deliberately absent. Changing pay goes through the compensation
 * endpoint so that it always has an effective date and a reason attached — there is
 * no path in this API that silently overwrites a salary. See ADR-0004.
 */
export const updateEmployeeSchema = z
  .object({
    firstName: nameSchema,
    lastName: nameSchema,
    email: z.string().trim().email().max(160),
    jobTitle: z.string().trim().min(1).max(120),
    department: departmentSchema,
    level: levelSchema,
    employmentType: employmentTypeSchema,
    status: employeeStatusSchema,
    gender: genderSchema,
    managerId: z.number().int().positive().nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'No fields to update' });
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
