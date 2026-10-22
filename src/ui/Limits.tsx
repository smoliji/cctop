import React from 'react';
import { Box, Text } from 'ink';
import type { LimitMeter, PlanUsage } from '../types.js';
import { fit, formatDuration, meterColor } from '../format.js';
import { INDENT } from '../layout.js';

const STALE_MS = 15 * 60_000;

export function labelWidth(usage: PlanUsage | null): number {
  return Math.min(16, Math.max(4, ...(usage?.meters ?? []).map((m) => m.label.length)));
}

export function limitLines(usage: PlanUsage | null): number {
  return usage?.meters.length || 1;
}

interface Props {
  usage: PlanUsage | null;
  now: number;
  bar: number;
}

export function Limits({ usage, now, bar }: Props) {
  const age = usage ? now - usage.fetchedAt : 0;
  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Text bold>LIMITS</Text>
        {usage && (
          <Text color={age > STALE_MS ? 'yellow' : 'gray'}>cache {formatDuration(age)} old</Text>
        )}
      </Box>
      <Box flexDirection="column" paddingLeft={INDENT}>
        {!usage && <Text color="gray">no plan usage cached yet</Text>}
        {usage?.meters.length === 0 && <Text color="gray">no limits reported</Text>}
        {usage?.meters.map((m) => (
          <Meter key={m.label} meter={m} now={now} bar={bar} label={labelWidth(usage)} />
        ))}
      </Box>
    </Box>
  );
}

function Meter({ meter, now, bar, label }: { meter: LimitMeter; now: number; bar: number; label: number }) {
  // The cached percent belongs to a window that already ended, so the new one starts empty.
  const expired = meter.resetsAt !== null && meter.resetsAt <= now;
  const percent = expired ? 0 : meter.percent;
  const filled = Math.round((percent / 100) * bar);
  const reset =
    meter.resetsAt === null ? '' : expired ? 'window reset' : `reset ${formatDuration(meter.resetsAt - now)}`;
  return (
    <Text wrap="truncate-end">
      {fit(meter.label, label)}
      {'  '}
      <Text color={meterColor(percent)}>{'█'.repeat(filled)}</Text>
      <Text color="gray">{'░'.repeat(bar - filled)}</Text>
      {`${Math.round(percent)}%`.padStart(5)}
      {'  '}
      <Text color="gray">{reset.padStart(14)}</Text>
    </Text>
  );
}
