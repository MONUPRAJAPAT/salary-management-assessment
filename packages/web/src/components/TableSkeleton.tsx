import { Skeleton, Table } from '@mantine/core';

/**
 * Placeholder rows while the first page loads.
 *
 * A centred spinner collapses the table to nothing and then snaps it back to full height,
 * which reads as slower than it is. Rows of roughly the right shape keep the layout still.
 */
export function TableSkeleton({ rows = 8, columns = 8 }: { rows?: number; columns?: number }) {
  return (
    <Table horizontalSpacing="md" verticalSpacing="xs">
      <Table.Tbody>
        {Array.from({ length: rows }, (_, row) => (
          <Table.Tr key={row}>
            {Array.from({ length: columns }, (_, column) => (
              <Table.Td key={column}>
                <Skeleton height={12} width={column === 0 ? '70%' : '45%'} radius="sm" />
              </Table.Td>
            ))}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
