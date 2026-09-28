import {
  CURRENCIES,
  LEVEL_METADATA,
  type ChangeReason,
  type CurrencyCode,
  type Department,
  type EmployeeStatus,
  type EmploymentType,
  type Gender,
  type Level,
} from '@acme/shared';
import { Random } from './random';
import { NAME_POOLS, toEmailToken } from './names';
import { BAND_MIN_RATIO, COUNTRIES, buildSalaryBands, type SalaryBandSeed } from './reference-data';

/**
 * Generates ACME's 10,000 employees and their compensation history.
 *
 * Everything here is driven by a seeded PRNG and a pinned reference date, so the output
 * is byte-identical on every run and on every machine. The distributions are chosen to
 * make the product's analytics show something worth looking at — a real organisation has
 * a shape, and a uniformly random one would make every chart a flat line.
 */

/** Pinned so `npm run seed` is reproducible. Change in one place to refresh the dataset. */
export const SEED_AS_OF = '2026-09-28';
export const DEFAULT_SEED = 20_260_928;

export interface GeneratedEmployee {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  department: Department;
  level: Level;
  countryCode: string;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  gender: Gender;
  hireDate: string;
  /** Index into the employees array; resolved to a real id at insert time. */
  managerIndex: number | null;
}

export interface GeneratedCompensation {
  employeeIndex: number;
  effectiveFrom: string;
  baseSalaryMinor: number;
  currency: CurrencyCode;
  changeReason: ChangeReason;
  note: string | null;
}

export interface SeedDataset {
  employees: GeneratedEmployee[];
  compensation: GeneratedCompensation[];
  bands: SalaryBandSeed[];
  asOf: string;
}

const DEPARTMENT_WEIGHTS: ReadonlyArray<readonly [Department, number]> = [
  ['Engineering', 32],
  ['Sales', 15],
  ['Customer Success', 9],
  ['Operations', 8],
  ['Product', 7],
  ['Marketing', 7],
  ['Data', 6],
  ['Finance', 4.5],
  ['Design', 4.5],
  ['People', 4],
  ['Legal', 3],
];

/** A normal organisational pyramid: many mid-level people, few at the top. */
const LEVEL_WEIGHTS: ReadonlyArray<readonly [Level, number]> = [
  ['IC1', 13],
  ['IC2', 22],
  ['IC3', 25],
  ['IC4', 16],
  ['IC5', 7],
  ['IC6', 2.5],
  ['M1', 8],
  ['M2', 4],
  ['M3', 2],
  ['M4', 0.5],
];

/**
 * Deliberately modelled under-representation of women at senior levels, and a small
 * within-level pay difference.
 *
 * This is synthetic data reproducing a documented real-world pattern so that the pay-gap
 * feature has something true to find. It is not a claim about any real organisation. It
 * is here because a product that surfaces pay equity should be demonstrated on data where
 * a gap exists — otherwise the feature cannot be evaluated at all.
 */
const SENIORITY_MULTIPLIER_FOR_WOMEN: Partial<Record<Level, number>> = {
  IC1: 1.15,
  IC2: 1.1,
  IC5: 0.75,
  IC6: 0.6,
  M2: 0.8,
  M3: 0.65,
  M4: 0.55,
};
const WITHIN_LEVEL_COMPA_OFFSET_FOR_WOMEN = -0.022;

const GENDER_WEIGHTS: ReadonlyArray<readonly [Gender, number]> = [
  ['male', 52],
  ['female', 42],
  ['non_binary', 2],
  ['undisclosed', 4],
];

const EMPLOYMENT_TYPE_WEIGHTS: ReadonlyArray<readonly [EmploymentType, number]> = [
  ['full_time', 93],
  ['part_time', 4],
  ['contract', 3],
];

const STATUS_WEIGHTS: ReadonlyArray<readonly [EmployeeStatus, number]> = [
  ['active', 95],
  ['on_leave', 3],
  ['terminated', 2],
];

/** Hiring ramps up over time, as at a growing company. */
const HIRE_YEAR_WEIGHTS: ReadonlyArray<readonly [number, number]> = [
  [2016, 2],
  [2017, 3],
  [2018, 5],
  [2019, 7],
  [2020, 8],
  [2021, 12],
  [2022, 14],
  [2023, 14],
  [2024, 13],
  [2025, 12],
  [2026, 10],
];

