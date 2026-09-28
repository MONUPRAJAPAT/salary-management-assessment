import { useState } from 'react';
import {
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import {
  EMPLOYMENT_TYPES,
  GENDERS,
  LEVELS,
  createEmployeeSchema,
  formatLevel,
  fromMajorUnits,
  humanise,
  type Department,
  type EmploymentType,
  type Gender,
  type Level,
} from '@acme/shared';
import { useCreateEmployee, useReferenceData } from '../../api/queries';
import { ApiError } from '../../api/client';

const EMPTY = {
  firstName: '',
  lastName: '',
  email: '',
  jobTitle: '',
  countryCode: '',
  department: '' as Department | '',
  level: 'IC2' as Level,
  employmentType: 'full_time' as EmploymentType,
  gender: 'undisclosed' as Gender,
  salaryMajor: '' as number | '',
};

export function NewEmployeeModal({
  opened,
  onClose,
  defaultCountry,
}: {
  opened: boolean;
  onClose: () => void;
  defaultCountry?: string | undefined;
}) {
  const reference = useReferenceData();
  const navigate = useNavigate();
  const mutation = useCreateEmployee();

  const [form, setForm] = useState({ ...EMPTY, countryCode: defaultCountry ?? '' });
  const [hireDate, setHireDate] = useState<Date | null>(new Date());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const currency = reference.data?.countries.find((c) => c.code === form.countryCode)?.currency;
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const submit = () => {
    setFieldErrors({});
    if (!hireDate || !currency || form.salaryMajor === '') return;

    // Validated with the same schema the server uses, so the two cannot disagree about
    // what a valid employee is — the client just gets to say so sooner.
    const parsed = createEmployeeSchema.safeParse({
      ...form,
      hireDate: hireDate.toISOString().slice(0, 10),
      managerId: null,
      startingSalaryMinor: fromMajorUnits(form.salaryMajor, currency).amountMinor,
    });

    if (!parsed.success) {
      setFieldErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path.join('.'), issue.message]),
        ),
      );
      return;
    }

    mutation.mutate(parsed.data, {
      onSuccess: (created) => {
        notifications.show({
          title: 'Employee added',
          message: `${created.firstName} ${created.lastName} · ${created.employeeNumber}`,
          color: 'teal',
        });
        setForm({ ...EMPTY });
        onClose();
        navigate(`/employees/${created.id}`);
      },
    });
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Add an employee" size="lg" centered>
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <TextInput
            label="First name"
            value={form.firstName}
            onChange={(e) => set('firstName', e.currentTarget.value)}
            error={fieldErrors.firstName}
            required
          />
          <TextInput
            label="Last name"
            value={form.lastName}
            onChange={(e) => set('lastName', e.currentTarget.value)}
            error={fieldErrors.lastName}
            required
          />
        </SimpleGrid>

        <TextInput
          label="Email"
          type="email"
          value={form.email}
          onChange={(e) => set('email', e.currentTarget.value)}
          error={fieldErrors.email}
          required
        />

        <TextInput
          label="Job title"
          placeholder="Senior Software Engineer"
          value={form.jobTitle}
          onChange={(e) => set('jobTitle', e.currentTarget.value)}
          error={fieldErrors.jobTitle}
          required
        />

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <Select
            label="Department"
            data={reference.data?.departments ?? []}
            value={form.department || null}
            onChange={(value) => set('department', (value as Department) ?? '')}
            error={fieldErrors.department}
            searchable
            required
          />
          <Select
            label="Level"
            data={LEVELS.map((level) => ({ value: level, label: formatLevel(level) }))}
            value={form.level}
            onChange={(value) => set('level', (value as Level) ?? 'IC2')}
            allowDeselect={false}
            required
          />
          <Select
            label="Country"
            data={(reference.data?.countries ?? []).map((country) => ({
              value: country.code,
              label: `${country.name} (${country.currency})`,
            }))}
            value={form.countryCode || null}
            onChange={(value) => set('countryCode', value ?? '')}
            error={fieldErrors.countryCode}
            searchable
            required
          />
          <Select
            label="Employment type"
            data={EMPLOYMENT_TYPES.map((type) => ({ value: type, label: humanise(type) }))}
            value={form.employmentType}
            onChange={(value) => set('employmentType', (value as EmploymentType) ?? 'full_time')}
            allowDeselect={false}
          />
          <DateInput
            label="Hire date"
            value={hireDate}
            onChange={setHireDate}
            valueFormat="D MMM YYYY"
            required
          />
          <Select
            label="Gender"
            description="Optional, self-reported. Only ever shown in aggregate."
            data={GENDERS.map((gender) => ({ value: gender, label: humanise(gender) }))}
            value={form.gender}
            onChange={(value) => set('gender', (value as Gender) ?? 'undisclosed')}
            allowDeselect={false}
          />
        </SimpleGrid>

        <NumberInput
          label="Starting salary"
          description={
            currency
              ? `Paid in ${currency}, the currency of the selected country.`
              : 'Select a country first — salary is always in the country’s own currency.'
          }
          thousandSeparator=","
          min={0}
          disabled={!currency}
          value={form.salaryMajor}
          onChange={(value) => set('salaryMajor', value === '' ? '' : Number(value))}
          error={fieldErrors.startingSalaryMinor}
          required
        />
        <Text size="xs" c="dimmed">
          An employee cannot be created without a salary — a person with no pay on record is a gap
          in the system of record, not a zero.
        </Text>

        {mutation.error && (
          <Alert color="red" icon={<IconAlertTriangle size={16} />}>
            {mutation.error instanceof ApiError
              ? mutation.error.message
              : 'Could not add the employee.'}
          </Alert>
        )}

        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={mutation.isPending}>
            Add employee
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
