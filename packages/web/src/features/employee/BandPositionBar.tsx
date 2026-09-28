import { Box, Group, Text, Tooltip } from '@mantine/core';
import { money as makeMoney, type CurrencyCode } from '@acme/shared';
import { moneyCompact } from '../../lib/format';

/**
 * Where a salary sits inside its band, drawn to scale.
 *
 * A compa-ratio of 0.83 is a number you have to interpret. A marker sitting a third of
 * the way along a bar is a thing you can see, and the difference matters when the
 * question is "does this person need a raise".
 *
 * The axis extends 15% past each end of the band so that someone paid outside it still
 * has a visible position rather than being pinned to the edge.
 */
export function BandPositionBar({
  salaryMinor,
  band,
  currency,
}: {
  salaryMinor: number;
  band: { minMinor: number; midMinor: number; maxMinor: number };
  currency: CurrencyCode;
}) {
  const span = band.maxMinor - band.minMinor || 1;
  const axisMin = band.minMinor - span * 0.15;
  const axisMax = band.maxMinor + span * 0.15;
  const position = (value: number) =>
    `${Math.min(100, Math.max(0, ((value - axisMin) / (axisMax - axisMin)) * 100))}%`;

  const outside =
    salaryMinor < band.minMinor ? 'below' : salaryMinor > band.maxMinor ? 'above' : null;
  const markerColour =
    outside === 'below'
      ? 'var(--mantine-color-red-6)'
      : outside === 'above'
        ? 'var(--mantine-color-yellow-6)'
        : 'var(--mantine-color-acme-6)';

  return (
    <Box>
      <Box pos="relative" h={34}>
        {/* The band itself */}
        <Box
          pos="absolute"
          top={12}
          h={10}
          left={position(band.minMinor)}
          right={`${100 - parseFloat(position(band.maxMinor))}%`}
          style={{
            background: 'var(--mantine-color-default-border)',
            borderRadius: 5,
          }}
        />
        {/* Midpoint */}
        <Tooltip label={`Midpoint ${moneyCompact(makeMoney(band.midMinor, currency))}`} withArrow>
          <Box
            pos="absolute"
            top={8}
            left={position(band.midMinor)}
            w={2}
            h={18}
            style={{ background: 'var(--mantine-color-dimmed)', transform: 'translateX(-1px)' }}
          />
        </Tooltip>
        {/* This employee */}
        <Tooltip label={`Paid ${moneyCompact(makeMoney(salaryMinor, currency))}`} withArrow>
          <Box
            pos="absolute"
            top={5}
            left={position(salaryMinor)}
            w={12}
            h={24}
            style={{
              background: markerColour,
              borderRadius: 3,
              transform: 'translateX(-6px)',
              border: '2px solid var(--mantine-color-body)',
            }}
          />
        </Tooltip>
      </Box>
      <Group justify="space-between" gap={4}>
        <Text size="xs" c="dimmed" className="tabular">
          {moneyCompact(makeMoney(band.minMinor, currency))}
        </Text>
        <Text size="xs" c="dimmed">
          band for this level and country
        </Text>
        <Text size="xs" c="dimmed" className="tabular">
          {moneyCompact(makeMoney(band.maxMinor, currency))}
        </Text>
      </Group>
    </Box>
  );
}
