import type { Kysely } from 'kysely';
import type {
  CreateEmployeeInput,
  EmployeeDetail,
  UpdateEmployeeInput,
} from '@acme/shared';
import type { Database } from '../db/types';
import { EmployeeRepository } from '../repositories/employee.repository';
import { ConflictError, NotFoundError, ValidationError } from '../http/errors';

export class EmployeeService {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly employees = new EmployeeRepository(db),
  ) {}

  /**
   * Creates an employee together with their first compensation record, in one
   * transaction. An employee with no salary on record is a hole in the system of record,
   * so the API has no way to create one — and if the compensation insert fails, the
   * employee row does not survive either.
   */
  async create(input: CreateEmployeeInput): Promise<EmployeeDetail> {
    const country = await this.db
      .selectFrom('countries')
      .select(['code', 'currency_code'])
      .where('code', '=', input.countryCode)
      .executeTakeFirst();
    if (!country) throw new ValidationError(`Unknown country ${input.countryCode}.`);

    if (input.managerId !== null) {
      const manager = await this.employees.existsById(input.managerId);
      if (!manager) throw new ValidationError(`Manager ${input.managerId} does not exist.`);
    }

    const emailTaken = await this.db
      .selectFrom('employees')
      .select('id')
      .where('email', '=', input.email)
      .executeTakeFirst();
    if (emailTaken) throw new ConflictError(`${input.email} is already in use.`);

    const id = await this.db.transaction().execute(async (trx) => {
      const employee = await trx
        .insertInto('employees')
        .values({
          employee_number: await nextEmployeeNumber(trx),
          first_name: input.firstName,
          last_name: input.lastName,
          email: input.email,
          job_title: input.jobTitle,
          department: input.department,
          level: input.level,
          country_code: country.code,
          employment_type: input.employmentType,
          status: 'active',
          gender: input.gender,
          hire_date: input.hireDate,
          manager_id: input.managerId,
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      await trx
        .insertInto('compensation_records')
        .values({
          employee_id: employee.id,
          effective_from: input.hireDate,
          base_salary_minor: input.startingSalaryMinor,
          currency_code: country.currency_code,
          change_reason: 'hire',
          note: 'Starting salary on hire',
        })
        .execute();

      return employee.id;
    });

    const created = await this.employees.findById(id);
    if (!created) throw new Error('Employee vanished immediately after being written.');
    return created;
  }

  /**
   * Updates the non-compensation attributes of an employee. Salary is deliberately not
   * updatable here — it goes through the compensation endpoint so that every change
   * carries an effective date and a reason. See ADR-0004.
   */
  async update(id: number, input: UpdateEmployeeInput): Promise<EmployeeDetail> {
    if (!(await this.employees.existsById(id))) throw new NotFoundError(`Employee ${id}`);

    if (input.managerId !== undefined && input.managerId !== null) {
      if (input.managerId === id) throw new ValidationError('An employee cannot manage themselves.');
      if (!(await this.employees.existsById(input.managerId))) {
        throw new ValidationError(`Manager ${input.managerId} does not exist.`);
      }
      if (await this.wouldCreateReportingCycle(id, input.managerId)) {
        throw new ValidationError(
          'That reporting line would create a cycle: the proposed manager already reports to this employee.',
        );
      }
    }

    if (input.email !== undefined) {
      const taken = await this.db
        .selectFrom('employees')
        .select('id')
        .where('email', '=', input.email)
        .where('id', '!=', id)
        .executeTakeFirst();
      if (taken) throw new ConflictError(`${input.email} is already in use.`);
    }

    await this.db
      .updateTable('employees')
      .set({
        ...(input.firstName !== undefined ? { first_name: input.firstName } : {}),
        ...(input.lastName !== undefined ? { last_name: input.lastName } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.jobTitle !== undefined ? { job_title: input.jobTitle } : {}),
        ...(input.department !== undefined ? { department: input.department } : {}),
        ...(input.level !== undefined ? { level: input.level } : {}),
        ...(input.employmentType !== undefined ? { employment_type: input.employmentType } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.gender !== undefined ? { gender: input.gender } : {}),
        ...(input.managerId !== undefined ? { manager_id: input.managerId } : {}),
        updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
      })
      .where('id', '=', id)
      .execute();

    const updated = await this.employees.findById(id);
    if (!updated) throw new NotFoundError(`Employee ${id}`);
    return updated;
  }

  /**
   * Walks up from the proposed manager. If we reach the employee being edited, this
   * reporting line would close a loop — which would hang any code that walks the chain.
   */
  private async wouldCreateReportingCycle(employeeId: number, managerId: number): Promise<boolean> {
    const seen = new Set<number>();
    let cursor: number | null = managerId;

    while (cursor !== null && !seen.has(cursor)) {
      if (cursor === employeeId) return true;
      seen.add(cursor);
      const next: { manager_id: number | null } | undefined = await this.db
        .selectFrom('employees')
        .select('manager_id')
        .where('id', '=', cursor)
        .executeTakeFirst();
      cursor = next?.manager_id ?? null;
    }
    return false;
  }
}

/**
 * Employee numbers continue the sequence the seed established rather than restarting,
 * so ACME-10001 follows ACME-10000.
 */
async function nextEmployeeNumber(trx: Kysely<Database>): Promise<string> {
  const row = await trx
    .selectFrom('employees')
    .select((eb) => eb.fn.max<number>('id').as('maxId'))
    .executeTakeFirst();
  return `ACME-${String((row?.maxId ?? 0) + 1).padStart(5, '0')}`;
}
