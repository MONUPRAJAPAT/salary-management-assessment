import { afterEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/render';
import { ThemeToggle } from './ThemeToggle';

const STORAGE_KEY = 'mantine-color-scheme-value';

afterEach(() => localStorage.removeItem(STORAGE_KEY));

describe('the theme toggle', () => {
  it('offers to switch to dark when the page is light', async () => {
    renderWithProviders(<ThemeToggle />);
    expect(
      await screen.findByRole('button', { name: /switch to dark theme/i }),
    ).toBeInTheDocument();
  });

  it('switches the scheme when clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ThemeToggle />);

    await user.click(await screen.findByRole('button', { name: /switch to dark theme/i }));

    expect(document.documentElement.getAttribute('data-mantine-color-scheme')).toBe('dark');
    // The control now offers the way back, rather than repeating the same action.
    expect(
      await screen.findByRole('button', { name: /switch to light theme/i }),
    ).toBeInTheDocument();
  });

  it('remembers the choice, so a reload does not revert it', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ThemeToggle />);

    await user.click(await screen.findByRole('button', { name: /switch to dark theme/i }));
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
  });

  it('is reachable by keyboard and has a name a screen reader can use', async () => {
    renderWithProviders(<ThemeToggle />);
    const button = await screen.findByRole('button', { name: /switch to dark theme/i });
    button.focus();
    expect(button).toHaveFocus();
  });
});
