import { createTheme, type MantineColorsTuple } from '@mantine/core';

const acme: MantineColorsTuple = [
  '#eef3ff',
  '#dce4f5',
  '#b9c7e2',
  '#94a8d0',
  '#748dc0',
  '#5f7cb7',
  '#5474b4',
  '#44639f',
  '#3a5890',
  '#2c4b80',
];

export const theme = createTheme({
  primaryColor: 'acme',
  colors: { acme },
  defaultRadius: 'md',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  // Salary figures are compared down a column, so they need to line up digit for digit.
  fontFamilyMonospace: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
  headings: { fontWeight: '600' },
});
