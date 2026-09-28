import { Anchor, Group, Table, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconArrowsSort } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { formatLevel, type EmployeeSummary } from '@acme/shared';
import { BandPositionBadge } from '../../components/BandPositionBadge';
import { money, ratio } from '../../lib/format';

interface Column {
  key: string;
  label: string;
  sortable?: boolean;
  align?: 'left' | 'right';
  hint?: string;
}

const COLUMNS: Column[] = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'department', label: 'Department', sortable: true },
  { key: 'level', label: 'Level', sortable: true },
  { key: 'country', label: 'Country', sortable: true },
  {
    key: 'salary',
    label: 'Salary',
    sortable: true,
    align: 'right',
    hint: 'Paid in the local currency of the employee’s country.',
  },
  {
    key: 'salaryBase',
    label: 'Salary (USD)',
    align: 'right',
    hint: 'Converted at the pinned exchange rate. The only column safe to compare across countries.',
  },
  {
    key: 'compaRatio',
    label: 'Compa',
    sortable: true,
    align: 'right',
    hint: 'Salary ÷ band midpoint. 1.00 is exactly at midpoint.',
  },
  { key: 'bandPosition', label: 'Band', align: 'left' },
];

interface EmployeeTableProps {
  employees: EmployeeSummary[];
  sort: string;
  direction: 'asc' | 'desc';
  onSort: (field: string) => void;
}

/**
 * No stickyHeader on this table. Table.ScrollContainer wraps it in a ScrollArea, which
 * creates its own positioning context: `position: sticky` resolves against that container
 * rather than the page, and `stickyHeaderOffset` then pushes the header *down* inside it —
 * directly over the first rows, hiding them. A sticky header would mean taking the table
 * out of the ScrollContainer, and horizontal scrolling on narrow screens matters more.
 */
export function EmployeeTable({ employees, sort, direction, onSort }: EmployeeTableProps) {
  return (
    <Table.ScrollContainer minWidth={860}>
      <Table horizontalSpacing="md">
        <Table.Thead>
          <Table.Tr>
            {COLUMNS.map((column) => (
              <Table.Th key={column.key} ta={column.align ?? 'left'}>
                <SortableHeader
                  column={column}
                  active={sort === column.key}
                  direction={direction}
                  onSort={onSort}
                />
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {employees.map((employee) => (
            <Table.Tr key={employee.id}>
              <Table.Td>
                <Anchor component={Link} to={`/employees/${employee.id}`} fw={500} size="sm">
                  {employee.firstName} {employee.lastName}
                </Anchor>
                <Text size="xs" c="dimmed">
                  {employee.jobTitle}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">{employee.department}</Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">{formatLevel(employee.level)}</Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">{employee.countryName}</Text>
              </Table.Td>
              <Table.Td ta="right" className="tabular">
                <Text size="sm">{money(employee.salary)}</Text>
              </Table.Td>
              <Table.Td ta="right" className="tabular">
                <Text size="sm" c="dimmed">
                  {money(employee.salaryBase)}
                </Text>
              </Table.Td>
              <Table.Td ta="right" className="tabular">
                <Text size="sm">{ratio(employee.compaRatio)}</Text>
              </Table.Td>
              <Table.Td>
                <BandPositionBadge position={employee.bandPosition} />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

function SortableHeader({
  column,
  active,
  direction,
  onSort,
}: {
  column: Column;
  active: boolean;
  direction: 'asc' | 'desc';
  onSort: (field: string) => void;
}) {
  const heading = (
    <Text size="xs" fw={600} tt="uppercase" c="dimmed" style={{ letterSpacing: 0.4 }}>
      {column.label}
    </Text>
  );

  const withHint = column.hint ? (
    <Tooltip label={column.hint} withArrow multiline w={260}>
      {heading}
    </Tooltip>
  ) : (
    heading
  );

  if (!column.sortable) return withHint;

  const Icon = !active ? IconArrowsSort : direction === 'asc' ? IconArrowUp : IconArrowDown;

  return (
    <UnstyledButton
      onClick={() => onSort(column.key)}
      aria-label={`Sort by ${column.label}`}
      w="100%"
    >
      <Group gap={4} wrap="nowrap" justify={column.align === 'right' ? 'flex-end' : 'flex-start'}>
        {withHint}
        <Icon size={13} style={{ color: active ? 'inherit' : 'var(--mantine-color-dimmed)' }} />
      </Group>
    </UnstyledButton>
  );
}
