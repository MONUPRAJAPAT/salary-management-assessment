import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Button,
  Card,
  Group,
  MultiSelect,
  Pagination,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconDownload, IconPlus, IconSearch, IconX } from '@tabler/icons-react';
import { BAND_POSITIONS, EMPLOYEE_STATUSES, LEVELS, formatLevel, humanise } from '@acme/shared';
import { useEmployees, useReferenceData } from '../../api/queries';
import { toQueryString } from '../../api/client';
import { QueryState } from '../../components/QueryState';
import { count } from '../../lib/format';
import { useDirectoryFilters } from './useDirectoryFilters';
import { EmployeeTable } from './EmployeeTable';
import { NewEmployeeModal } from '../employee/NewEmployeeModal';

export function DirectoryPage() {
  const { filters, update, toggleSort, clear, activeFilterCount, params } = useDirectoryFilters();
  const reference = useReferenceData();
  const employees = useEmployees(filters);
  const [creating, setCreating] = useState(false);

  // The search box is local so typing stays responsive, and only the settled value is
  // pushed into the URL and the query.
  const [searchText, setSearchText] = useState(filters.search ?? '');
  const [debouncedSearch] = useDebouncedValue(searchText, 250);

  useEffect(() => {
    if ((filters.search ?? '') !== debouncedSearch) update({ search: debouncedSearch });
    // `update` is stable per params; including filters.search would fight the user's typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const total = employees.data?.total ?? 0;
  const exportHref = `/api/employees/export${toQueryString({ ...filters, page: undefined, pageSize: undefined })}`;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Employees</Title>
          <Text size="sm" c="dimmed">
            {employees.isLoading ? 'Loading…' : `${count(total)} matching`}
            {activeFilterCount > 0 &&
              ` · ${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''} applied`}
          </Text>
        </div>
        <Group gap="xs">
          <Tooltip
            label="Downloads exactly what these filters show, not the whole company."
            withArrow
          >
            <Button
              component="a"
              href={exportHref}
              variant="default"
              leftSection={<IconDownload size={16} />}
            >
              Export CSV
            </Button>
          </Tooltip>
          <Button leftSection={<IconPlus size={16} />} onClick={() => setCreating(true)}>
            Add employee
          </Button>
        </Group>
      </Group>

      <Card withBorder padding="sm" radius="md">
        <Group align="flex-end" gap="sm" wrap="wrap">
          <TextInput
            label="Search"
            placeholder="Name, email, employee number or job title"
            leftSection={<IconSearch size={15} />}
            value={searchText}
            onChange={(event) => setSearchText(event.currentTarget.value)}
            rightSection={
              searchText ? (
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  onClick={() => setSearchText('')}
                  aria-label="Clear search"
                >
                  <IconX size={14} />
                </ActionIcon>
              ) : null
            }
            style={{ flex: '2 1 260px' }}
          />
          <MultiSelect
            label="Country"
            placeholder={filters.country?.length ? undefined : 'All'}
            data={(reference.data?.countries ?? []).map((country) => ({
              value: country.code,
              label: country.name,
            }))}
            value={filters.country ?? []}
            onChange={(value) => update({ country: value })}
            searchable
            clearable
            style={{ flex: '1 1 170px' }}
          />
          <MultiSelect
            label="Department"
            placeholder={filters.department?.length ? undefined : 'All'}
            data={reference.data?.departments ?? []}
            value={filters.department ?? []}
            onChange={(value) => update({ department: value })}
            searchable
            clearable
            style={{ flex: '1 1 170px' }}
          />
          <MultiSelect
            label="Level"
            placeholder={filters.level?.length ? undefined : 'All'}
            data={LEVELS.map((level) => ({ value: level, label: formatLevel(level) }))}
            value={filters.level ?? []}
            onChange={(value) => update({ level: value })}
            clearable
            style={{ flex: '1 1 160px' }}
          />
          <MultiSelect
            label="Band position"
            placeholder={filters.bandPosition?.length ? undefined : 'All'}
            data={BAND_POSITIONS.map((position) => ({
              value: position,
              label: humanise(position),
            }))}
            value={filters.bandPosition ?? []}
            onChange={(value) => update({ bandPosition: value })}
            clearable
            style={{ flex: '1 1 150px' }}
          />
          <MultiSelect
            label="Status"
            placeholder={filters.status?.length ? undefined : 'All'}
            data={EMPLOYEE_STATUSES.map((status) => ({ value: status, label: humanise(status) }))}
            value={filters.status ?? []}
            onChange={(value) => update({ status: value })}
            clearable
            style={{ flex: '1 1 150px' }}
          />
          {activeFilterCount > 0 && (
            <Button
              variant="subtle"
              color="gray"
              onClick={() => {
                setSearchText('');
                clear();
              }}
            >
              Clear all
            </Button>
          )}
        </Group>
      </Card>

      <Card withBorder padding={0} radius="md">
        <QueryState
          loading={employees.isLoading}
          error={employees.error}
          empty={employees.data?.items.length === 0}
          emptyMessage="No employees match these filters."
          height={260}
        >
          <EmployeeTable
            employees={employees.data?.items ?? []}
            sort={filters.sort ?? 'name'}
            direction={filters.direction ?? 'asc'}
            onSort={toggleSort}
          />
        </QueryState>
      </Card>

      {(employees.data?.totalPages ?? 1) > 1 && (
        <Group justify="space-between">
          <Select
            size="xs"
            w={120}
            label={undefined}
            aria-label="Rows per page"
            data={['25', '50', '100']}
            value={String(filters.pageSize ?? 25)}
            onChange={(value) => update({ pageSize: Number(value ?? 25) })}
          />
          <Pagination
            value={filters.page ?? 1}
            onChange={(page) => update({ page })}
            total={employees.data?.totalPages ?? 1}
            siblings={1}
            size="sm"
          />
        </Group>
      )}

      <NewEmployeeModal
        opened={creating}
        onClose={() => setCreating(false)}
        defaultCountry={params.get('country')?.split(',')[0]}
      />
    </Stack>
  );
}
