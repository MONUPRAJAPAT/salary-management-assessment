import { openTestDatabase, type DatabaseHandle } from '../db/connection';

/**
 * A hand-built organisation of twelve people.
 *
 * Every figure the tests assert is derivable by reading this table, on purpose. When a
 * test says "the median Engineering salary is $100,000" you can check it in your head,
 * which is the difference between a test that documents behaviour and one that merely
 * detects change. Exchange rates are chosen to be exact and memorable — $1 = ₹80 = ¥160 —
 * so a converted figure is verifiable too.
 *
 * Japan is included specifically because JPY has a zero minor-unit exponent. If the
 * currency normalisation SQL ever loses its base_scale factor, Mio's salary comes out a
 * hundred times wrong and these tests fail loudly.
 *
 *  #   Name    Country  Department   Level  Local salary   = USD     Band position
 *  1   Alice   US       Engineering  IC3    $100,000       100,000   within  (compa 0.833)
 *  2   Bob     US       Engineering  IC3    $120,000       120,000   within  (compa 1.0)
 *  3   Carol   US       Engineering  IC3    $140,000       140,000   within  (compa 1.167)
 *  4   Dan     US       Engineering  IC3    $160,000       160,000   ABOVE   (compa 1.333)
 *  5   Esha    IN       Engineering  IC3    ₹4,000,000      50,000   BELOW   (compa 0.625)
 *  6   Farhan  IN       Engineering  IC3    ₹6,400,000      80,000   within  (compa 1.0)
 *  7   Mio     JP       Engineering  IC3    ¥16,000,000    100,000   within  (compa 1.0)
 *  8   Hank    US       Sales        IC2    $80,000         80,000   within  (compa 1.0)
 *  9   Iris    US       Sales        IC2    $90,000         90,000   within  (compa 1.125)
 * 10   Jaya    IN       Sales        IC2    ₹3,200,000      40,000   within  (compa 1.0)
 * 11   Kiran   IN       Sales        IC2    ₹4,800,000      60,000   ABOVE   (compa 1.5)
 * 12   Liam    US       Engineering  M2     $200,000       200,000   TERMINATED
 */

export const FIXTURE_FX_AS_OF = '2026-01-01';

/** Every expectation the tests share, stated once so a fixture change updates them all. */
export const EXPECTED = {
  /** Liam is terminated and excluded from every default analytic. */
  activeHeadcount: 11,
  totalHeadcount: 12,

  /** USD minor units. 11 active salaries: 40 50 60 80 80 90 100 100 120 140 160 (thousands). */
  organisation: {
    totalPayrollUsdMinor: 102_000_000, // $1,020,000
    medianUsdMinor: 9_000_000, //  $90,000  (6th of 11)
    p25UsdMinor: 6_000_000, //  $60,000  (3rd of 11)
    p75UsdMinor: 12_000_000, // $120,000  (9th of 11)
    p90UsdMinor: 14_000_000, // $140,000 (10th of 11)
    minUsdMinor: 4_000_000, //  $40,000
    maxUsdMinor: 16_000_000, // $160,000
  },

  byCountry: {
    US: { headcount: 6, medianUsdMinor: 10_000_000, totalUsdMinor: 69_000_000 },
    IN: { headcount: 4, medianUsdMinor: 5_000_000, totalUsdMinor: 23_000_000 },
    JP: { headcount: 1, medianUsdMinor: 10_000_000, totalUsdMinor: 10_000_000 },
  },

  byDepartment: {
    Engineering: { headcount: 7, medianUsdMinor: 10_000_000, totalUsdMinor: 75_000_000 },
    Sales: { headcount: 4, medianUsdMinor: 6_000_000, totalUsdMinor: 27_000_000 },
  },

  bandPositions: { below: 1, within: 8, above: 2 },

  /** 6 women, 5 active men. Both groups clear the 5-person disclosure threshold. */
  gender: {
    femaleHeadcount: 6,
    femaleMedianUsdMinor: 9_000_000, // $90,000
    maleHeadcount: 5,
    maleMedianUsdMinor: 8_000_000, // $80,000
  },
} as const;

interface EmployeeSeed {
  id: number;
  first: string;
  last: string;
  department: string;
  level: string;
  country: string;
  gender: string;
  status: string;
  hireDate: string;
  /** [effectiveFrom, salaryMinor, reason] — the first entry is always the hire. */
  history: Array<[string, number, string]>;
}

