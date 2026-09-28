import { Router } from 'express';
import type { Kysely } from 'kysely';
import {
  createCompensationChangeSchema,
  createEmployeeSchema,
  employeeListQuerySchema,
  formatLevel,
  toMajorUnits,
  updateEmployeeSchema,
} from '@acme/shared';
import type { Database } from '../../db/types';
import { EmployeeRepository } from '../../repositories/employee.repository';
import { EmployeeService } from '../../services/employee.service';
import { CompensationService } from '../../services/compensation.service';
import { NotFoundError } from '../errors';
import { idParamSchema, parseOrThrow } from '../validate';
import { toCsv } from '../csv';

export function employeeRoutes(db: Kysely<Database>): Router {
  const router = Router();
  const employees = new EmployeeRepository(db);
  const employeeService = new EmployeeService(db);
  const compensationService = new CompensationService(db);

  router.get('/', async (req, res) => {
    const query = parseOrThrow(employeeListQuerySchema, req.query, 'employee filters');
    res.json(await employees.list(query));
  });

  /**
   * Exports whatever the directory is currently showing.
   *
   * Registered before '/:id' because Express matches routes in order and 'export' would
   * otherwise be read as an employee id.
   */
  router.get('/export', async (req, res) => {
    const query = parseOrThrow(employeeListQuerySchema, req.query, 'employee filters');
    const rows = await employees.listAllForExport(query);

    const csv = toCsv(
      [
        'Employee number', 'First name', 'Last name', 'Email', 'Job title',
        'Department', 'Level', 'Country', 'Employment type', 'Status', 'Hire date',
        'Salary', 'Currency', 'Salary (USD)', 'Compa-ratio', 'Band position',
      ],
      rows.map((employee) => [
        employee.employeeNumber,
        employee.firstName,
        employee.lastName,
        employee.email,
        employee.jobTitle,
        employee.department,
        formatLevel(employee.level),
        employee.countryName,
        employee.employmentType,
        employee.status,
        employee.hireDate,
        // Major units, unformatted: a spreadsheet should receive a number it can add up,
        // not "$120,000.00" as text.
        employee.salary ? toMajorUnits(employee.salary) : '',
        employee.salary?.currency ?? '',
        employee.salaryBase ? toMajorUnits(employee.salaryBase) : '',
        employee.compaRatio !== null ? employee.compaRatio.toFixed(3) : '',
        employee.bandPosition ?? '',
      ]),
    );

    res.type('text/csv').attachment('acme-salaries.csv').send(csv);
  });

  router.get('/:id', async (req, res) => {
    const id = parseOrThrow(idParamSchema, req.params.id, 'employee id');
    const employee = await employees.findById(id);
    if (!employee) throw new NotFoundError(`Employee ${id}`);
    res.json(employee);
  });

  router.post('/', async (req, res) => {
    const input = parseOrThrow(createEmployeeSchema, req.body, 'employee');
    res.status(201).json(await employeeService.create(input));
  });

  router.patch('/:id', async (req, res) => {
    const id = parseOrThrow(idParamSchema, req.params.id, 'employee id');
    const input = parseOrThrow(updateEmployeeSchema, req.body, 'employee changes');
    res.json(await employeeService.update(id, input));
  });

  router.get('/:id/compensation', async (req, res) => {
    const id = parseOrThrow(idParamSchema, req.params.id, 'employee id');
    if (!(await employees.existsById(id))) throw new NotFoundError(`Employee ${id}`);
    res.json(await employees.compensationHistory(id));
  });

  router.post('/:id/compensation', async (req, res) => {
    const id = parseOrThrow(idParamSchema, req.params.id, 'employee id');
    const input = parseOrThrow(createCompensationChangeSchema, req.body, 'compensation change');
    res.status(201).json(await compensationService.recordChange(id, input));
  });

  return router;
}
