import { describe, expect, it } from 'vitest';
import { theme } from './theme';

/**
 * These assert configuration, not behaviour, which is normally a weak thing to test.
 * They earn their place because jsdom has no layout engine: a control that is stretched,
 * clipped, or growing a row taller on every click is indistinguishable from a correct one
 * to every other test in this suite. Three such bugs shipped before being spotted by eye.
 * A future refactor silently dropping one of these fixes would again go unnoticed.
 */
describe('theme guards against layout regressions', () => {
  it('caps the MultiSelect pill area so a filter row cannot grow unbounded', () => {
    const multiSelect = theme.components?.MultiSelect;
    const styles = multiSelect?.styles as { input?: { maxHeight?: string; overflowY?: string } };

    expect(styles?.input?.maxHeight).toBeDefined();
    expect(styles?.input?.overflowY).toBe('auto');
  });

  it('hides already-picked options, so the dropdown shrinks as values are chosen', () => {
    expect(theme.components?.MultiSelect?.defaultProps).toMatchObject({
      hidePickedOptions: true,
    });
  });

  it('steps the primary colour up in dark mode rather than reusing the light swatch', () => {
    // A mid-blue reads washed out against a dark surface. Reusing one step for both is
    // what makes a dark theme look muddy.
    expect(theme.primaryShade).toEqual({ light: 6, dark: 4 });
  });

  it('gives cards a border by default, so no call site can forget one', () => {
    expect(theme.components?.Card?.defaultProps).toMatchObject({ withBorder: true });
  });
});
