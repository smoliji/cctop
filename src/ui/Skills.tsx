import React from 'react';
import { Box, Text } from 'ink';
import type { Overview, SkillRow } from '../types.js';
import { fit, formatCost, formatDuration, formatTokens } from '../format.js';
import { INDENT } from '../layout.js';

export type SkillSort = 'uses' | 'tokens' | 'recent';
export const SKILL_SORTS: SkillSort[] = ['uses', 'tokens', 'recent'];

interface Column {
  title: string;
  width: number;
  value: (row: SkillRow, now: number) => string;
  sort?: SkillSort;
}

// Listed in the order they are dropped when the terminal is narrow: last goes first.
const COLUMNS: Column[] = [
  { title: 'USES', width: 5, value: (r) => String(r.calls + r.typed), sort: 'uses' },
  { title: 'TOKENS', width: 7, value: (r) => (r.tokens ? formatTokens(r.tokens) : '·'), sort: 'tokens' },
  { title: 'LAST', width: 8, value: (r, now) => (r.lastUsed ? `${formatDuration(now - r.lastUsed).split(' ')[0]} ago` : '·'), sort: 'recent' },
  { title: 'COST*', width: 6, value: (r) => (!r.tokens ? '·' : r.cost !== null && r.cost < 0.5 ? '<$1' : formatCost(r.cost)) },
  { title: 'MODEL', width: 5, value: (r) => count(r.calls) },
  { title: 'YOU', width: 4, value: (r) => count(r.typed) },
  { title: 'TURNS', width: 6, value: (r) => count(r.turns) },
  { title: 'ALL TIME', width: 8, value: (r) => (r.allTime === null ? '·' : String(r.allTime)) },
];
const GAP = 2;
const MIN_NAME = 20;

const count = (n: number) => (n ? String(n) : '·');
const right = (text: string, width: number) => (text.length > width ? fit(text, width) : text.padStart(width));

export function sortSkills(rows: SkillRow[], sort: SkillSort): SkillRow[] {
  const key: Record<SkillSort, (r: SkillRow) => number> = {
    uses: (r) => r.calls + r.typed,
    tokens: (r) => r.tokens,
    recent: (r) => r.lastUsed ?? 0,
  };
  return [...rows].sort((a, b) => key[sort](b) - key[sort](a) || a.name.localeCompare(b.name));
}

/** Columns that fit next to a name of at least MIN_NAME. */
function columnsFor(width: number): Column[] {
  const shown = [...COLUMNS];
  while (shown.length > 1 && width - INDENT - MIN_NAME < shown.reduce((a, c) => a + c.width + GAP, 0)) shown.pop();
  return shown;
}

interface Props {
  overview: Overview;
  sort: SkillSort;
  offset: number;
  rows: number;
  width: number;
}

export function Skills({ overview, sort, offset, rows, width }: Props) {
  const all = sortSkills(overview.skills, sort);
  const columns = columnsFor(width);
  const name = width - INDENT - columns.reduce((a, c) => a + c.width + GAP, 0);
  const start = Math.max(0, Math.min(offset, all.length - rows));
  const shown = all.slice(start, start + rows);
  const more = all.length - start - shown.length;
  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Text bold>
          SKILLS <Text color="gray">· {overview.period}</Text>
        </Text>
        <Text color="gray">
          {all.length} skills · sorted by {sort}
        </Text>
      </Box>
      <Box flexDirection="column" paddingLeft={INDENT}>
        <Text color="gray" wrap="truncate-end">
          {fit('', name)}
          {columns.map((c) => (
            <Text key={c.title} bold={c.sort === sort}>
              {' '.repeat(GAP)}
              {c.title.padStart(c.width)}
            </Text>
          ))}
        </Text>
        {all.length === 0 && <Text color="gray">no skills used in this period</Text>}
        {shown.map((row) => (
          <Text key={row.name} wrap="truncate-end">
            {fit(row.name, name)}
            {columns.map((c) => (
              <Text key={c.title} color={c.sort === sort ? undefined : 'gray'}>
                {' '.repeat(GAP)}
                {right(c.value(row, overview.now), c.width)}
              </Text>
            ))}
          </Text>
        ))}
        <Text color="gray">
          {[start > 0 && `↑ ${start} more`, more > 0 && `↓ ${more} more`].filter(Boolean).join('   ') || ' '}
        </Text>
      </Box>
    </Box>
  );
}
