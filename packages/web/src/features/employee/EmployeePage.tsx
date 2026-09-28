import { useState } from 'react';
import {
  Anchor,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconArrowLeft, IconPencil, IconTrendingUp, IconUsers } from '@tabler/icons-react';
import { Link, useParams } from 'react-router-dom';
import { formatLevel, humanise } from '@acme/shared';
import { useEmployee } from '../../api/queries';
import { QueryState } from '../../components/QueryState';
import { StatCard } from '../../components/StatCard';
import { BandPositionBadge } from '../../components/BandPositionBadge';
import { date, money, ratio, tenure } from '../../lib/format';
import { CompensationHistory } from './CompensationHistory';
import { BandPositionBar } from './BandPositionBar';
import { RecordChangeModal } from './RecordChangeModal';
import { EditEmployeeModal } from './EditEmployeeModal';

export function EmployeePage() {
  const { id } = useParams();
  const employeeId = id ? Number(id) : null;
  const query = useEmployee(employeeId);
  const [recording, setRecording] = useState(false);
  const [editing, setEditing] = useState(false);

  const employee = query.data;

  return (
    <Stack gap="md">
      <Breadcrumbs separator="›">
        <Anchor component={Link} to="/employees" size="sm">
          <Group gap={4} wrap="nowrap">
            <IconArrowLeft size={14} />
            Employees
          </Group>
        </Anchor>
        <Text size="sm" c="dimmed">
          {employee ? `${employee.firstName} ${employee.lastName}` : '…'}
        </Text>
      </Breadcrumbs>

      <QueryState loading={query.isLoading} error={query.error} height={300}>
        {employee && (
          <Stack gap="md">
            <Group justify="space-between" align="flex-start">
              <div>
                <Group gap="sm" align="center">
                  <Title order={2}>
                    {employee.firstName} {employee.lastName}
                  </Title>
                  {employee.status !== 'active' && (
                    <Badge
                      color={employee.status === 'terminated' ? 'red' : 'yellow'}
                      variant="light"
                    >
                      {humanise(employee.status)}
                    </Badge>
                  )}
                </Group>
                <Text c="dimmed">
                  {employee.jobTitle} · {employee.department} · {employee.countryName}
                </Text>
                <Group gap="xs" mt={6}>
                  <Badge variant="default" size="sm">
                    {employee.employeeNumber}
                  </Badge>
                  <Badge variant="default" size="sm">
                    {formatLevel(employee.level)}
                  </Badge>
                  <Badge variant="default" size="sm">
                    {humanise(employee.employmentType)}
                  </Badge>
                </Group>
              </div>
              <Group gap="xs">
                <Button
                  variant="default"
                  leftSection={<IconPencil size={16} />}
                  onClick={() => setEditing(true)}
                >
                  Edit
                </Button>
                <Button
                  leftSection={<IconTrendingUp size={16} />}
                  onClick={() => setRecording(true)}
                >
                  Record change
                </Button>
              </Group>
            </Group>

            <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="md">
              <StatCard
                label="Current salary"
                testId="current-salary"
                value={money(employee.salary)}
                detail={
                  employee.salaryBase
                    ? `${money(employee.salaryBase)} at the pinned rate`
                    : undefined
                }
              />
              <StatCard
                label="Compa-ratio"
                value={ratio(employee.compaRatio)}
                hint="Salary divided by the midpoint of their band. 1.00 means paid exactly at midpoint."
                detail={<BandPositionBadge position={employee.bandPosition} />}
              />
              <StatCard
                label="Joined"
                value={date(employee.hireDate)}
                detail={`${tenure(employee.hireDate)} of service`}
              />
              <StatCard
                label="Reports to"
                value={
                  employee.managerId ? (
                    <Anchor
                      component={Link}
                      to={`/employees/${employee.managerId}`}
                      fz={20}
                      fw={600}
                    >
                      {employee.managerName}
                    </Anchor>
                  ) : (
                    <Text fz={20} fw={600} c="dimmed">
                      Nobody
                    </Text>
                  )
                }
                detail={
                  employee.directReportCount > 0 ? (
                    <Anchor component={Link} to={`/employees?managerId=${employee.id}`}>
                      <Group gap={4} wrap="nowrap">
                        <IconUsers size={13} />
                        {employee.directReportCount} direct report
                        {employee.directReportCount === 1 ? '' : 's'}
                      </Group>
                    </Anchor>
                  ) : (
                    'No direct reports'
                  )
                }
              />
            </SimpleGrid>

            {employee.band && employee.salary && (
              <Card withBorder padding="md" radius="md">
                <Text
                  size="xs"
                  c="dimmed"
                  tt="uppercase"
                  fw={600}
                  mb="sm"
                  style={{ letterSpacing: 0.4 }}
                >
                  Position in band
                </Text>
                <BandPositionBar
                  salaryMinor={employee.salary.amountMinor}
                  band={employee.band}
                  currency={employee.salary.currency}
                />
              </Card>
            )}

            <Card withBorder padding={0} radius="md">
              <Group justify="space-between" p="md" pb="xs">
                <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: 0.4 }}>
                  Compensation history
                </Text>
                <Text size="xs" c="dimmed">
                  {employee.compensationHistory.length} record
                  {employee.compensationHistory.length === 1 ? '' : 's'} · append-only
                </Text>
              </Group>
              <CompensationHistory records={employee.compensationHistory} />
            </Card>

            <RecordChangeModal
              employee={employee}
              opened={recording}
              onClose={() => setRecording(false)}
            />
            {editing && (
              <EditEmployeeModal employee={employee} opened onClose={() => setEditing(false)} />
            )}
          </Stack>
        )}
      </QueryState>
    </Stack>
  );
}
