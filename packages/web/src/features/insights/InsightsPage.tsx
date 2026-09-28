import {
  Alert,
  Button,
  Card,
  Group,
  MultiSelect,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core';
import { IconAlertTriangle, IconCash, IconScale, IconUsers } from '@tabler/icons-react';
import { LEVELS, formatLevel } from '@acme/shared';
import { useOverview, useReferenceData } from '../../api/queries';
import { StatCard } from '../../components/StatCard';
import { count, money } from '../../lib/format';
import { useInsightFilters } from './useInsightFilters';
import { BreakdownPanel } from './BreakdownPanel';
import { PayGapPanel } from './PayGapPanel';
import { BandHealthPanel } from './BandHealthPanel';
import { DistributionPanel } from './DistributionPanel';
import { TrendPanel } from './TrendPanel';

/**
 * The answer engine.
 *
 * One filter row at the top drives every panel below it, so narrowing to "Engineering,
 * in Europe" re-answers every question on the page about that same population rather
 * than leaving half the screen describing the whole company.
 */
export function InsightsPage() {
  const { filters, update, isFiltered, clear } = useInsightFilters();
  const reference = useReferenceData();
  const overview = useOverview(filters);
  const data = overview.data;

  const spread =
    data?.p25Salary && data?.p75Salary
      ? `${money(data.p25Salary)} – ${money(data.p75Salary)}`
      : '—';

  return (
    <Stack gap="md">
      <div>
        <Title order={2}>Insights</Title>
        <Text size="sm" c="dimmed">
          {isFiltered
            ? 'A filtered slice of the organisation'
            : 'How ACME pays people, across every country'}
          {data && ` · every figure in ${data.baseCurrency} at the rates of ${data.fxAsOf}`}
        </Text>
      </div>

      <Card withBorder padding="sm" radius="md">
        <Group align="flex-end" gap="sm" wrap="wrap">
          <MultiSelect
            label="Country"
            placeholder={filters.country?.length ? undefined : 'All countries'}
            data={(reference.data?.countries ?? []).map((country) => ({
              value: country.code,
              label: country.name,
            }))}
            value={filters.country ?? []}
            onChange={(value) => update({ country: value })}
            searchable
            clearable
            style={{ flex: '1 1 200px' }}
          />
          <MultiSelect
            label="Department"
            placeholder={filters.department?.length ? undefined : 'All departments'}
            data={reference.data?.departments ?? []}
            value={filters.department ?? []}
            onChange={(value) => update({ department: value })}
            searchable
            clearable
            style={{ flex: '1 1 200px' }}
          />
          <MultiSelect
            label="Level"
            placeholder={filters.level?.length ? undefined : 'All levels'}
            data={LEVELS.map((level) => ({ value: level, label: formatLevel(level) }))}
            value={filters.level ?? []}
            onChange={(value) => update({ level: value })}
            clearable
            style={{ flex: '1 1 200px' }}
          />
          <Switch
            label="Include terminated"
            checked={filters.includeInactive ?? false}
            onChange={(event) => update({ includeInactive: event.currentTarget.checked })}
            mb={8}
          />
          {isFiltered && (
            <Button variant="subtle" color="gray" onClick={clear} mb={4}>
              Clear
            </Button>
          )}
        </Group>
      </Card>

      <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="md">
        <StatCard
          label="Headcount"
          icon={IconUsers}
          value={data ? count(data.headcount) : '—'}
          loading={overview.isLoading}
          detail={
            data
              ? `across ${data.countryCount} countries and ${data.departmentCount} departments`
              : undefined
          }
        />
        <StatCard
          label="Annual payroll"
          icon={IconCash}
          value={data ? money(data.annualPayroll) : '—'}
          loading={overview.isLoading}
          hint="Sum of every current base salary, converted to the base currency at the pinned exchange rates. Base salary only — no bonus, equity or employer costs."
        />
        <StatCard
          label="Median salary"
          icon={IconScale}
          value={data ? money(data.medianSalary) : '—'}
          loading={overview.isLoading}
          hint="The middle salary when everyone is lined up in order. Reported rather than the mean, because a handful of executive salaries pull an average somewhere nobody is actually paid."
          detail={`middle half: ${spread}`}
        />
        <StatCard
          label="Outside band"
          icon={IconAlertTriangle}
          accent={data && data.belowBandCount > 0 ? 'critical' : 'neutral'}
          value={data ? count(data.belowBandCount + data.aboveBandCount) : '—'}
          loading={overview.isLoading}
          hint="Employees paid outside the salary band for their level and country."
          detail={
            data
              ? `${count(data.belowBandCount)} below · ${count(data.aboveBandCount)} above`
              : undefined
          }
        />
      </SimpleGrid>

      {data && data.missingCompensationCount > 0 && (
        <Alert color="orange" variant="light" icon={<IconAlertTriangle size={16} />}>
          {count(data.missingCompensationCount)} employee
          {data.missingCompensationCount === 1 ? ' has' : 's have'} no salary on record and are
          excluded from every figure above. A missing salary is a gap in the record, not a zero.
        </Alert>
      )}

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
        <BreakdownPanel filters={filters} />
        <Stack gap="md">
          <DistributionPanel filters={filters} />
          <BandHealthPanel filters={filters} />
        </Stack>
      </SimpleGrid>

      <PayGapPanel filters={filters} />
      <TrendPanel filters={filters} />
    </Stack>
  );
}
