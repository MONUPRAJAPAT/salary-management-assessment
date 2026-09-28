import { useState } from 'react';
import { Card, Group, SegmentedControl, Stack, Table, Text } from '@mantine/core';
import { BarChart } from '@mantine/charts';
import { ANALYTICS_DIMENSIONS, formatLevel, humanise, type AnalyticsDimension } from '@acme/shared';
import { useBreakdown, type InsightFilters } from '../../api/queries';
import { QueryState } from '../../components/QueryState';
import { axisMoney, exactMoney, SERIES_1, toChartValue } from '../../lib/chart';
import { count, money, percent } from '../../lib/format';

const LABEL: Record<AnalyticsDimension, string> = {
  country: 'Country',
  department: 'Department',
  level: 'Level',
  gender: 'Gender',
};

/**
 * Median pay by whichever dimension the HR Manager picks.
 *
 * Horizontal bars, because the categories are named things of varying length ranked by
 * magnitude — vertical bars would need rotated labels at eleven departments. One series,
 * so no legend: the heading says what the bars are.
 *
 * The table is not decoration. The chart answers "who is paid most"; the table answers
 * "by how much, over how many people, and how wide is the spread" — and it is the
 * accessible reading of the same data.
 */
export function BreakdownPanel({ filters }: { filters: InsightFilters }) {
  const [dimension, setDimension] = useState<AnalyticsDimension>('country');
  const query = useBreakdown(dimension, filters);
  const rows = query.data?.rows ?? [];

  const chartData = rows.map((row) => ({
    label: dimension === 'level' ? formatLevel(row.label as never) : humanise(row.label),
    median: toChartValue(row.medianSalary),
  }));

  return (
    <Card withBorder padding="md" radius="md">
      <Group justify="space-between" mb="md" wrap="wrap" gap="xs">
        <div>
          <Text fw={600}>Median salary by {LABEL[dimension].toLowerCase()}</Text>
          <Text size="xs" c="dimmed">
            Converted to {query.data?.baseCurrency ?? 'USD'} at the rates of{' '}
            {query.data?.fxAsOf ?? '—'}
          </Text>
        </div>
        <SegmentedControl
          size="xs"
          value={dimension}
          onChange={(value) => setDimension(value as AnalyticsDimension)}
          data={ANALYTICS_DIMENSIONS.map((item) => ({ value: item, label: LABEL[item] }))}
        />
      </Group>

      <QueryState
        loading={query.isLoading}
        error={query.error}
        empty={rows.length === 0}
        height={260}
      >
        <Stack gap="lg">
          <BarChart
            h={Math.max(220, chartData.length * 32)}
            data={chartData}
            dataKey="label"
            orientation="vertical"
            series={[{ name: 'median', label: 'Median salary', color: SERIES_1 }]}
            valueFormatter={exactMoney}
            xAxisProps={{ tickFormatter: axisMoney }}
            yAxisProps={{ width: 132 }}
            barProps={{ radius: [0, 4, 4, 0], barSize: 14 }}
            gridAxis="x"
            tickLine="none"
            withLegend={false}
          />

          <Table.ScrollContainer minWidth={620}>
            <Table verticalSpacing={6} horizontalSpacing="md" fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{LABEL[dimension]}</Table.Th>
                  <Table.Th ta="right">People</Table.Th>
                  <Table.Th ta="right">Median</Table.Th>
                  <Table.Th ta="right">p25 – p75</Table.Th>
                  <Table.Th ta="right">Payroll</Table.Th>
                  <Table.Th ta="right">Share</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((row) => (
                  <Table.Tr key={row.key}>
                    <Table.Td>
                      {dimension === 'level'
                        ? formatLevel(row.label as never)
                        : humanise(row.label)}
                    </Table.Td>
                    <Table.Td ta="right" className="tabular">
                      {count(row.headcount)}
                    </Table.Td>
                    <Table.Td ta="right" className="tabular" fw={500}>
                      {money(row.medianSalary)}
                    </Table.Td>
                    <Table.Td ta="right" className="tabular" c="dimmed">
                      {money(row.p25Salary)} – {money(row.p75Salary)}
                    </Table.Td>
                    <Table.Td ta="right" className="tabular">
                      {money(row.totalPayroll)}
                    </Table.Td>
                    <Table.Td ta="right" className="tabular" c="dimmed">
                      {percent(row.payrollShare * 100)}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Stack>
      </QueryState>
    </Card>
  );
}
