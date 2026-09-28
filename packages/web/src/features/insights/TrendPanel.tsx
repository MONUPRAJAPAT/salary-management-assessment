import { Card, SimpleGrid, Text, Tooltip } from '@mantine/core';
import { LineChart } from '@mantine/charts';
import { IconInfoCircle } from '@tabler/icons-react';
import { Group } from '@mantine/core';
import { usePayrollTrend, type InsightFilters } from '../../api/queries';
import { QueryState } from '../../components/QueryState';
import { axisMoney, exactMoney, SERIES_1, toChartValue } from '../../lib/chart';
import { monthLabel } from '../../lib/format';

/**
 * Payroll cost and headcount over the last two years.
 *
 * Two charts rather than one with two y-axes. Money and people have nothing to do with
 * each other numerically, and plotting them against two scales invites the reader to
 * see a relationship in whatever the axis ranges happen to make the lines do. Small
 * multiples share the x-axis and let the shapes be compared honestly.
 */
export function TrendPanel({ filters }: { filters: InsightFilters }) {
  const query = usePayrollTrend(filters, 24);
  const points = query.data?.points ?? [];

  const data = points.map((point) => ({
    month: monthLabel(point.month),
    payroll: toChartValue(point.payroll),
    headcount: point.headcount,
  }));

  return (
    <Card withBorder padding="md" radius="md">
      <Group gap={6} wrap="nowrap">
        <Text fw={600}>Payroll over time</Text>
        <Tooltip
          multiline
          w={320}
          withArrow
          label="The annual cost of today's people, replayed through their salary history. Because the model does not hold termination dates, this is not what payroll actually cost in a past month — it is how the cost of the current organisation has grown."
        >
          <IconInfoCircle size={14} style={{ color: 'var(--mantine-color-dimmed)' }} />
        </Tooltip>
      </Group>
      <Text size="xs" c="dimmed" mb="md">
        Annualised cost of the current roster, reconstructed from compensation history
      </Text>

      <QueryState
        loading={query.isLoading}
        error={query.error}
        empty={points.length === 0}
        height={220}
      >
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          <div>
            <Text size="xs" c="dimmed" mb={4}>
              Annual payroll ({query.data?.baseCurrency ?? 'USD'})
            </Text>
            <LineChart
              h={200}
              data={data}
              dataKey="month"
              series={[{ name: 'payroll', label: 'Annual payroll', color: SERIES_1 }]}
              valueFormatter={exactMoney}
              yAxisProps={{ width: 58, tickFormatter: axisMoney, domain: ['auto', 'auto'] }}
              xAxisProps={{ interval: Math.max(0, Math.floor(data.length / 6)) }}
              curveType="monotone"
              strokeWidth={2}
              withDots={false}
              gridAxis="y"
              tickLine="none"
              withLegend={false}
            />
          </div>
          <div>
            <Text size="xs" c="dimmed" mb={4}>
              Headcount
            </Text>
            <LineChart
              h={200}
              data={data}
              dataKey="month"
              series={[{ name: 'headcount', label: 'Headcount', color: SERIES_1 }]}
              valueFormatter={(value) => value.toLocaleString()}
              yAxisProps={{ width: 58, domain: ['auto', 'auto'] }}
              xAxisProps={{ interval: Math.max(0, Math.floor(data.length / 6)) }}
              curveType="monotone"
              strokeWidth={2}
              withDots={false}
              gridAxis="y"
              tickLine="none"
              withLegend={false}
            />
          </div>
        </SimpleGrid>
      </QueryState>
    </Card>
  );
}
