import React from 'react';
import { Box, Text } from 'ink';
import type { DayRow, Overview } from '../types.js';
import { BLOCK, barCells, formatCost, formatDay, formatTokens, isWeekend, splitCells } from '../format.js';
import { INDENT } from '../layout.js';
import { recentDates } from '../overview.js';

interface Props {
  overview: Overview | null;
  now: number;
  days: number;
  bar: number;
  palette: Map<string, string>;
}

const titleOf = (days: number) => (days === 1 ? 'TOKENS · TODAY' : `TOKENS · LAST ${days} DAYS`);

export function History({ overview, now, days, bar, palette }: Props) {
  if (!overview || overview.pending.days) return <Skeleton now={now} days={days} bar={bar} />;
  // Summary and scale cover the shown rows only, so a short terminal never refers to a day it hides.
  const rows = overview.days.slice(0, days);
  const { tokens, avg, peak, cost } = summary(rows);
  const models = modelOrder(rows);
  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between" gap={2}>
        <Text bold>{titleOf(rows.length)}</Text>
        <Text color="gray" wrap="truncate-start">
          avg {formatTokens(avg)}  peak {formatTokens(peak)}  {rows.length}d {formatTokens(tokens)}
          {cost === null ? '' : `  ${formatCost(cost)}*`}
        </Text>
      </Box>
      <Box flexDirection="column" paddingLeft={INDENT}>
        {rows.map((day, i) => (
          <Day key={day.date} day={day} today={i === 0} models={models} peak={peak} bar={bar} palette={palette} />
        ))}
        {models.length === 0 ? (
          <Text color="gray">no tokens in the last days</Text>
        ) : (
          <Legend models={models} palette={palette} />
        )}
      </Box>
    </Box>
  );
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

/** Same rows as the loaded history, so the frame does not move when the data lands. The header shows the progress. */
function Skeleton({ now, days, bar }: { now: number; days: number; bar: number }) {
  return (
    <Box flexDirection="column">
      <Text bold>{titleOf(days)}</Text>
      <Box flexDirection="column" paddingLeft={INDENT}>
        {recentDates(now)
          .slice(0, days)
          .map((date, i) => (
            <Text key={date} wrap="truncate-end">
              <DayLabel date={date} today={i === 0} />
              {'  '}
              <Text color="gray">{'─'.repeat(bar)}</Text>
            </Text>
          ))}
        {/* Holds the legend's row. */}
        <Text> </Text>
      </Box>
    </Box>
  );
}

function DayLabel({ date, today }: { date: string; today: boolean }) {
  return (
    <Text color={today ? 'cyan' : isWeekend(date) ? 'gray' : undefined} bold={today}>
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
        <Text color="gray">{'─'.repeat(bar)}</Text>
      ) : (
        <>
          {models.map((m, i) =>
            cells[i] ? (
              <Text key={m} color={palette.get(m)}>
                {BLOCK.repeat(cells[i]!)}
              </Text>
            ) : null,
          )}
          <Text color="gray">{'─'.repeat(bar - length)}</Text>
        </>
      )}
      {'  '}
      {(day.tokens ? formatTokens(day.tokens) : '').padStart(6)}
      {'  '}
      <Text color="gray">{formatCost(day.tokens ? day.cost : null, 4)}</Text>
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
          <Text color="gray"> {m}</Text>
        </Text>
      ))}
    </Text>
  );
}
