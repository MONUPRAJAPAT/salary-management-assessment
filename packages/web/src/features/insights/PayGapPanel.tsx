import { useState } from 'react';
import { Alert, Badge, Card, Group, SegmentedControl, Stack, Table, Text } from '@mantine/core';
import { BarChart } from '@mantine/charts';
import { IconInfoCircle } from '@tabler/icons-react';
import { formatLevel, humanise, type PayGapRow } from '@acme/shared';
import { usePayGap, type InsightFilters } from '../../api/queries';
import { QueryState } from '../../components/QueryState';
import { axisMoney, exactMoney, SERIES_1, SERIES_2, toChartValue } from '../../lib/chart';
import { count, money, signedPercent } from '../../lib/format';

type GroupBy = 'department' | 'level' | 'country';

const medianFor = (row: PayGapRow, gender: string) =>
  row.groups.find((group) => group.gender === gender)?.medianSalary ?? null;

/**
 * Median pay for women against men.
 *
 * Two series, so a legend is always shown and both bars are direct-labelled — identity
 * never rests on colour alone. Groups below the disclosure threshold arrive from the
 * server with no figures at all, and are shown as explicitly withheld rather than
 * silently dropped: "we are not telling you" and "there is nobody here" are different
 * answers, and an HR Manager needs to be able to tell them apart.
 */
export function PayGapPanel({ filters }: { filters: InsightFilters }) {
  const [groupBy, setGroupBy] = useState<GroupBy>('department');
  const query = usePayGap(groupBy, filters);
  const report = query.data;

  const disclosed = (report?.rows ?? []).filter(
    (row) => medianFor(row, 'female') !== null && medianFor(row, 'male') !== null,
  );
  const suppressed = (report?.rows ?? []).filter((row) => !disclosed.includes(row));

  const chartData = disclosed.map((row) => ({
    label: groupBy === 'level' ? formatLevel(row.label as never) : humanise(row.label),
    women: toChartValue(medianFor(row, 'female')),
    men: toChartValue(medianFor(row, 'male')),
  }));

  return (
    <Card withBorder padding="md" radius="md">
      <Group justify="space-between" mb="md" wrap="wrap" gap="xs">
        <div>
          <Text fw={600}>Pay equity</Text>
          <Text size="xs" c="dimmed">
            Median pay, women against men. A positive gap means women are paid less.
          </Text>
        </div>
        <SegmentedControl
          size="xs"
          value={groupBy}
          onChange={(value) => setGroupBy(value as GroupBy)}
          data={[
            { value: 'department', label: 'Department' },
            { value: 'level', label: 'Level' },
            { value: 'country', label: 'Country' },
          ]}
        />
      </Group>

      <QueryState loading={query.isLoading} error={query.error} height={260}>
        <Stack gap="md">
          {report && (
            <Card withBorder padding="sm" radius="sm" bg="var(--mantine-color-default-hover)">
              <Group justify="space-between" wrap="wrap">
                <div>
                  <Text size="sm" fw={600}>
                    Whole organisation
                  </Text>
                  <Text size="xs" c="dimmed">
                    {count(report.overall.headcount)} people with a salary on record
                  </Text>
                </div>
                <Group gap="lg">
                  {report.overall.groups
                    .filter((group) => group.gender === 'female' || group.gender === 'male')
                    .map((group) => (
                      <div key={group.gender}>
                        <Text size="xs" c="dimmed">
                          {humanise(group.gender)} · {count(group.headcount)}
                        </Text>
                        <Text size="sm" fw={600} className="tabular">
                          {group.suppressed ? 'Withheld' : money(group.medianSalary)}
                        </Text>
                      </div>
                    ))}
                  <div>
                    <Text size="xs" c="dimmed">
                      Median gap
                    </Text>
                    <Text
                      size="sm"
                      fw={700}
                      className="tabular"
                      c={
                        report.overall.gapPercent === null
                          ? undefined
                          : report.overall.gapPercent > 0
                            ? 'red'
                            : 'teal'
                      }
                    >
                      {signedPercent(report.overall.gapPercent)}
                    </Text>
                  </div>
                </Group>
              </Group>
            </Card>
          )}

          {chartData.length > 0 && (
            <BarChart
              h={Math.max(200, chartData.length * 44)}
              data={chartData}
              dataKey="label"
              orientation="vertical"
              series={[
                { name: 'women', label: 'Women', color: SERIES_1 },
                { name: 'men', label: 'Men', color: SERIES_2 },
              ]}
              valueFormatter={exactMoney}
              xAxisProps={{ tickFormatter: axisMoney }}
              yAxisProps={{ width: 132 }}
              barProps={{ radius: [0, 4, 4, 0], barSize: 12 }}
              gridAxis="x"
              tickLine="none"
              withLegend
              legendProps={{ verticalAlign: 'top' }}
            />
          )}

          {disclosed.length > 0 && (
            <Table verticalSpacing={6} fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Group</Table.Th>
                  <Table.Th ta="right">Women</Table.Th>
                  <Table.Th ta="right">Men</Table.Th>
                  <Table.Th ta="right">Gap</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {disclosed.map((row) => (
                  <Table.Tr key={row.key}>
                    <Table.Td>
                      {groupBy === 'level' ? formatLevel(row.label as never) : humanise(row.label)}
                    </Table.Td>
                    <Table.Td ta="right" className="tabular">
                      {money(medianFor(row, 'female'))}
                    </Table.Td>
                    <Table.Td ta="right" className="tabular">
                      {money(medianFor(row, 'male'))}
                    </Table.Td>
                    <Table.Td
                      ta="right"
                      className="tabular"
                      c={row.gapPercent === null ? undefined : row.gapPercent > 0 ? 'red' : 'teal'}
                      fw={600}
                    >
                      {signedPercent(row.gapPercent)}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}

          {suppressed.length > 0 && (
            <Alert color="gray" variant="light" icon={<IconInfoCircle size={16} />}>
              <Text size="sm" mb={6}>
                {suppressed.length} group{suppressed.length === 1 ? '' : 's'} withheld: fewer than{' '}
                {report?.minimumGroupSize} people of a gender, where publishing a median would
                expose an individual&rsquo;s salary.
              </Text>
              <Group gap={6}>
                {suppressed.map((row) => (
                  <Badge key={row.key} variant="outline" color="gray" size="sm">
                    {humanise(row.label)} · {count(row.headcount)}
                  </Badge>
                ))}
              </Group>
            </Alert>
          )}
        </Stack>
      </QueryState>
    </Card>
  );
}
