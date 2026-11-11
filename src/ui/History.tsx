import React from 'react';
import { Box, Text } from 'ink';
import type { DayRow, Overview } from '../types.js';
import { barCells, BLOCK, formatCost, formatDate, formatDay, formatTokens, isWeekend, MUTED, splitCells } from '../format.js';
import { INDENT } from '../layout.js';
import { HISTORY_DAYS, HORIZON_DAYS, recentDates } from '../overview.js';

interface Props {
  overview: Overview | null;
  now: number;
  days: number;
  bar: number;
  palette: Map<string, string>;
  /** History tab: scrolls through every day of the horizon, this many days back, with a scroll hint row. */
  offset?: number;
}

const titleOf = (dates: string[], start: number) =>
  start > 0
    ? `TOKENS · ${formatDate(dates.at(-1)!)} – ${formatDate(dates[0]!)}`
    : dates.length === 1
      ? 'TOKENS · TODAY'
      : `TOKENS · LAST ${dates.length} DAYS`;

export function History({ overview, now, days, bar, palette, offset }: Props) {
  const scroll = offset !== undefined;
  const span = scroll ? HORIZON_DAYS : HISTORY_DAYS;
  const start = Math.max(0, Math.min(offset ?? 0, span - days));
  const pending = !overview || (scroll ? overview.pending.history : overview.pending.days);
  const hint = scroll && <ScrollHint newer={start} older={span - start - Math.min(days, span)} />;
  if (pending) return <Skeleton dates={recentDates(now, span).slice(start, start + days)} start={start} bar={bar} hint={hint} />;
  // Summary and scale cover the shown rows only, so a short terminal never refers to a day it hides.
  const rows = overview.days.slice(start, start + days);
  const { tokens, avg, peak, cost } = summary(rows);
  const models = modelOrder(rows);
  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between" gap={2}>
        <Text bold>{titleOf(rows.map((d) => d.date), start)}</Text>
        <Text color={MUTED} wrap="truncate-start">
          avg {formatTokens(avg)}  peak {formatTokens(peak)}  {rows.length}d {formatTokens(tokens)}
          {cost === null ? '' : `  ${formatCost(cost)}*`}
        </Text>
      </Box>
      <Box flexDirection="column" paddingLeft={INDENT}>
        {rows.map((day, i) => (
          <Day key={day.date} day={day} today={start + i === 0} models={models} peak={peak} bar={bar} palette={palette} />
        ))}
        <Text color={MUTED} wrap="truncate-end">
          {' '.repeat(LABEL)}
          {axis(peak, bar)}
        </Text>
        {models.length === 0 ? (
          <Text color={MUTED}>no tokens in {start > 0 ? 'these' : 'the last'} days</Text>
        ) : (
          <Legend models={models} palette={palette} />
        )}
        {hint}
      </Box>
    </Box>
  );
}

function ScrollHint({ newer, older }: { newer: number; older: number }) {
  return (
    <Text color={MUTED} wrap="truncate-end">
      {[newer > 0 && `↑ ${newer} newer`, older > 0 && `↓ ${older} older`].filter(Boolean).join('   ') || ' '}
    </Text>
  );
}

/** Day label and the gap before the bar. */
const LABEL = 7;
/** Columns per axis label, roughly; sets how many ticks fit. */
const TICK_SPACING = 12;

/**
 * Token values under the bars at round steps (1, 2, 2.5 or 5 × 10^n), each label
 * centered on the cell its value reaches; a label that would touch the previous one is skipped.
 */
export function axis(peak: number, bar: number): string {
  if (peak <= 0) return '';
  const raw = peak / Math.max(1, Math.floor(bar / TICK_SPACING));
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw)!;
  let line = '';
  for (let i = 0; i * step <= peak; i++) {
    const label = formatTokens(i * step);
    const at = ((i * step) / peak) * bar;
    const start = Math.max(0, Math.min(Math.round(at - label.length / 2), bar - label.length));
    if (i > 0 && start < line.length + 2) continue;
    line = line.padEnd(start) + label;
  }
  return line;
}

