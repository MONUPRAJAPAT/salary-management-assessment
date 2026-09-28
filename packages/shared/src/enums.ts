import { z } from 'zod';

/**
 * The organisation's controlled vocabularies. Declared once here, validated by the
 * server and rendered by the UI from the same arrays — a new department cannot be
 * added to one side and forgotten on the other.
 */

export const DEPARTMENTS = [
  'Engineering',
  'Product',
  'Design',
  'Data',
  'Sales',
  'Marketing',
  'Customer Success',
  'Finance',
  'People',
  'Legal',
  'Operations',
] as const;
export const departmentSchema = z.enum(DEPARTMENTS);
export type Department = z.infer<typeof departmentSchema>;

export const LEVELS = ['IC1', 'IC2', 'IC3', 'IC4', 'IC5', 'IC6', 'M1', 'M2', 'M3', 'M4'] as const;
export const levelSchema = z.enum(LEVELS);
export type Level = z.infer<typeof levelSchema>;

export type LevelTrack = 'individual_contributor' | 'management';

/**
 * `sortOrder` gives levels a deterministic rank so "sort by level" is seniority order
 * rather than alphabetical (which would put M1 above IC6 and IC10 below IC2).
 */
export const LEVEL_METADATA: Record<
  Level,
  { label: string; track: LevelTrack; sortOrder: number }
> = {
  IC1: { label: 'Associate', track: 'individual_contributor', sortOrder: 1 },
  IC2: { label: 'Professional', track: 'individual_contributor', sortOrder: 2 },
  IC3: { label: 'Senior', track: 'individual_contributor', sortOrder: 3 },
  IC4: { label: 'Staff', track: 'individual_contributor', sortOrder: 4 },
  IC5: { label: 'Principal', track: 'individual_contributor', sortOrder: 5 },
  IC6: { label: 'Distinguished', track: 'individual_contributor', sortOrder: 6 },
  M1: { label: 'Manager', track: 'management', sortOrder: 7 },
  M2: { label: 'Senior Manager', track: 'management', sortOrder: 8 },
  M3: { label: 'Director', track: 'management', sortOrder: 9 },
  M4: { label: 'Vice President', track: 'management', sortOrder: 10 },
};

export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract'] as const;
export const employmentTypeSchema = z.enum(EMPLOYMENT_TYPES);
export type EmploymentType = z.infer<typeof employmentTypeSchema>;

export const EMPLOYEE_STATUSES = ['active', 'on_leave', 'terminated'] as const;
export const employeeStatusSchema = z.enum(EMPLOYEE_STATUSES);
export type EmployeeStatus = z.infer<typeof employeeStatusSchema>;

/** Optional and self-reported. Only ever surfaced in aggregate — see ADR-0005. */
export const GENDERS = ['female', 'male', 'non_binary', 'undisclosed'] as const;
export const genderSchema = z.enum(GENDERS);
export type Gender = z.infer<typeof genderSchema>;

export const CHANGE_REASONS = [
  'hire',
  'merit',
  'promotion',
  'market_adjustment',
  'correction',
] as const;
export const changeReasonSchema = z.enum(CHANGE_REASONS);
export type ChangeReason = z.infer<typeof changeReasonSchema>;

export const CHANGE_REASON_LABELS: Record<ChangeReason, string> = {
  hire: 'New hire',
  merit: 'Merit increase',
  promotion: 'Promotion',
  market_adjustment: 'Market adjustment',
  correction: 'Correction',
};

/** Where an employee sits against the salary band for their level and country. */
export const BAND_POSITIONS = ['below', 'within', 'above'] as const;
export const bandPositionSchema = z.enum(BAND_POSITIONS);
export type BandPosition = z.infer<typeof bandPositionSchema>;

export const ANALYTICS_DIMENSIONS = ['country', 'department', 'level', 'gender'] as const;
export const analyticsDimensionSchema = z.enum(ANALYTICS_DIMENSIONS);
export type AnalyticsDimension = z.infer<typeof analyticsDimensionSchema>;

/**
 * Pay-gap groups with fewer than this many employees are returned without figures.
 * A group of one would expose that individual's salary. See ADR-0005.
 */
export const MIN_GROUP_SIZE_FOR_DISCLOSURE = 5;

export function formatLevel(level: Level): string {
  return `${level} · ${LEVEL_METADATA[level].label}`;
}

export function humanise(value: string): string {
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
