import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/render';
import { employeeSummary } from '../../test/fixtures';
import { EmployeeTable } from './EmployeeTable';

const employees = [
  employeeSummary(),
  employeeSummary({
    id: 2,
    firstName: 'Hank',
    lastName: 'Hughes',
    countryCode: 'US',
    countryName: 'United States',
    salary: { amountMinor: 8_000_000, currency: 'USD' },
    salaryBase: { amountMinor: 8_000_000, currency: 'USD' },
    compaRatio: 0.72,
    bandPosition: 'below',
  }),
];

const renderTable = (props: Partial<Parameters<typeof EmployeeTable>[0]> = {}) =>
  renderWithProviders(
    <EmployeeTable
      employees={employees}
      sort="name"
      direction="asc"
      onSort={() => {}}
      {...props}
    />,
  );

describe('the employee directory table', () => {
  it('shows each salary in its own currency and in the base currency', () => {
    renderTable();
    // ₹6,400,000 and its $80,000 equivalent are both on the row, because one is what
    // she is paid and the other is the only figure comparable with her US colleagues.
    const row = screen.getByText('Priya Sharma').closest('tr');
    expect(within(row!).getByText('₹6,400,000.00')).toBeInTheDocument();
    expect(within(row!).getByText('$80,000.00')).toBeInTheDocument();
  });

  it('labels who is paid outside their band', () => {
    renderTable();
    expect(screen.getByText('Below band')).toBeInTheDocument();
    expect(screen.getByText('In band')).toBeInTheDocument();
  });

  it('links each employee to their profile', () => {
    renderTable();
    expect(screen.getByRole('link', { name: 'Priya Sharma' })).toHaveAttribute(
      'href',
      '/employees/1',
    );
  });

  it('asks for a sort when a sortable heading is clicked', async () => {
    const onSort = vi.fn();
    const user = userEvent.setup();
    renderTable({ onSort });

    await user.click(screen.getByRole('button', { name: 'Sort by Salary' }));
    expect(onSort).toHaveBeenCalledWith('salary');
  });

  it('does not offer to sort by a column the API cannot sort on', () => {
    renderTable();
    // Salary (USD) is derived from the same order as Salary, so offering both would be
    // two controls for one behaviour.
    expect(screen.queryByRole('button', { name: 'Sort by Salary (USD)' })).not.toBeInTheDocument();
  });
});
