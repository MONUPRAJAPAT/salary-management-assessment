import { ActionIcon, Tooltip, useComputedColorScheme, useMantineColorScheme } from '@mantine/core';
import { IconMoon, IconSun } from '@tabler/icons-react';

/**
 * Light/dark toggle.
 *
 * The scheme starts as `auto` — following the operating system — and this switches to an
 * explicit choice, which Mantine persists to localStorage. `getInitialValueInEffect`
 * keeps the first render consistent with what the server-free HTML already painted, so
 * the icon does not flip after hydration.
 */
export function ThemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const computed = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const next = computed === 'dark' ? 'light' : 'dark';

  return (
    <Tooltip label={`Switch to ${next} theme`}>
      <ActionIcon
        onClick={() => setColorScheme(next)}
        variant="default"
        size="lg"
        aria-label={`Switch to ${next} theme`}
      >
        {computed === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
      </ActionIcon>
    </Tooltip>
  );
}
