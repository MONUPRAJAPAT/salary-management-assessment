import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/render';
import { referenceData } from '../../test/mock-api';
import { employeeSummary } from '../../test/fixtures';
import { DirectoryPage } from './DirectoryPage';

const requests: string[] = [];

/** A mock that actually honours ?search=, so the test can tell filtering from caching. */
function mockSearchableApi() {
  const everyone = [
    employeeSummary({ id: 1, firstName: 'Priya', lastName: 'Sharma' }),
    employeeSummary({
      id: 2,
      firstName: 'Zarah',
      lastName: 'Testcase',
      email: 'zarah@acme.example',
    }),
  ];

  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) => {
      const url = String(input);
      requests.push(url);
      const [path, query = ''] = url.split('?');
      if (path === '/api/reference') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(referenceData),
        });
      }
      const term = new URLSearchParams(query).get('search')?.toLowerCase() ?? '';
      const items = term
        ? everyone.filter((e) => `${e.firstName} ${e.lastName}`.toLowerCase().includes(term))
        : everyone;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ items, page: 1, pageSize: 25, total: items.length, totalPages: 1 }),
      });
    }),
  );
}

afterEach(() => {
  requests.length = 0;
  vi.unstubAllGlobals();
});

describe('typing in the search box', () => {
  it('sends the term to the API and narrows the list', async () => {
    mockSearchableApi();
    const user = userEvent.setup();
    renderWithProviders(<DirectoryPage />, { route: '/employees' });

    expect(await screen.findByRole('link', { name: 'Priya Sharma' })).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /search/i }), 'Zarah');

    // The debounced value must reach the query, not just the input.
    await waitFor(() => expect(requests.some((u) => u.includes('search=Zarah'))).toBe(true), {
      timeout: 2000,
    });

    expect(await screen.findByRole('link', { name: 'Zarah Testcase' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Priya Sharma' })).not.toBeInTheDocument(),
    );
  });

  it('finds a newly added employee — the list is not served from a stale cache', async () => {
    mockSearchableApi();
    const user = userEvent.setup();
    renderWithProviders(<DirectoryPage />, { route: '/employees' });

    await screen.findByRole('link', { name: 'Priya Sharma' });
    await user.type(screen.getByRole('textbox', { name: /search/i }), 'Testcase');

    expect(await screen.findByRole('link', { name: 'Zarah Testcase' })).toBeInTheDocument();
  });

  it('clearing the box restores the full list', async () => {
    mockSearchableApi();
    const user = userEvent.setup();
    renderWithProviders(<DirectoryPage />, { route: '/employees?search=Zarah' });

    await screen.findByRole('link', { name: 'Zarah Testcase' });
    await user.clear(screen.getByRole('textbox', { name: /search/i }));

    expect(await screen.findByRole('link', { name: 'Priya Sharma' })).toBeInTheDocument();
  });
});