const ROLE_NOUNS: Record<Department, string> = {
  Engineering: 'Software Engineer',
  Product: 'Product Manager',
  Design: 'Product Designer',
  Data: 'Data Scientist',
  Sales: 'Account Executive',
  Marketing: 'Marketing Specialist',
  'Customer Success': 'Customer Success Manager',
  Finance: 'Financial Analyst',
  People: 'People Partner',
  Legal: 'Legal Counsel',
  Operations: 'Operations Analyst',
};

const IC_TITLE_PREFIX: Partial<Record<Level, string>> = {
  IC1: 'Associate ',
  IC2: '',
  IC3: 'Senior ',
  IC4: 'Staff ',
  IC5: 'Principal ',
  IC6: 'Distinguished ',
};

export function jobTitleFor(department: Department, level: Level): string {
  if (LEVEL_METADATA[level].track === 'management') {
    return `${LEVEL_METADATA[level].label}, ${department}`;
  }
  return `${IC_TITLE_PREFIX[level] ?? ''}${ROLE_NOUNS[department]}`;
}

export function generateDataset(seed = DEFAULT_SEED, asOf = SEED_AS_OF): SeedDataset {
  const random = new Random(seed);
  const bands = buildSalaryBands();
  const bandIndex = new Map(bands.map((band) => [`${band.countryCode}:${band.level}`, band]));

  const employees: GeneratedEmployee[] = [];
  const compensation: GeneratedCompensation[] = [];
  const usedEmails = new Map<string, number>();

  for (const country of COUNTRIES) {
    const pool = NAME_POOLS[country.nameLocale];

    for (let n = 0; n < country.headcount; n += 1) {
      const employeeIndex = employees.length;
      const gender = random.weighted(GENDER_WEIGHTS);
      const department = random.weighted(DEPARTMENT_WEIGHTS);
      const level = random.weighted(levelWeightsFor(gender));
      const firstName = random.pick(pool.first);
      const lastName = random.pick(pool.last);
      const hireDate = generateHireDate(random, asOf);

      const band = bandIndex.get(`${country.code}:${level}`);
      if (band === undefined) throw new Error(`Missing band for ${country.code}:${level}`);

      employees.push({
        employeeNumber: `ACME-${String(employeeIndex + 1).padStart(5, '0')}`,
        firstName,
        lastName,
        email: uniqueEmail(firstName, lastName, usedEmails),
        jobTitle: jobTitleFor(department, level),
        department,
        level,
        countryCode: country.code,
        employmentType: random.weighted(EMPLOYMENT_TYPE_WEIGHTS),
        status: random.weighted(STATUS_WEIGHTS),
        gender,
        hireDate,
        managerIndex: null,
      });

      const currentSalaryMinor = generateCurrentSalary(random, band, gender, hireDate, asOf);
      compensation.push(
        ...generateCompensationHistory(random, {
          employeeIndex,
          currency: country.currency,
          hireDate,
          asOf,
          currentSalaryMinor,
        }),
      );
    }
  }

  assignManagers(employees);

  return { employees, compensation, bands, asOf };
}

function levelWeightsFor(gender: Gender): ReadonlyArray<readonly [Level, number]> {
  if (gender !== 'female') return LEVEL_WEIGHTS;
  return LEVEL_WEIGHTS.map(
    ([level, weight]) => [level, weight * (SENIORITY_MULTIPLIER_FOR_WOMEN[level] ?? 1)] as const,
  );
}

function generateHireDate(random: Random, asOf: string): string {
  const latest = new Date(`${asOf}T00:00:00Z`);
  for (;;) {
    const year = random.weighted(HIRE_YEAR_WEIGHTS);
    const month = random.int(1, 12);
    const day = random.int(1, 28);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    // Reject rather than clamp: clamping would pile every late-2026 draw onto one day.
    if (candidate <= latest) return toIsoDate(candidate);
  }
}

/**
 * Salary as a compa-ratio against the band midpoint. A normal distribution centred just
 * below midpoint, widened by tenure, naturally produces ~3% of people below band and ~1%
 * above it — which is roughly what a real compensation review finds, and gives the band
 * health view a genuine population to report rather than a contrived one.
 */