const EMPLOYEES: EmployeeSeed[] = [
  {
    id: 1,
    first: 'Alice',
    last: 'Anand',
    department: 'Engineering',
    level: 'IC3',
    country: 'US',
    gender: 'female',
    status: 'active',
    hireDate: '2020-01-01',
    history: [
      ['2020-01-01', 8_000_000, 'hire'],
      ['2022-04-01', 9_000_000, 'merit'],
      ['2024-04-01', 10_000_000, 'merit'],
    ],
  },
  {
    id: 2,
    first: 'Bob',
    last: 'Baker',
    department: 'Engineering',
    level: 'IC3',
    country: 'US',
    gender: 'male',
    status: 'active',
    hireDate: '2021-06-01',
    history: [
      ['2021-06-01', 11_000_000, 'hire'],
      ['2023-04-01', 12_000_000, 'promotion'],
    ],
  },
  // Carol's future-dated raise must not count as current pay until 2099.
  {
    id: 3,
    first: 'Carol',
    last: 'Chen',
    department: 'Engineering',
    level: 'IC3',
    country: 'US',
    gender: 'female',
    status: 'active',
    hireDate: '2019-03-15',
    history: [
      ['2019-03-15', 14_000_000, 'hire'],
      ['2099-01-01', 99_900_000, 'promotion'],
    ],
  },
  {
    id: 4,
    first: 'Dan',
    last: 'Duarte',
    department: 'Engineering',
    level: 'IC3',
    country: 'US',
    gender: 'male',
    status: 'active',
    hireDate: '2018-09-01',
    history: [['2018-09-01', 16_000_000, 'hire']],
  },
  {
    id: 5,
    first: 'Esha',
    last: 'Iyer',
    department: 'Engineering',
    level: 'IC3',
    country: 'IN',
    gender: 'female',
    status: 'active',
    hireDate: '2022-02-01',
    history: [['2022-02-01', 400_000_000, 'hire']],
  },
  {
    id: 6,
    first: 'Farhan',
    last: 'Khan',
    department: 'Engineering',
    level: 'IC3',
    country: 'IN',
    gender: 'male',
    status: 'active',
    hireDate: '2021-11-01',
    history: [['2021-11-01', 640_000_000, 'hire']],
  },
  {
    id: 7,
    first: 'Mio',
    last: 'Tanaka',
    department: 'Engineering',
    level: 'IC3',
    country: 'JP',
    gender: 'female',
    status: 'active',
    hireDate: '2023-04-01',
    history: [['2023-04-01', 16_000_000, 'hire']],
  },
  {
    id: 8,
    first: 'Hank',
    last: 'Hughes',
    department: 'Sales',
    level: 'IC2',
    country: 'US',
    gender: 'male',
    status: 'active',
    hireDate: '2022-08-15',
    history: [['2022-08-15', 8_000_000, 'hire']],
  },
  {
    id: 9,
    first: 'Iris',
    last: 'Ibarra',
    department: 'Sales',
    level: 'IC2',
    country: 'US',
    gender: 'female',
    status: 'active',
    hireDate: '2020-05-01',
    history: [['2020-05-01', 9_000_000, 'hire']],
  },
  {
    id: 10,
    first: 'Jaya',
    last: 'Rao',
    department: 'Sales',
    level: 'IC2',
    country: 'IN',
    gender: 'female',
    status: 'active',
    hireDate: '2023-01-09',
    history: [['2023-01-09', 320_000_000, 'hire']],
  },
  {
    id: 11,
    first: 'Kiran',
    last: 'Nair',
    department: 'Sales',
    level: 'IC2',
    country: 'IN',
    gender: 'male',
    status: 'active',
    hireDate: '2019-07-01',
    history: [['2019-07-01', 480_000_000, 'hire']],
  },
  {
    id: 12,
    first: 'Liam',
    last: 'Lynch',
    department: 'Engineering',
    level: 'M2',
    country: 'US',
    gender: 'male',
    status: 'terminated',
    hireDate: '2017-02-01',
    history: [['2017-02-01', 20_000_000, 'hire']],
  },
];

