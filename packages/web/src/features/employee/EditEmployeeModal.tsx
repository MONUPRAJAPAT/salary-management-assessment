import { useState } from 'react';
import {
  Alert,
  Button,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconLock } from '@tabler/icons-react';
import {
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  LEVELS,
  formatLevel,
  humanise,
  type Department,
  type EmployeeDetail,
  type EmployeeStatus,
  type EmploymentType,
  type Level,
} from '@acme/shared';
import { useReferenceData, useUpdateEmployee } from '../../api/queries';
import { ApiError } from '../../api/client';

export function EditEmployeeModal({
  employee,
  opened,
  onClose,
}: {
  employee: EmployeeDetail;
  opened: boolean;
  onClose: () => void;
}) {
  const reference = useReferenceData();
  const mutation = useUpdateEmployee(employee.id);

  const [form, setForm] = useState({
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    jobTitle: employee.jobTitle,
    department: employee.department,
    level: employee.level,
    employmentType: employee.employmentType,
    status: employee.status,
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const submit = () =>
    mutation.mutate(form, {
      onSuccess: () => {
        notifications.show({ title: 'Employee updated', message: 'Changes saved.', color: 'teal' });
        onClose();
      },
    });

  return (
    <Modal opened={opened} onClose={onClose} title="Edit employee" size="lg" centered>
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <TextInput
            label="First name"
            value={form.firstName}
            onChange={(e) => set('firstName', e.currentTarget.value)}
          />
          <TextInput
            label="Last name"
            value={form.lastName}
            onChange={(e) => set('lastName', e.currentTarget.value)}
          />
        </SimpleGrid>
        <TextInput
          label="Email"
          type="email"
          value={form.email}
          onChange={(e) => set('email', e.currentTarget.value)}
        />
        <TextInput
          label="Job title"
          value={form.jobTitle}
          onChange={(e) => set('jobTitle', e.currentTarget.value)}
        />

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <Select
            label="Department"
            data={reference.data?.departments ?? []}
            value={form.department}
            onChange={(value) => set('department', (value as Department) ?? form.department)}
            searchable
            allowDeselect={false}
          />
          <Select
            label="Level"
            description="Changing level changes which band they are measured against."
            data={LEVELS.map((level) => ({ value: level, label: formatLevel(level) }))}
            value={form.level}
            onChange={(value) => set('level', (value as Level) ?? form.level)}
            allowDeselect={false}
          />
          <Select
            label="Employment type"
            data={EMPLOYMENT_TYPES.map((type) => ({ value: type, label: humanise(type) }))}
            value={form.employmentType}
            onChange={(value) =>
              set('employmentType', (value as EmploymentType) ?? form.employmentType)
            }
            allowDeselect={false}
          />
          <Select
            label="Status"
            data={EMPLOYEE_STATUSES.map((status) => ({ value: status, label: humanise(status) }))}
            value={form.status}
            onChange={(value) => set('status', (value as EmployeeStatus) ?? form.status)}
            allowDeselect={false}
          />
        </SimpleGrid>

        <Alert color="gray" variant="light" icon={<IconLock size={16} />}>
          <Text size="sm">
            Salary is not editable here. Pay changes are recorded separately so each one carries an
            effective date and a reason, and nothing overwrites the history.
          </Text>
        </Alert>

        {mutation.error && (
          <Alert color="red" icon={<IconAlertTriangle size={16} />}>
            {mutation.error instanceof ApiError
              ? mutation.error.message
              : 'Could not save the changes.'}
          </Alert>
        )}

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={mutation.isPending}>
            Save changes
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
