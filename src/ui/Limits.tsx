import React from 'react';
import { Box, Text } from 'ink';
import type { LimitMeter, PlanUsage } from '../types.js';
import { BLOCK, fit, formatDuration, meterColor, MUTED } from '../format.js';
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
          <Text color={age > STALE_MS ? 'yellow' : MUTED}>cache {formatDuration(age)} old</Text>
        )}
      </Box>
      <Box flexDirection="column" paddingLeft={INDENT}>
        {!usage && <Text color={MUTED}>no plan usage cached yet</Text>}
        {usage?.meters.length === 0 && <Text color={MUTED}>no limits reported</Text>}
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
  const color = meterColor(percent);
  return (
    <Text wrap="truncate-end">
      {fit(meter.label, label)}
      {'  '}
      <Text color={color}>{BLOCK.repeat(filled)}</Text>
      <Text color={MUTED}>{'─'.repeat(bar - filled)}</Text>
      <Text color={color} bold>
        {`${Math.round(percent)}%`.padStart(5)}
      </Text>
      {'  '}
      <Text color={MUTED}>{reset.padStart(14)}</Text>
    </Text>
  );
}
