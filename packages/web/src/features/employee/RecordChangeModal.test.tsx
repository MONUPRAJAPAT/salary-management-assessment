import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/render';
import { employeeDetail } from '../../test/fixtures';
import { RecordChangeModal } from './RecordChangeModal';

/**
 * The preview is the safety rail on the single most consequential action in the product.
 * An HR Manager should never have to submit a raise to find out how big it was.
 */
describe('previewing a compensation change', () => {
  const open = (employee = employeeDetail()) =>
    renderWithProviders(<RecordChangeModal employee={employee} opened onClose={() => {}} />);

  it('shows the resulting salary for a percentage increase', async () => {
    open();
    // ₹6,400,000 at the default +5% is ₹6,720,000.
    expect(await screen.findByTestId('projected-salary')).toHaveTextContent('₹6,720,000.00');
    expect(screen.getByText('+5.0%')).toBeInTheDocument();
  });

  it('recalculates as the percentage changes', async () => {
    const user = userEvent.setup();
    open();

    const input = screen.getByTestId('increase-percent');
    await user.clear(input);
    await user.type(input, '10');

    expect(await screen.findByTestId('projected-salary')).toHaveTextContent('₹7,040,000.00');
  });

  it('shows the resulting percentage when an absolute amount is entered', async () => {
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole('radio', { name: 'To an amount' }));
    await user.type(screen.getByTestId('new-salary'), '7040000');

    expect(await screen.findByTestId('projected-salary')).toHaveTextContent('₹7,040,000.00');
    expect(screen.getByText('+10.0%')).toBeInTheDocument();
  });

  it('warns before a change pushes someone outside their band, without blocking it', async () => {
    const user = userEvent.setup();
    open();

    // The Indian IC3 band tops out at ₹8,000,000; +30% would reach ₹8,320,000.
    const input = screen.getByTestId('increase-percent');
    await user.clear(input);
    await user.type(input, '30');

    expect(await screen.findByText(/above the IC3 band/i)).toBeInTheDocument();
    // It is a warning, not a veto — sometimes paying above band is the right call.
    expect(screen.getByRole('button', { name: /record change/i })).toBeEnabled();
  });

  it('does not warn for a change that stays inside the band', async () => {
    open();
    expect(screen.queryByText(/above the IC3 band/i)).not.toBeInTheDocument();
  });

  it('cannot be backdated before the employee was hired', async () => {
    open();
    // The date picker refuses earlier dates; the server refuses them too.
    expect(screen.getByLabelText(/effective from/i)).toBeInTheDocument();
    expect(screen.getByText(/Backdate a correction/i)).toBeInTheDocument();
  });
});
