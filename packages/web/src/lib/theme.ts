import { createTheme, rem, type MantineColorsTuple } from '@mantine/core';

/**
 * A ten-step brand scale rather than a Mantine default, so the primary colour is a
 * deliberate choice. Steps 0–2 are surfaces and hovers, 6 is the light-mode primary and
 * 4 the dark-mode one — a mid-blue reads as washed out against a dark surface, so the
 * theme steps *up* in dark rather than reusing the same swatch.
 */
const brand: MantineColorsTuple = [
  '#eef2ff',
  '#dce3fb',
  '#b5c4f4',
  '#8ba3ed',
  '#6887e7',
  '#5175e4',
  '#446ce3',
  '#365cca',
  '#2d51b6',
  '#1f45a1',
];

export const theme = createTheme({
  primaryColor: 'brand',
  colors: { brand },
  primaryShade: { light: 6, dark: 4 },
  defaultRadius: 'md',

  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  // Salary figures are read by comparing digits down a column, so they need to align.
  fontFamilyMonospace: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',

  headings: {
    fontWeight: '650',
    sizes: {
      h1: { fontSize: '1.75rem', lineHeight: '1.25' },
      h2: { fontSize: '1.375rem', lineHeight: '1.3' },
      h3: { fontSize: '1.125rem', lineHeight: '1.35' },
    },
  },

  /**
   * Defaults, not per-component props. Setting `withBorder` on twenty Cards by hand is
   * how a UI drifts: one gets missed, and the inconsistency reads as carelessness rather
   * than as a choice.
   */
  components: {
    Card: { defaultProps: { withBorder: true, radius: 'md', padding: 'md' } },
    Paper: { defaultProps: { radius: 'md' } },
    Modal: { defaultProps: { centered: true, radius: 'md', overlayProps: { blur: 2 } } },
    Tooltip: { defaultProps: { withArrow: true, openDelay: 200 } },
    Badge: { defaultProps: { radius: 'sm' } },
    Alert: { defaultProps: { radius: 'md' } },
    Table: { defaultProps: { highlightOnHover: true, verticalSpacing: 'xs' } },
    Button: { defaultProps: { radius: 'md' } },
    ActionIcon: { defaultProps: { radius: 'md' } },
    TextInput: { defaultProps: { radius: 'md' } },
    Select: { defaultProps: { radius: 'md' } },
    /**
     * A MultiSelect grows a row taller with every pill it has to fit, so a filter bar of
     * six of them jumps around as you narrow a search — the control you are about to
     * click moves out from under the cursor.
     *
     * Capping the pill area bounds that to a single step and then scrolls. Combined with
     * `hidePickedOptions` the dropdown also shrinks as you select, so picking several
     * values stays a small, stable interaction.
     */
    MultiSelect: {
      defaultProps: { radius: 'md', hidePickedOptions: true },
      styles: { input: { maxHeight: rem(66), overflowY: 'auto' as const } },
    },
    NumberInput: { defaultProps: { radius: 'md' } },
  },
});
