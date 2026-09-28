import { Card, Text } from '@mantine/core';
import { BarChart } from '@mantine/charts';
import { BASE_CURRENCY, money as makeMoney } from '@acme/shared';
import { useDistribution, type InsightFilters } from '../../api/queries';
import { QueryState } from '../../components/QueryState';
import { SERIES_1 } from '../../lib/chart';
import { moneyCompact } from '../../lib/format';

/**
 * How many people sit in each salary band across the organisation.
 *
 * A histogram, so the bars are adjacent by definition — the x-axis is continuous, and a
 * gap between bars would suggest salaries nobody earns. One series, so no legend.
 */
export function DistributionPanel({ filters }: { filters: InsightFilters }) {
  const query = useDistribution(filters, 12);
  const buckets = query.data?.buckets ?? [];

  const data = buckets.map((bucket) => ({
    range: moneyCompact(makeMoney(bucket.lowerMinor, BASE_CURRENCY)),
    people: bucket.count,
    exactRange: `${moneyCompact(makeMoney(bucket.lowerMinor, BASE_CURRENCY))} – ${moneyCompact(makeMoney(bucket.upperMinor, BASE_CURRENCY))}`,
  }));

  return (
    <Card withBorder padding="md" radius="md">
      <Text fw={600}>Salary distribution</Text>
      <Text size="xs" c="dimmed" mb="md">
        Employees per salary range, in {query.data?.baseCurrency ?? BASE_CURRENCY}
      </Text>

      <QueryState
        loading={query.isLoading}
        error={query.error}
        empty={buckets.length === 0}
        height={240}
      >
        <BarChart
          h={240}
          data={data}
          dataKey="range"
          series={[{ name: 'people', label: 'Employees', color: SERIES_1 }]}
          xAxisProps={{ interval: 1, tickFormatter: (value: string) => value }}
          yAxisProps={{ width: 44 }}
          barProps={{ radius: [4, 4, 0, 0] }}
          gridAxis="y"
          tickLine="none"
          withLegend={false}
          tooltipProps={{
            content: ({ payload }) => {
              const point = payload?.[0]?.payload as
                { exactRange: string; people: number } | undefined;
              if (!point) return null;
              return (
                <Card withBorder padding="xs" radius="sm" shadow="sm">
                  <Text size="xs" c="dimmed">
                    {point.exactRange}
                  </Text>
                  <Text size="sm" fw={600}>
                    {point.people.toLocaleString()} employees
                  </Text>
                </Card>
              );
            },
          }}
        />
        <Text size="xs" c="dimmed" ta="center" mt={4}>
          Each label marks the start of its range
        </Text>
      </QueryState>
    </Card>
  );
}
