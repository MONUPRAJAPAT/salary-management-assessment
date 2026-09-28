import { Card, Group, Skeleton, Text, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  detail?: ReactNode;
  loading?: boolean;
  /** Lets a test address this card's value specifically — several cards can show the
   *  same figure, and a test that cannot say which one it means is not asserting much. */
  testId?: string;
}

export function StatCard({ label, value, hint, detail, loading, testId }: StatCardProps) {
  return (
    <Card withBorder padding="md" radius="md" h="100%">
      <Group gap={6} mb={4} wrap="nowrap">
        <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: 0.4 }}>
          {label}
        </Text>
        {hint && (
          <Tooltip label={hint} multiline w={280} withArrow>
            <IconInfoCircle size={14} style={{ color: 'var(--mantine-color-dimmed)' }} />
          </Tooltip>
        )}
      </Group>
      {loading ? (
        <Skeleton height={28} width="70%" />
      ) : (
        <Text fz={26} fw={600} lh={1.2} data-testid={testId}>
          {value}
        </Text>
      )}
      {detail && (
        <Text size="xs" c="dimmed" mt={6}>
          {detail}
        </Text>
      )}
    </Card>
  );
}
