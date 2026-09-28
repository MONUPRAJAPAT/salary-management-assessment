import type { Kysely } from 'kysely';
import {
  money,
  scaleMoney,
  type CompensationChangeResponse,
  type CreateCompensationChangeInput,
} from '@acme/shared';
import type { Database } from '../db/types';
import { EmployeeRepository } from '../repositories/employee.repository';
import { ConflictError, NotFoundError, ValidationError } from '../http/errors';
import { todayIso } from '../domain/clock';

/**
 * Recording a change to someone's pay.
 *
 * This is the only write path to compensation in the system. There is no update and no
 * delete: a correction is a new record. The invariants enforced here are the ones that
 * keep the history trustworthy.
 */
export class CompensationService {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly employees = new EmployeeRepository(db),
  ) {}

  async recordChange(
    employeeId: number,
    input: CreateCompensationChangeInput,
  ): Promise<CompensationChangeResponse> {
    const employee = await this.db
      .selectFrom('employees as e')
      .innerJoin('countries as co', 'co.code', 'e.country_code')
      .select(['e.id', 'e.hire_date', 'co.currency_code'])
      .where('e.id', '=', employeeId)
      .executeTakeFirst();

    if (!employee) throw new NotFoundError(`Employee ${employeeId}`);

    if (input.effectiveFrom < employee.hire_date) {
      throw new ValidationError(
        `A compensation change cannot take effect before the employee was hired (${employee.hire_date}).`,
      );
    }

    // The currency is derived from the employee's country, never accepted from the
    // client. Paying a German employee in rupees is not a thing the API can be asked to
    // do by mistake.
    const currency = employee.currency_code;
    const newSalaryMinor = await this.resolveNewSalary(employeeId, input, currency);

    if (newSalaryMinor <= 0) {
      throw new ValidationError('The resulting salary must be greater than zero.');
    }

    const duplicate = await this.db
      .selectFrom('compensation_records')
      .select('id')
      .where('employee_id', '=', employeeId)
      .where('effective_from', '=', input.effectiveFrom)
      .where('base_salary_minor', '=', newSalaryMinor)
      .executeTakeFirst();

    // An identical record on the same date is a double submit, not a correction. A
    // correction changes the amount, and is allowed.
    if (duplicate) {
      throw new ConflictError(`This exact change is already recorded for ${input.effectiveFrom}.`);
    }

    const inserted = await this.db
      .insertInto('compensation_records')
      .values({
        employee_id: employeeId,
        effective_from: input.effectiveFrom,
        base_salary_minor: newSalaryMinor,
        currency_code: currency,
        change_reason: input.changeReason,
        note: input.note ?? null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const history = await this.employees.compensationHistory(employeeId);
    const record = history.find((entry) => entry.id === inserted.id);
    if (!record) throw new Error('Compensation record vanished immediately after being written.');

    const current = history.find((entry) => entry.effectiveFrom <= todayIso());
    return { record, currentRecordId: current?.id ?? inserted.id };
  }

  /**
   * A percentage increase is applied to the salary in force **on the effective date**,
   * not to today's salary. Those differ whenever a change is backdated or scheduled
   * ahead, and using the wrong one silently pays the wrong amount.
   */
  private async resolveNewSalary(
    employeeId: number,
    input: CreateCompensationChangeInput,
    currency: Database['compensation_records']['currency_code'],
  ): Promise<number> {
    if (input.newSalaryMinor !== undefined) return input.newSalaryMinor;

    const previous = await this.db
      .selectFrom('compensation_records')
      .select(['base_salary_minor'])
      .where('employee_id', '=', employeeId)
      .where('effective_from', '<=', input.effectiveFrom)
      .orderBy('effective_from', 'desc')
      .orderBy('id', 'desc')
      .limit(1)
      .executeTakeFirst();

    if (!previous) {
      throw new ValidationError(
        'There is no salary on record before this date, so a percentage increase cannot be calculated. Give an absolute amount instead.',
      );
    }

    const increasePercent = input.increasePercent ?? 0;
    return scaleMoney(money(previous.base_salary_minor, currency), 1 + increasePercent / 100)
      .amountMinor;
  }
}
