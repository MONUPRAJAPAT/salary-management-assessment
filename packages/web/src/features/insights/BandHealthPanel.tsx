import { Anchor, Badge, Card, Group, Progress, Stack, Table, Text, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconArrowUpRight, IconCheck } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { formatLevel } from '@acme/shared';
import { useBandHealth, type InsightFilters } from '../../api/queries';
import { QueryState } from '../../components/QueryState';
import { count, money, ratio } from '../../lib/format';

/**
 * Who is paid outside the band for their level and country.
 *
 * Deliberately not a chart. The useful output here is a list of names the HR Manager can
 * act on this afternoon, not a proportion — a stacked bar showing "97% in band" is
 * technically the same information and practically useless.
 *
 * Status colours carry an icon and a word in every position, so the meaning survives
 * colour blindness, greyscale printing and forced-colours mode.
 */
export function BandHealthPanel({ filters }: { filters: InsightFilters }) {
  const query = useBandHealth(filters);
  const report = query.data;
  const totals = report?.totals;
  const banded = (totals?.below ?? 0) + (totals?.within ?? 0) + (totals?.above ?? 0);

  return (
    <Card withBorder padding="md" radius="md">
      <Text fw={600}>Salary band health</Text>
      <Text size="xs" c="dimmed" mb="md">
        Each salary compared against the band for their level and country, in their own currency
      </Text>

      <QueryState loading={query.isLoading} error={query.error} height={240}>
        {report && totals && (
          <Stack gap="lg">
            <div>
              <Progress.Root size="xl" mb="xs">
                <Tooltip label={`${count(totals.below)} below band`} withArrow>
                  <Progress.Section
                    value={(totals.below / Math.max(1, banded)) * 100}
                    color="var(--viz-critical)"
                  />
                </Tooltip>
                <Tooltip label={`${count(totals.within)} within band`} withArrow>
                  <Progress.Section
                    value={(totals.within / Math.max(1, banded)) * 100}
                    color="var(--viz-good)"
                  />
                </Tooltip>
                <Tooltip label={`${count(totals.above)} above band`} withArrow>
                  <Progress.Section
                    value={(totals.above / Math.max(1, banded)) * 100}
                    color="var(--viz-warning)"
                  />
                </Tooltip>
              </Progress.Root>

              <Group gap="lg">
                <Group gap={6}>
                  <IconAlertTriangle size={15} style={{ color: 'var(--viz-critical)' }} />
                  <Text size="sm">
                    <Text span fw={600}>
                      {count(totals.below)}
                    </Text>{' '}
                    below band
                  </Text>
                </Group>
                <Group gap={6}>
                  <IconCheck size={15} style={{ color: 'var(--viz-good)' }} />
                  <Text size="sm">
                    <Text span fw={600}>
                      {count(totals.within)}
                    </Text>{' '}
                    in band
                  </Text>
                </Group>
                <Group gap={6}>
                  <IconArrowUpRight size={15} style={{ color: 'var(--viz-warning)' }} />
                  <Text size="sm">
                    <Text span fw={600}>
                      {count(totals.above)}
                    </Text>{' '}
                    above band
                  </Text>
                </Group>
                {totals.unbanded > 0 && (
                  <Text size="sm" c="dimmed">
                    {count(totals.unbanded)} with no band defined
                  </Text>
                )}
              </Group>
            </div>

            {report.mostUnderpaid.length > 0 && (
              <div>
                <Group justify="space-between" mb={6}>
                  <Text size="sm" fw={600}>
                    Furthest below band
                  </Text>
                  <Anchor
                    component={Link}
                    to="/employees?bandPosition=below&sort=compaRatio"
                    size="xs"
                  >
                    See all below band
                  </Anchor>
                </Group>
                <Table verticalSpacing={6} fz="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Employee</Table.Th>
                      <Table.Th>Level</Table.Th>
                      <Table.Th>Country</Table.Th>
                      <Table.Th ta="right">Salary</Table.Th>
                      <Table.Th ta="right">Compa</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {report.mostUnderpaid.map((employee) => (
                      <Table.Tr key={employee.id}>
                        <Table.Td>
                          <Anchor component={Link} to={`/employees/${employee.id}`} size="sm">
                            {employee.firstName} {employee.lastName}
                          </Anchor>
                        </Table.Td>
                        <Table.Td>{formatLevel(employee.level)}</Table.Td>
                        <Table.Td>{employee.countryName}</Table.Td>
                        <Table.Td ta="right" className="tabular">
                          {money(employee.salary)}
                        </Table.Td>
                        <Table.Td ta="right" className="tabular">
                          <Badge color="var(--viz-critical)" variant="light" size="sm">
                            {ratio(employee.compaRatio)}
                          </Badge>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </div>
            )}

            {report.rows.filter((row) => row.below > 0).length > 0 && (
              <div>
                <Text size="sm" fw={600} mb={6}>
                  Where the gaps are concentrated
                </Text>
                <Table verticalSpacing={6} fz="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Level · Country</Table.Th>
                      <Table.Th ta="right">People</Table.Th>
                      <Table.Th ta="right">Below</Table.Th>
                      <Table.Th ta="right">Above</Table.Th>
                      <Table.Th ta="right">Median compa</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {report.rows
                      .filter((row) => row.below > 0)
                      .slice(0, 8)
                      .map((row) => (
                        <Table.Tr key={`${row.countryCode}-${row.level}`}>
                          <Table.Td>
                            {formatLevel(row.level)} · {row.countryName}
                          </Table.Td>
                          <Table.Td ta="right" className="tabular">
                            {count(row.headcount)}
                          </Table.Td>
                          <Table.Td ta="right" className="tabular" c="var(--viz-critical)" fw={600}>
                            {count(row.below)}
                          </Table.Td>
                          <Table.Td ta="right" className="tabular" c="dimmed">
                            {count(row.above)}
                          </Table.Td>
                          <Table.Td ta="right" className="tabular">
                            {ratio(row.medianCompaRatio)}
                          </Table.Td>
                        </Table.Tr>
                      ))}
                  </Table.Tbody>
                </Table>
              </div>
            )}
          </Stack>
        )}
      </QueryState>
    </Card>
  );
}
