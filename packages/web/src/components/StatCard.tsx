import { Card, Group, Skeleton, Text, ThemeIcon, Tooltip } from '@mantine/core';
import { IconInfoCircle, type IconProps } from '@tabler/icons-react';
import type { ComponentType, ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  detail?: ReactNode;
  loading?: boolean;
  icon?: ComponentType<IconProps>;
  /** Draws attention only when the figure warrants it — see `accent` below. */
  accent?: 'neutral' | 'warning' | 'critical';
  /** Lets a test address this card's value specifically. */
  testId?: string;
}

const ACCENT_COLOR = {
  neutral: undefined,
  warning: 'var(--viz-warning)',
  critical: 'var(--viz-critical)',
} as const;

/**
 * A single headline figure.
 *
 * `accent` is applied by the caller only when the number means something is wrong — a row
 * of four permanently-coloured cards teaches the eye to ignore colour, which is exactly
 * the signal you want available when one of them turns red.
 */
export function StatCard({
  label,
  value,
  hint,
  detail,
  loading,
  icon: Icon,
  accent = 'neutral',
  testId,
}: StatCardProps) {
  return (
    <Card h="100%">
      <Group justify="space-between" align="flex-start" wrap="nowrap" mb={6}>
        <Group gap={6} wrap="nowrap">
          <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: 0.4 }}>
            {label}
          </Text>
          {hint && (
            <Tooltip label={hint} multiline w={280}>
              <IconInfoCircle
                size={14}
                style={{ color: 'var(--mantine-color-dimmed)', flexShrink: 0 }}
              />
            </Tooltip>
          )}
        </Group>
        {Icon && (
          <ThemeIcon
            variant="light"
            size={30}
            radius="md"
            color={accent === 'neutral' ? undefined : 'gray'}
          >
            <Icon size={16} style={{ color: ACCENT_COLOR[accent] }} />
          </ThemeIcon>
        )}
      </Group>

      {loading ? (
        <Skeleton height={30} width="70%" />
      ) : (
        <Text
          fz={28}
          fw={650}
          lh={1.15}
          data-testid={testId}
          style={{ color: ACCENT_COLOR[accent] }}
        >
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
