import type { EmployeeDetail, EmployeeSummary } from '@acme/shared';

export const employeeSummary = (overrides: Partial<EmployeeSummary> = {}): EmployeeSummary => ({
  id: 1,
  employeeNumber: 'ACME-00001',
  firstName: 'Priya',
  lastName: 'Sharma',
  email: 'priya.sharma@acme.example',
  jobTitle: 'Senior Software Engineer',
  department: 'Engineering',
  level: 'IC3',
  countryCode: 'IN',
  countryName: 'India',
  employmentType: 'full_time',
  status: 'active',
  hireDate: '2021-06-01',
  salary: { amountMinor: 640_000_000, currency: 'INR' }, // ₹6,400,000
  salaryBase: { amountMinor: 8_000_000, currency: 'USD' }, //    $80,000
  compaRatio: 1,
  bandPosition: 'within',
  ...overrides,
});

export const employeeDetail = (overrides: Partial<EmployeeDetail> = {}): EmployeeDetail => ({
  ...employeeSummary(),
  gender: 'female',
  managerId: null,
  managerName: null,
  directReportCount: 0,
  band: { currency: 'INR', minMinor: 512_000_000, midMinor: 640_000_000, maxMinor: 800_000_000 },
  compensationHistory: [
    {
      id: 2,
      effectiveFrom: '2024-04-01',
      amount: { amountMinor: 640_000_000, currency: 'INR' },
      amountBase: { amountMinor: 8_000_000, currency: 'USD' },
      changeReason: 'merit',
      note: 'Annual review outcome',
      recordedAt: '2024-04-01 09:00:00',
      changeFromPreviousPercent: 6.67,
    },
    {
      id: 1,
      effectiveFrom: '2021-06-01',
      amount: { amountMinor: 600_000_000, currency: 'INR' },
      amountBase: { amountMinor: 7_500_000, currency: 'USD' },
      changeReason: 'hire',
      note: 'Starting salary on hire',
      recordedAt: '2021-06-01 09:00:00',
      changeFromPreviousPercent: null,
    },
  ],
  ...overrides,
});
