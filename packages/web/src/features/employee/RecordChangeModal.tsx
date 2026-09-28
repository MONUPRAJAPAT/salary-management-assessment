import { useState } from 'react';
import {
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle } from '@tabler/icons-react';
import {
  CHANGE_REASONS,
  CHANGE_REASON_LABELS,
  fromMajorUnits,
  money as makeMoney,
  scaleMoney,
  toMajorUnits,
  type ChangeReason,
  type EmployeeDetail,
} from '@acme/shared';
import { useRecordCompensationChange } from '../../api/queries';
import { ApiError } from '../../api/client';
import { money, signedPercent } from '../../lib/format';

/**
 * Recording a pay change.
 *
 * Two entry modes, because HR Managers think in both an absolute figure and a
 * percentage. Whichever they use, the modal shows the resulting salary and the resulting
 * percentage before they commit — a raise is not a thing to find out the size of
 * afterwards.
 */
export function RecordChangeModal({
  employee,
  opened,
  onClose,
}: {
  employee: EmployeeDetail;
  opened: boolean;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'amount' | 'percent'>('percent');
  const [newSalaryMajor, setNewSalaryMajor] = useState<number | ''>('');
  const [increasePercent, setIncreasePercent] = useState<number | ''>(5);
  const [effectiveFrom, setEffectiveFrom] = useState<Date | null>(new Date());
  const [changeReason, setChangeReason] = useState<ChangeReason>('merit');
  const [note, setNote] = useState('');

  const mutation = useRecordCompensationChange(employee.id);
  const current = employee.salary;

  const projected = (() => {
    if (!current) return null;
    if (mode === 'amount') {
      return newSalaryMajor === '' ? null : fromMajorUnits(newSalaryMajor, current.currency);
    }
    return increasePercent === '' ? null : scaleMoney(current, 1 + increasePercent / 100);
  })();

  const projectedPercent =
    projected && current && current.amountMinor > 0
      ? ((projected.amountMinor - current.amountMinor) / current.amountMinor) * 100
      : null;

  const outsideBand =
    projected && employee.band
      ? projected.amountMinor < employee.band.minMinor
        ? 'below'
        : projected.amountMinor > employee.band.maxMinor
          ? 'above'
          : null
      : null;

  const submit = () => {
    if (!effectiveFrom || !projected) return;

    mutation.mutate(
      {
        effectiveFrom: effectiveFrom.toISOString().slice(0, 10),
        changeReason,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(mode === 'amount'
          ? { newSalaryMinor: projected.amountMinor }
          : { increasePercent: Number(increasePercent) }),
      },
      {
        onSuccess: (result) => {
          notifications.show({
            title: 'Compensation updated',
            message: `${employee.firstName} ${employee.lastName} — ${money(result.record.amount)} effective ${result.record.effectiveFrom}.`,
            color: 'teal',
          });
          onClose();
          setNote('');
        },
      },
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Record a compensation change"
      size="md"
      centered
    >
      <Stack gap="md">
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            Current salary
          </Text>
          <Text size="sm" fw={600} className="tabular">
            {money(current)}
          </Text>
        </Group>

        <SegmentedControl
          fullWidth
          value={mode}
          onChange={(value) => setMode(value as 'amount' | 'percent')}
          data={[
            { value: 'percent', label: 'By percentage' },
            { value: 'amount', label: 'To an amount' },
          ]}
        />

        {mode === 'percent' ? (
          <NumberInput
            label="Increase"
            suffix="%"
            decimalScale={2}
            step={0.5}
            value={increasePercent}
            onChange={(value) => setIncreasePercent(value === '' ? '' : Number(value))}
            data-testid="increase-percent"
          />
        ) : (
          <NumberInput
            label={`New salary (${current?.currency ?? ''})`}
            thousandSeparator=","
            min={0}
            value={newSalaryMajor}
            onChange={(value) => setNewSalaryMajor(value === '' ? '' : Number(value))}
            placeholder={current ? String(toMajorUnits(current)) : ''}
            data-testid="new-salary"
          />
        )}

        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            New salary
          </Text>
          <Group gap="xs">
            <Text size="sm" fw={600} className="tabular" data-testid="projected-salary">
              {money(projected)}
            </Text>
            {projectedPercent !== null && (
              <Text size="sm" c={projectedPercent >= 0 ? 'teal' : 'red'}>
                {signedPercent(projectedPercent)}
              </Text>
            )}
          </Group>
        </Group>

        {outsideBand && (
          <Alert
            color={outsideBand === 'below' ? 'red' : 'yellow'}
            icon={<IconAlertTriangle size={16} />}
          >
            This puts {employee.firstName} {outsideBand} the {employee.level} band for{' '}
            {employee.countryName} (
            {money(makeMoney(employee.band?.minMinor ?? 0, current?.currency ?? 'USD'))} –{' '}
            {money(makeMoney(employee.band?.maxMinor ?? 0, current?.currency ?? 'USD'))}). You can
            still record it.
          </Alert>
        )}

        <DateInput
          label="Effective from"
          description="Backdate a correction, or schedule a raise ahead — it takes effect on this date."
          value={effectiveFrom}
          onChange={setEffectiveFrom}
          minDate={new Date(`${employee.hireDate}T00:00:00Z`)}
          valueFormat="D MMM YYYY"
        />

        <Select
          label="Reason"
          data={CHANGE_REASONS.map((reason) => ({
            value: reason,
            label: CHANGE_REASON_LABELS[reason],
          }))}
          value={changeReason}
          onChange={(value) => setChangeReason((value as ChangeReason) ?? 'merit')}
          allowDeselect={false}
        />

        <Textarea
          label="Note"
          placeholder="Optional — why this change was made"
          value={note}
          onChange={(event) => setNote(event.currentTarget.value)}
          autosize
          minRows={2}
          maxLength={500}
        />

        {mutation.error && (
          <Alert color="red" icon={<IconAlertTriangle size={16} />}>
            {mutation.error instanceof ApiError
              ? mutation.error.message
              : 'Could not record the change.'}
          </Alert>
        )}

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            loading={mutation.isPending}
            disabled={!projected || !effectiveFrom}
          >
            Record change
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