function generateCurrentSalary(
  random: Random,
  band: SalaryBandSeed,
  gender: Gender,
  hireDate: string,
  asOf: string,
): number {
  const tenureYears = yearsBetween(hireDate, asOf);
  const tenureBump = Math.min(tenureYears * 0.008, 0.07);
  const genderOffset = gender === 'female' ? WITHIN_LEVEL_COMPA_OFFSET_FOR_WOMEN : 0;

  const compaRatio = random.normal(0.995 + tenureBump + genderOffset, 0.105, 0.68, 1.42);
  return roundSalary(band.midMinor * compaRatio, band.currency);
}

interface HistoryInput {
  employeeIndex: number;
  currency: CurrencyCode;
  hireDate: string;
  asOf: string;
  currentSalaryMinor: number;
}

/**
 * Builds a plausible salary history that ends at the employee's current salary.
 *
 * Raises are decided first as a chain of multipliers on ACME's April review cycle, then
 * the starting salary is derived by dividing the current salary back through them, and
 * the chain is replayed forward. Generating forward from a random start would produce a
 * current salary distribution nobody chose.
 */
function generateCompensationHistory(random: Random, input: HistoryInput): GeneratedCompensation[] {
  const { employeeIndex, currency, hireDate, asOf, currentSalaryMinor } = input;

  const reviewDates = aprilReviewDatesBetween(hireDate, asOf);
  const raises: Array<{ date: string; multiplier: number; reason: ChangeReason }> = [];

  for (const date of reviewDates) {
    if (!random.chance(0.82)) continue; // not everyone is reviewed up every cycle
    const roll = random.next();
    if (roll < 0.14) {
      raises.push({ date, multiplier: random.float(1.11, 1.2), reason: 'promotion' });
    } else if (roll < 0.22) {
      raises.push({ date, multiplier: random.float(1.04, 1.09), reason: 'market_adjustment' });
    } else {
      raises.push({ date, multiplier: random.float(1.025, 1.07), reason: 'merit' });
    }
  }

  const compoundGrowth = raises.reduce((product, raise) => product * raise.multiplier, 1);
  let salaryMinor = roundSalary(currentSalaryMinor / compoundGrowth, currency);

  const records: GeneratedCompensation[] = [
    {
      employeeIndex,
      effectiveFrom: hireDate,
      baseSalaryMinor: salaryMinor,
      currency,
      changeReason: 'hire',
      note: 'Starting salary on hire',
    },
  ];

  raises.forEach((raise, position) => {
    const isLast = position === raises.length - 1;
    // The final step lands exactly on the target so the intended salary distribution
    // survives the rounding applied at every intermediate step.
    salaryMinor = isLast
      ? currentSalaryMinor
      : roundSalary(salaryMinor * raise.multiplier, currency);
    records.push({
      employeeIndex,
      effectiveFrom: raise.date,
      baseSalaryMinor: salaryMinor,
      currency,
      changeReason: raise.reason,
      note: NOTE_BY_REASON[raise.reason] ?? null,
    });
  });

  return records;
}

const NOTE_BY_REASON: Partial<Record<ChangeReason, string>> = {
  merit: 'Annual review outcome',
  promotion: 'Promotion to next level',
  market_adjustment: 'Market benchmark realignment',
};

/**
 * Builds the org chart.
 *
 * Individual contributors report into management levels rather than to more senior ICs,
 * and each management level reports to the one above it, which is how the levels are
 * actually used. Each department has a head — its most senior person — and the heads
 * report to a single chief executive who reports to nobody.
 *
 * Reports always point at a strictly more senior level, and the only same-level edge
 * (a VP to their department head) terminates at the chief executive. That is what makes
 * the graph provably acyclic, which the tests check rather than assume.
 */
