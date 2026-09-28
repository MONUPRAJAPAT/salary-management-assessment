import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/render';
import { mockApi } from '../../test/mock-api';
import { InsightsPage } from './InsightsPage';

afterEach(() => vi.unstubAllGlobals());

/**
 * The dashboard mounts five panels, four of which render charts. Charts are the
 * components most likely to throw at render time and the least likely to be caught by
 * anything else, so this test exists mainly to mount the whole page for real.
 */
describe('the insights dashboard', () => {
  it('renders the headline figures', async () => {
    mockApi();
    renderWithProviders(<InsightsPage />);

    expect(await screen.findByText('9,812')).toBeInTheDocument(); // headcount
    expect(await screen.findByText('$885,199,113.54')).toBeInTheDocument(); // payroll
    expect(await screen.findByText('$77,018.82')).toBeInTheDocument(); // median
    expect(await screen.findByText('369')).toBeInTheDocument(); // 211 below + 158 above
  });

  it('states the exchange-rate date, because a converted figure without one is not reproducible', async () => {
    mockApi();
    renderWithProviders(<InsightsPage />);
    expect(await screen.findByText(/rates of 2026-01-01/)).toBeInTheDocument();
  });

  it('renders every panel without throwing', async () => {
    mockApi();
    renderWithProviders(<InsightsPage />);

    expect(await screen.findByText(/Median salary by country/)).toBeInTheDocument();
    expect(await screen.findByText('Salary distribution')).toBeInTheDocument();
    expect(await screen.findByText('Salary band health')).toBeInTheDocument();
    expect(await screen.findByText('Pay equity')).toBeInTheDocument();
    expect(await screen.findByText('Payroll over time')).toBeInTheDocument();
  });

  it('shows the pay gap and names the groups it is withholding', async () => {
    mockApi();
    renderWithProviders(<InsightsPage />);

    // 6.55 renders as +6.5%: (6.55).toFixed(1) is '6.5' in JavaScript, because 6.55 is
    // not exactly representable. Display-only rounding, but worth asserting knowingly.
    expect(await screen.findByText('+6.5%')).toBeInTheDocument();
    // Legal has three of each gender, under the disclosure threshold.
    expect(await screen.findByText(/1 group withheld/)).toBeInTheDocument();
    expect(await screen.findByText(/Legal · 6/)).toBeInTheDocument();
  });

  it('offers the actionable list, not just the below-band count', async () => {
    mockApi();
    renderWithProviders(<InsightsPage />);

    // The count and its label are separate elements so the number can be emphasised,
    // and textContent bubbles, so several ancestors match. Any of them proves it rendered.
    const belowBand = await screen.findAllByText(
      (_, element) => element?.textContent === '211 below band',
    );
    expect(belowBand.length).toBeGreaterThan(0);
    expect(await screen.findByRole('link', { name: 'Meera Rao' })).toBeInTheDocument();
  });

  it('warns when employees have no salary on record', async () => {
    mockApi({
      '/api/analytics/overview': {
        ...(await import('../../test/mock-api')).overview,
        missingCompensationCount: 3,
      },
    });
    renderWithProviders(<InsightsPage />);

    expect(await screen.findByText(/3 employees have no salary on record/)).toBeInTheDocument();
  });
});
