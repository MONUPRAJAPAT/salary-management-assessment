import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

/**
 * jsdom implements neither of these, and Mantine uses both — matchMedia for responsive
 * props and colour scheme, ResizeObserver for anything that measures itself. Without
 * them every component test fails on mount for reasons that have nothing to do with the
 * component.
 */
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

window.scrollTo = vi.fn();
