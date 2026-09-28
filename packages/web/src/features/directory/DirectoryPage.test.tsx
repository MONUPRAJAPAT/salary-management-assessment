import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/render';
import { mockApi } from '../../test/mock-api';
import { DirectoryPage } from './DirectoryPage';

afterEach(() => vi.unstubAllGlobals());

describe('the employee directory page', () => {
  it('lists employees with their salary in both currencies', async () => {
    mockApi();
    renderWithProviders(<DirectoryPage />, { route: '/employees' });

    expect(await screen.findByRole('link', { name: 'Priya Sharma' })).toBeInTheDocument();
    expect(await screen.findByText('₹6,400,000.00')).toBeInTheDocument();
    expect(await screen.findByText('2 matching')).toBeInTheDocument();
  });

  it('points the export button at the current filters, not the whole company', async () => {
    mockApi();
    renderWithProviders(<DirectoryPage />, { route: '/employees?country=IN&bandPosition=below' });

    const exportLink = await screen.findByRole('link', { name: /export csv/i });
    expect(exportLink).toHaveAttribute('href', expect.stringContaining('country=IN'));
    expect(exportLink).toHaveAttribute('href', expect.stringContaining('bandPosition=below'));
    // Paging parameters are dropped: an export is the whole filtered set, not one page.
    expect(exportLink.getAttribute('href')).not.toContain('pageSize');
  });

  it('reflects filters already present in the URL', async () => {
    mockApi();
    renderWithProviders(<DirectoryPage />, { route: '/employees?search=priya&country=IN' });

    expect(await screen.findByDisplayValue('priya')).toBeInTheDocument();
    expect(await screen.findByText(/2 filters applied/)).toBeInTheDocument();
  });

  it('opens the add-employee form', async () => {
    mockApi();
    const user = userEvent.setup();
    renderWithProviders(<DirectoryPage />, { route: '/employees' });

    await user.click(await screen.findByRole('button', { name: /add employee/i }));
    expect(await screen.findByRole('heading', { name: 'Add an employee' })).toBeInTheDocument();
    expect(screen.getByText(/An employee cannot be created without a salary/i)).toBeInTheDocument();
  });

  it('explains an empty result rather than showing a blank table', async () => {
    mockApi({ '/api/employees': { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 } });
    renderWithProviders(<DirectoryPage />, { route: '/employees?search=nobody' });

    expect(await screen.findByText('No employees match these filters.')).toBeInTheDocument();
  });

  it('surfaces a failed request instead of rendering nothing', async () => {
    mockApi({ '/api/employees': undefined });
    renderWithProviders(<DirectoryPage />, { route: '/employees' });

    expect(await screen.findByText('Could not load this')).toBeInTheDocument();
  });
});