/** [country, level, min, mid, max] in local minor units. */
const BANDS: Array<[string, string, number, number, number]> = [
  ['US', 'IC2', 6_400_000, 8_000_000, 10_000_000],
  ['US', 'IC3', 9_600_000, 12_000_000, 15_000_000],
  ['US', 'M2', 16_000_000, 20_000_000, 25_000_000],
  ['IN', 'IC2', 256_000_000, 320_000_000, 400_000_000],
  ['IN', 'IC3', 512_000_000, 640_000_000, 800_000_000],
  ['JP', 'IC2', 10_240_000, 12_800_000, 16_000_000],
  ['JP', 'IC3', 12_800_000, 16_000_000, 20_000_000],
];

const CURRENCY_BY_COUNTRY: Record<string, string> = { US: 'USD', IN: 'INR', JP: 'JPY' };

/**
 * Builds the fixture in a fresh in-memory database. Each test gets its own, so tests
 * share no state and can run in parallel without arranging themselves around each other.
 */
export function createFixture(): DatabaseHandle {
  const handle = openTestDatabase();
  const { sqlite } = handle;

  const write = sqlite.transaction(() => {
    sqlite.exec(`
      INSERT INTO currencies (code, name, exponent, base_scale) VALUES
        ('USD', 'US Dollar',    2, 1),
        ('INR', 'Indian Rupee', 2, 1),
        ('JPY', 'Japanese Yen', 0, 100);

      INSERT INTO countries (code, name, region, currency_code) VALUES
        ('US', 'United States', 'Americas', 'USD'),
        ('IN', 'India',         'APAC',     'INR'),
        ('JP', 'Japan',         'APAC',     'JPY');

      -- $1 = ₹80 = ¥160, so every converted figure in the tests is a round number.
      INSERT INTO fx_rates (currency_code, rate_to_base_micros, as_of) VALUES
        ('USD', 1000000, '${FIXTURE_FX_AS_OF}'),
        ('INR',   12500, '${FIXTURE_FX_AS_OF}'),
        ('JPY',    6250, '${FIXTURE_FX_AS_OF}');
    `);

    const insertBand = sqlite.prepare(
      `INSERT INTO salary_bands (country_code, level, currency_code, min_minor, mid_minor, max_minor)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const [country, level, min, mid, max] of BANDS) {
      insertBand.run(country, level, CURRENCY_BY_COUNTRY[country], min, mid, max);
    }

    // Named parameters, not positional: fourteen columns in a row is exactly where a
    // silently swapped pair of arguments hides, and this one did until a CHECK
    // constraint caught it.
    const insertEmployee = sqlite.prepare(
      `INSERT INTO employees (id, employee_number, first_name, last_name, email, job_title,
                              department, level, country_code, employment_type, status, gender,
                              hire_date, manager_id)
       VALUES (@id, @employeeNumber, @firstName, @lastName, @email, @jobTitle,
               @department, @level, @country, 'full_time', @status, @gender,
               @hireDate, NULL)`,
    );
    const insertCompensation = sqlite.prepare(
      `INSERT INTO compensation_records
         (employee_id, effective_from, base_salary_minor, currency_code, change_reason)
       VALUES (?, ?, ?, ?, ?)`,
    );

    for (const employee of EMPLOYEES) {
      insertEmployee.run({
        id: employee.id,
        employeeNumber: `ACME-${String(employee.id).padStart(5, '0')}`,
        firstName: employee.first,
        lastName: employee.last,
        email: `${employee.first.toLowerCase()}.${employee.last.toLowerCase()}@acme.example`,
        jobTitle: `${employee.level} ${employee.department}`,
        department: employee.department,
        level: employee.level,
        country: employee.country,
        status: employee.status,
        gender: employee.gender,
        hireDate: employee.hireDate,
      });
      for (const [effectiveFrom, salaryMinor, reason] of employee.history) {
        insertCompensation.run(
          employee.id,
          effectiveFrom,
          salaryMinor,
          CURRENCY_BY_COUNTRY[employee.country],
          reason,
        );
      }
    }

    // Alice manages Hank and Iris; everyone else reports to nobody, which keeps the
    // fixture's org chart small enough to hold in your head.
    sqlite.exec('UPDATE employees SET manager_id = 1 WHERE id IN (8, 9)');
  });

  write();
  return handle;
}
