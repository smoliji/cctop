import React from 'react';
import { Box, Text } from 'ink';
import type { DayRow, Overview } from '../types.js';
import { BLOCK, barCells, formatCost, formatDay, formatTokens, isWeekend, splitCells } from '../format.js';
import { INDENT } from '../layout.js';

interface Props {
  overview: Overview;
  days: number;
  bar: number;
  palette: Map<string, string>;
}

export function History({ overview, days, bar, palette }: Props) {
  const { week } = overview;
  const rows = overview.days.slice(0, days);
  const models = modelOrder(rows);
  const cost = week.cost === null ? '' : `  ${formatCost(week.cost)}*`;
  const title = rows.length === 1 ? 'TOKENS · TODAY' : `TOKENS · LAST ${rows.length} DAYS`;
  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Text bold>{title}</Text>
        <Text color="gray">
          avg {formatTokens(week.avg)}  peak {formatTokens(week.peak)}  7d {formatTokens(week.tokens)}
          {cost}
        </Text>
      </Box>
      <Box flexDirection="column" paddingLeft={INDENT}>
        {rows.map((day, i) => (
          <Day key={day.date} day={day} today={i === 0} models={models} peak={week.peak} bar={bar} palette={palette} />
        ))}
        <Legend models={models} palette={palette} />
      </Box>
    </Box>
  );
}

/** Models ordered by their tokens over the shown days, so segments keep one order on every row. */
export function modelOrder(days: DayRow[]): string[] {
  const totals = new Map<string, number>();
  for (const day of days) {
    for (const [model, tokens] of Object.entries(day.tokensByModel)) {
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
  const label = formatDay(day.date);
  const labelColor = today ? 'cyan' : isWeekend(day.date) ? 'gray' : undefined;
  const length = barCells(day.tokens, peak, bar);
  const cells = splitCells(
    models.map((m) => day.tokensByModel[m] ?? 0),
    length,
  );
  return (
    <Text wrap="truncate-end">
      <Text color={labelColor} bold={today}>
        {label}
      </Text>
      {'  '}
      {day.tokens === 0 ? (
        <Text color="gray">{'·'.padEnd(bar)}</Text>
      ) : (
        <>
          {models.map((m, i) =>
            cells[i] ? (
              <Text key={m} color={palette.get(m)}>
                {BLOCK.repeat(cells[i]!)}
              </Text>
            ) : null,
          )}
          {' '.repeat(bar - length)}
        </>
      )}
      {'  '}
      {(day.tokens ? formatTokens(day.tokens) : '').padStart(6)}
      {'  '}
      <Text color="gray">{formatCost(day.tokens ? day.cost : null, 4)}</Text>
    </Text>
  );
}

function Legend({ models, palette }: { models: string[]; palette: Map<string, string> }) {
  if (models.length === 0) return <Text color="gray">no tokens in the last days</Text>;
  return (
    <Text wrap="truncate-end">
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