/** Cost only when every day with tokens has one, as a partial sum would pass for the whole. */
function summary(rows: DayRow[]) {
  const tokens = rows.reduce((a, d) => a + d.tokens, 0);
  const costs = rows.filter((d) => d.tokens > 0).map((d) => d.cost);
  const known = costs.length > 0 && costs.every((c) => c !== null);
  return {
    tokens,
    avg: rows.length ? tokens / rows.length : 0,
    peak: Math.max(0, ...rows.map((d) => d.tokens)),
    cost: known ? costs.reduce((a: number, c) => a + c!, 0) : null,
  };
}

interface SkeletonProps {
  dates: string[];
  start: number;
  bar: number;
  hint: React.ReactNode;
}

/** Same rows as the loaded history, so the frame does not move when the data lands. The header shows the progress. */
function Skeleton({ dates, start, bar, hint }: SkeletonProps) {
  return (
    <Box flexDirection="column">
      <Text bold>{titleOf(dates, start)}</Text>
      <Box flexDirection="column" paddingLeft={INDENT}>
        {dates.map((date, i) => (
          <Text key={date} wrap="truncate-end">
            <DayLabel date={date} today={start + i === 0} />
            {'  '}
            <Text color={MUTED}>{'─'.repeat(bar)}</Text>
          </Text>
        ))}
        {/* Hold the axis and legend rows. */}
        <Text> </Text>
        <Text> </Text>
        {hint}
      </Box>
    </Box>
  );
}

function DayLabel({ date, today }: { date: string; today: boolean }) {
  return (
    <Text color={today ? 'cyan' : isWeekend(date) ? MUTED : undefined} bold={today}>
      {formatDay(date)}
    </Text>
  );
}

/** Models ordered by their tokens over the shown rows, so segments keep one order on every row. */
export function modelOrder(rows: { tokensByModel: Record<string, number> }[]): string[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    for (const [model, tokens] of Object.entries(row.tokensByModel)) {
      totals.set(model, (totals.get(model) ?? 0) + tokens);
    }
  }
  return [...totals]
    .filter(([, tokens]) => tokens > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([model]) => model);
}

interface DayProps {
  day: DayRow;
  today: boolean;
  models: string[];
  peak: number;
  bar: number;
  palette: Map<string, string>;
}

function Day({ day, today, models, peak, bar, palette }: DayProps) {
  const length = barCells(day.tokens, peak, bar);
  const cells = splitCells(
    models.map((m) => day.tokensByModel[m] ?? 0),
    length,
  );
  return (
    <Text wrap="truncate-end">
      <DayLabel date={day.date} today={today} />
      {'  '}
      {day.tokens === 0 ? (
        <Text color={MUTED}>{'─'.repeat(bar)}</Text>
      ) : (
        <>
          {models.map((m, i) =>
            cells[i] ? (
              <Text key={m} color={palette.get(m)}>
                {BLOCK.repeat(cells[i]!)}
              </Text>
            ) : null,
          )}
          <Text color={MUTED}>{'─'.repeat(bar - length)}</Text>
        </>
      )}
      {'  '}
      {(day.tokens ? formatTokens(day.tokens) : '').padStart(6)}
      {'  '}
      <Text color={MUTED}>{formatCost(day.tokens ? day.cost : null, 4)}</Text>
    </Text>
  );
}

/** A colored square and name per model; `truncate` picks which end gives way when it does not fit. */
export function Legend({
  models,
  palette,
  truncate = 'truncate-end',
}: {
  models: string[];
  palette: Map<string, string>;
  truncate?: 'truncate-end' | 'truncate-start';
}) {
  return (
    <Text wrap={truncate}>
      {models.map((m, i) => (
        <Text key={m}>
          {i > 0 && '   '}
          <Text color={palette.get(m)}>■</Text>
          <Text color={MUTED}> {m}</Text>
        </Text>
      ))}
    </Text>
  );
}