function assignManagers(employees: GeneratedEmployee[]): void {
  const REPORTS_TO: Record<Level, Level[]> = {
    IC1: ['M1', 'M2', 'M3', 'M4'],
    IC2: ['M1', 'M2', 'M3', 'M4'],
    IC3: ['M1', 'M2', 'M3', 'M4'],
    IC4: ['M2', 'M1', 'M3', 'M4'],
    IC5: ['M3', 'M2', 'M4', 'M1'],
    IC6: ['M3', 'M4', 'M2', 'M1'],
    M1: ['M2', 'M3', 'M4'],
    M2: ['M3', 'M4'],
    M3: ['M4'],
    M4: [],
  };

  const byDepartmentAndLevel = new Map<string, number[]>();
  employees.forEach((employee, index) => {
    const key = `${employee.department}:${employee.level}`;
    const bucket = byDepartmentAndLevel.get(key);
    if (bucket) bucket.push(index);
    else byDepartmentAndLevel.set(key, [index]);
  });

  // The head of each department is its most senior person, earliest index breaking ties.
  const departmentHead = new Map<string, number>();
  employees.forEach((employee, index) => {
    const incumbent = departmentHead.get(employee.department);
    if (incumbent === undefined) {
      departmentHead.set(employee.department, index);
      return;
    }
    const incumbentLevel = employees[incumbent]?.level;
    if (incumbentLevel === undefined) return;
    if (LEVEL_METADATA[employee.level].sortOrder > LEVEL_METADATA[incumbentLevel].sortOrder) {
      departmentHead.set(employee.department, index);
    }
  });

  const heads = [...departmentHead.values()];
  const chiefExecutiveIndex = heads.reduce((most, candidate) => {
    const mostLevel = employees[most]?.level;
    const candidateLevel = employees[candidate]?.level;
    if (mostLevel === undefined || candidateLevel === undefined) return most;
    return LEVEL_METADATA[candidateLevel].sortOrder > LEVEL_METADATA[mostLevel].sortOrder
      ? candidate
      : most;
  }, heads[0] ?? 0);

  const cursors = new Map<string, number>();
  const nextFrom = (key: string, candidates: number[], selfIndex: number): number | null => {
    if (candidates.length === 0) return null;
    const cursor = cursors.get(key) ?? 0;
    for (let attempt = 0; attempt < candidates.length; attempt += 1) {
      const candidate = candidates[(cursor + attempt) % candidates.length];
      if (candidate !== undefined && candidate !== selfIndex) {
        cursors.set(key, cursor + attempt + 1);
        return candidate;
      }
    }
    return null;
  };

  employees.forEach((employee, index) => {
    if (index === chiefExecutiveIndex) {
      employee.managerIndex = null;
      return;
    }

    const head = departmentHead.get(employee.department) ?? chiefExecutiveIndex;
    if (index === head) {
      employee.managerIndex = chiefExecutiveIndex;
      return;
    }

    for (const managerLevel of REPORTS_TO[employee.level]) {
      const key = `${employee.department}:${managerLevel}`;
      const manager = nextFrom(key, byDepartmentAndLevel.get(key) ?? [], index);
      // Never report to someone below the department head in the chain being built, and
      // never to a peer: the level ordering in REPORTS_TO guarantees both.
      if (manager !== null) {
        employee.managerIndex = manager;
        return;
      }
    }

    // Nobody senior enough in their own department — report to the department head.
    employee.managerIndex = head;
  });
}

/** Salaries are published in round figures, not to the last rupee. */
export function roundSalary(minorAmount: number, currency: CurrencyCode): number {
  const majorPerMinor = 10 ** CURRENCIES[currency].exponent;
  const incrementMajor = currency === 'INR' || currency === 'JPY' ? 100 : 10;
  const increment = incrementMajor * majorPerMinor;
  return Math.max(increment, Math.round(minorAmount / increment) * increment);
}

function uniqueEmail(firstName: string, lastName: string, used: Map<string, number>): string {
  const stem = `${toEmailToken(firstName)}.${toEmailToken(lastName)}`;
  const seen = used.get(stem) ?? 0;
  used.set(stem, seen + 1);
  return seen === 0 ? `${stem}@acme.example` : `${stem}${seen + 1}@acme.example`;
}

function aprilReviewDatesBetween(hireDate: string, asOf: string): string[] {
  const hire = new Date(`${hireDate}T00:00:00Z`);
  const latest = new Date(`${asOf}T00:00:00Z`);
  const dates: string[] = [];

  // First review is the April at least six months after joining.
  for (let year = hire.getUTCFullYear(); year <= latest.getUTCFullYear(); year += 1) {
    const review = new Date(Date.UTC(year, 3, 1));
    if (review > latest) break;
    if (monthsBetween(hire, review) >= 6) dates.push(toIsoDate(review));
  }
  return dates;
}

const MILLISECONDS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365.25;

function yearsBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return (end - start) / MILLISECONDS_PER_DAY / DAYS_PER_YEAR;
}

function monthsBetween(from: Date, to: Date): number {
  return (
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth())
  );
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export { BAND_MIN_RATIO };
