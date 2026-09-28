import { Badge, Stack, Table, Text, Tooltip } from '@mantine/core';
import { CHANGE_REASON_LABELS, type CompensationRecord } from '@acme/shared';
import { date, money, signedPercent } from '../../lib/format';

const REASON_COLOUR: Record<string, string> = {
  hire: 'blue',
  merit: 'teal',
  promotion: 'grape',
  market_adjustment: 'cyan',
  correction: 'orange',
};

/**
 * The full record, newest first, including changes dated in the future.
 *
 * Nothing here is ever edited or removed — a mistake is corrected by adding a row. That
 * is the whole point of the model, so the history shows every row rather than a tidied
 * version of it. See ADR-0004.
 */
export function CompensationHistory({
  records,
  today = new Date().toISOString().slice(0, 10),
}: {
  records: CompensationRecord[];
  today?: string;
}) {
  return (
    <Table verticalSpacing="sm" horizontalSpacing="md">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Effective from</Table.Th>
          <Table.Th>Reason</Table.Th>
          <Table.Th ta="right">Salary</Table.Th>
          <Table.Th ta="right">Change</Table.Th>
          <Table.Th ta="right">USD</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {records.map((record) => {
          const scheduled = record.effectiveFrom > today;
          return (
            <Table.Tr key={record.id} opacity={scheduled ? 0.65 : 1}>
              <Table.Td>
                <Stack gap={2}>
                  <Text size="sm">{date(record.effectiveFrom)}</Text>
                  {scheduled && (
                    <Badge size="xs" variant="outline" color="gray">
                      Scheduled
                    </Badge>
                  )}
                </Stack>
              </Table.Td>
              <Table.Td>
                <Badge
                  variant="light"
                  color={REASON_COLOUR[record.changeReason] ?? 'gray'}
                  size="sm"
                >
                  {CHANGE_REASON_LABELS[record.changeReason]}
                </Badge>
                {record.note && (
                  <Text size="xs" c="dimmed" mt={4}>
                    {record.note}
                  </Text>
                )}
              </Table.Td>
              <Table.Td ta="right" className="tabular">
                <Text size="sm" fw={500}>
                  {money(record.amount)}
                </Text>
              </Table.Td>
              <Table.Td ta="right" className="tabular">
                {record.changeFromPreviousPercent === null ? (
                  <Tooltip label="The first record is a hire, not a raise." withArrow>
                    <Text size="sm" c="dimmed">
                      —
                    </Text>
                  </Tooltip>
                ) : (
                  <Text size="sm" c={record.changeFromPreviousPercent >= 0 ? 'teal' : 'red'}>
                    {signedPercent(record.changeFromPreviousPercent)}
                  </Text>
                )}
              </Table.Td>
              <Table.Td ta="right" className="tabular">
                <Text size="sm" c="dimmed">
                  {money(record.amountBase)}
                </Text>
              </Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}
