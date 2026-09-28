import { Alert, Center, Loader, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconMoodEmpty } from '@tabler/icons-react';
import type { ReactNode } from 'react';

/**
 * One place for the three states every data view has. Without this, "loading" and
 * "failed" get reinvented per screen and one of them ends up rendering nothing at all.
 */
export function QueryState({
  loading,
  error,
  empty,
  emptyMessage = 'Nothing matches these filters.',
  height = 180,
  children,
}: {
  loading?: boolean;
  error?: unknown;
  empty?: boolean;
  emptyMessage?: string;
  height?: number;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <Center h={height}>
        <Loader size="sm" />
      </Center>
    );
  }

  if (error) {
    return (
      <Alert color="red" icon={<IconAlertTriangle size={18} />} title="Could not load this">
        {error instanceof Error ? error.message : 'An unexpected error occurred.'}
      </Alert>
    );
  }

  if (empty) {
    return (
      <Center h={height}>
        <Stack align="center" gap={6}>
          <IconMoodEmpty size={28} style={{ color: 'var(--mantine-color-dimmed)' }} />
          <Text size="sm" c="dimmed">
            {emptyMessage}
          </Text>
        </Stack>
      </Center>
    );
  }

  return <>{children}</>;
}
