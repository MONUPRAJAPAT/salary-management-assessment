import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../test/render';
import { mockApi } from '../../test/mock-api';
import { employeeDetail } from '../../test/fixtures';
import { EmployeePage } from './EmployeePage';

afterEach(() => vi.unstubAllGlobals());

const renderProfile = (route = '/employees/1') =>
  renderWithProviders(
    <Routes>
      <Route path="/employees/:id" element={<EmployeePage />} />
    </Routes>,
    { route },
  );

describe('the employee profile', () => {
  it('shows current pay in local currency and in the base currency', async () => {
    mockApi();
    renderProfile();

    expect(await screen.findByRole('heading', { name: 'Priya Sharma' })).toBeInTheDocument();
    expect(await screen.findByTestId('current-salary')).toHaveTextContent('₹6,400,000.00');
    expect(await screen.findByText(/\$80,000\.00 at the pinned rate/)).toBeInTheDocument();
  });

  it('shows the full append-only history with each change', async () => {
    mockApi();
    renderProfile();

    expect(await screen.findByText('2 records · append-only')).toBeInTheDocument();
    expect(await screen.findByText('+6.7%')).toBeInTheDocument();
    expect(await screen.findByText('New hire')).toBeInTheDocument();
  });

  it('marks a future-dated change as scheduled rather than hiding it', async () => {
    mockApi({
      '/api/employees/1': employeeDetail({
        compensationHistory: [
          {
            id: 3,
            effectiveFrom: '2099-01-01',
            amount: { amountMinor: 900_000_000, currency: 'INR' },
            amountBase: { amountMinor: 11_250_000, currency: 'USD' },
            changeReason: 'promotion',
            note: null,
            recordedAt: '2026-09-01 09:00:00',
            changeFromPreviousPercent: 40.6,
          },
          ...employeeDetail().compensationHistory,
        ],
      }),
    });
    renderProfile();

    expect(await screen.findByText('Scheduled')).toBeInTheDocument();
    // The 2099 promotion is listed, and it is not today's pay.
    expect(await screen.findByText('₹9,000,000.00')).toBeInTheDocument();
    expect(await screen.findByTestId('current-salary')).toHaveTextContent('₹6,400,000.00');
  });

  it('opens the compensation change form', async () => {
    mockApi();
    const user = userEvent.setup();
    renderProfile();

    await user.click(await screen.findByRole('button', { name: /record change/i }));
    expect(
      await screen.findByRole('heading', { name: 'Record a compensation change' }),
    ).toBeInTheDocument();
  });

  it('says plainly that salary is not editable from the edit form', async () => {
    mockApi();
    const user = userEvent.setup();
    renderProfile();

    await user.click(await screen.findByRole('button', { name: /edit/i }));
    expect(await screen.findByText(/Salary is not editable here/i)).toBeInTheDocument();
  });

  it('reports a missing employee instead of rendering an empty profile', async () => {
    mockApi({ '/api/employees/1': undefined });
    renderProfile();

    expect(await screen.findByText('Could not load this')).toBeInTheDocument();
  });
});
