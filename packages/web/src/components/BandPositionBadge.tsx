import { Badge, Tooltip } from '@mantine/core';
import type { BandPosition } from '@acme/shared';

const STYLE: Record<BandPosition, { color: string; label: string; explain: string }> = {
  below: {
    color: 'red',
    label: 'Below band',
    explain: 'Paid less than the minimum of the salary band for this level and country.',
  },
  within: {
    color: 'gray',
    label: 'In band',
    explain: 'Paid within the salary band for this level and country.',
  },
  above: {
    color: 'yellow',
    label: 'Above band',
    explain: 'Paid more than the maximum of the salary band for this level and country.',
  },
};

export function BandPositionBadge({ position }: { position: BandPosition | null }) {
  if (position === null) {
    return (
      <Tooltip label="No salary band is defined for this level and country." withArrow>
        <Badge color="gray" variant="outline" size="sm">
          No band
        </Badge>
      </Tooltip>
    );
  }

  const style = STYLE[position];
  return (
    <Tooltip label={style.explain} withArrow multiline w={260}>
      <Badge color={style.color} variant={position === 'within' ? 'light' : 'filled'} size="sm">
        {style.label}
      </Badge>
    </Tooltip>
  );
}
