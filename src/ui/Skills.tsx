import React from 'react';
import { Box, Text } from 'ink';
import type { ClaudeState, Overview, Period, SkillRow } from '../types.js';
import { barCells, BLOCK, fit, formatCost, formatDuration, formatTokens, MUTED, splitCells } from '../format.js';
import { INDENT } from '../layout.js';
import { lifetimeSkills, localDate } from '../overview.js';
import { Legend, modelOrder } from './History.js';

export type SkillSort = 'uses' | 'tokens' | 'recent';
export const SKILL_SORTS: SkillSort[] = ['uses', 'tokens', 'recent'];

interface Column {
  title: string;
  width: number;
  value: (row: SkillRow, now: number) => string;
  sort?: SkillSort;
  /** Breakdown or context, shown gray beside the primary numbers. */
  tone?: 'secondary';
  color?: (row: SkillRow, now: number) => string | undefined;
}

const GAP = 2;
const MIN_NAME = 20;
/** Names grow to this before the bar and the gray columns get any room. */
const NAME = 32;
const MIN_BAR = 16;
const SHARE = 'SHARE';
const DAY = 86_400_000;

// Listed in the order they are dropped when the terminal is narrow: last goes first.
// SHARE stands for the token bar. It is drawn last, like htop's Command column, and takes
// the spare width, so the numbers stay next to the name on any terminal.
const COLUMNS: Column[] = [
  { title: 'USES', width: 5, value: (r) => String(r.calls + r.typed), sort: 'uses' },
  { title: 'TOKENS', width: 7, value: (r) => (r.tokens ? formatTokens(r.tokens) : '·'), sort: 'tokens' },
  {
    title: 'LAST',
    width: 8,
    value: (r, now) => (r.lastUsed ? `${formatDuration(now - r.lastUsed).split(' ')[0]} ago` : '·'),
    sort: 'recent',
    color: (r, now) => recency(r.lastUsed, now),
  },
  { title: 'COST*', width: 6, value: (r) => (!r.tokens ? '·' : r.cost !== null && r.cost < 0.5 ? '<$1' : formatCost(r.cost)) },
  { title: SHARE, width: MIN_BAR, value: () => '' },
  { title: 'MODEL', width: 5, value: (r) => count(r.calls), tone: 'secondary' },
  { title: 'YOU', width: 4, value: (r) => count(r.typed), tone: 'secondary' },
  { title: 'TURNS', width: 6, value: (r) => count(r.turns), tone: 'secondary' },
  { title: 'ALL TIME', width: 8, value: (r) => (r.allTime === null ? '·' : String(r.allTime)), tone: 'secondary' },
];
// Until the transcripts are read only Claude Code's own lifetime counter is known.
const LIFETIME = COLUMNS.filter((c) => c.title === 'ALL TIME');

const HEAD = { backgroundColor: 'green', color: 'black' } as const;
const SORTED = { backgroundColor: 'cyan', color: 'black', bold: true } as const;

const count = (n: number) => (n ? String(n) : '·');
const right = (text: string, width: number) => (text.length > width ? fit(text, width) : text.padStart(width));
const spaces = (n: number) => ' '.repeat(n);
const spanOf = (columns: Column[]) => columns.reduce((a, c) => a + c.width + GAP, 0);

export function sortSkills(rows: SkillRow[], sort: SkillSort): SkillRow[] {
  const key: Record<SkillSort, (r: SkillRow) => number> = {
    uses: (r) => r.calls + r.typed,
    tokens: (r) => r.tokens,
    recent: (r) => r.lastUsed ?? 0,
  };
  return [...rows].sort((a, b) => key[sort](b) - key[sort](a) || b.tokens - a.tokens || a.name.localeCompare(b.name));
}

/** The skills to list: the period's when it is read, else the lifetime counts. */
export function skillRows(overview: Overview | null, state: ClaudeState): SkillRow[] {
  return !overview || overview.pending.period ? lifetimeSkills(state) : overview.skills;
}

/** Used today reads cyan like today's history row; older than a week turns gray, since dim is not available. */
export function recency(lastUsed: number | null, now: number): string | undefined {
  if (lastUsed === null) return MUTED;
  if (localDate(lastUsed) === localDate(now)) return 'cyan';
  return now - lastUsed > 7 * DAY ? MUTED : undefined;
}

export interface Table {
  /** Columns between the name and the bar, without SHARE. */
  columns: Column[];
  name: number;
  /** Width of the token bar; 0 when it does not fit. */
  bar: number;
}

/**
 * Drops columns until the rest fit: the primary ones beside a name of MIN_NAME,
 * the bar and the gray ones beside a name of up to NAME. The name then grows up
 * to the longest one and every cell beyond that goes to the bar.
 */
export function skillTable(width: number, longest: number, all: Column[] = COLUMNS): Table {
  const room = width - INDENT;
  const comfort = Math.min(Math.max(MIN_NAME, longest), NAME);
  const need = (c: Column) => (c.tone === 'secondary' || c.title === SHARE ? comfort : MIN_NAME);
  const columns = [...all];
  while (columns.length > 1 && room - need(columns.at(-1)!) < spanOf(columns)) columns.pop();
  // MODEL and YOU split USES between them; MODEL alone would read like a total.
  if (columns.at(-1)?.title === 'MODEL') columns.pop();
  const free = room - spanOf(columns);
  const name = Math.min(free, Math.max(MIN_NAME, longest));
  if (!columns.some((c) => c.title === SHARE)) return { columns, name, bar: 0 };
  return { columns: columns.filter((c) => c.title !== SHARE), name, bar: free - name + MIN_BAR };
}

/**
 * `plugin:skill` cut to exactly `width` columns. The plugin gives way first, so
 * the skill stays whole as long as it fits on its own.
 */
export function splitName(name: string, width: number): { plugin: string; skill: string } {
  const cut = name.lastIndexOf(':');
  if (cut < 0) return { plugin: '', skill: fit(name, width) };
  const plugin = name.slice(0, cut);
  const skill = name.slice(cut + 1);
  if (name.length <= width) return { plugin: `${plugin}:`, skill: skill.padEnd(width - plugin.length - 1) };
  const room = width - skill.length - 1;
  if (room >= 1) return { plugin: `${fit(plugin, room)}:`, skill };
  return { plugin: '', skill: fit(skill, width) };
}

/** "27 skills  187M tokens  30% of all  $110*"; the cost only when every row with tokens has one. */
function summary(rows: SkillRow[], overview: Overview): string {
  const used = rows.filter((r) => r.tokens > 0);
  const tokens = used.reduce((a, r) => a + r.tokens, 0);
  const share = overview.totals.tokens ? Math.round((tokens / overview.totals.tokens) * 100) : 0;
  const costs = used.map((r) => r.cost);
  const known = costs.length > 0 && costs.every((c) => c !== null);
  const cost = known ? `  ${formatCost(costs.reduce((a: number, c) => a + c!, 0))}*` : '';
  return `${rows.length} skills  ${formatTokens(tokens)} tokens  ${share}% of all${cost}`;
}

interface Props {
  overview: Overview | null;
  state: ClaudeState;
  period: Period;
  palette: Map<string, string>;
  sort: SkillSort;
  offset: number;
  rows: number;
  width: number;
  now: number;
}

export function Skills({ overview, state, period, palette, sort, offset, rows, width, now }: Props) {
  const loaded = overview && !overview.pending.period ? overview : null;
  const all = loaded ? sortSkills(loaded.skills, sort) : skillRows(overview, state);
  const longest = Math.max(0, ...all.map((r) => r.name.length));
  const { columns, name, bar } = skillTable(width, longest, loaded ? COLUMNS : LIFETIME);
  const start = Math.max(0, Math.min(offset, all.length - rows));
  const shown = all.slice(start, start + rows);
  const more = all.length - start - shown.length;
  const peak = Math.max(0, ...all.map((r) => r.tokens));
  const models = modelOrder(all);
  const sorted = loaded ? sort : undefined;
  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between" gap={2}>
        <Text bold>
          SKILLS <Text color={MUTED}>· {overview?.period ?? period}</Text>
        </Text>
        <Text color={MUTED} wrap="truncate-start">
          {loaded ? summary(all, loaded) : `${all.length} skills · lifetime counts`}
        </Text>
      </Box>
      <Header columns={columns} name={name} bar={bar} sort={sorted} width={width} />
      {all.length === 0 && (
        <Text color={MUTED}>
          {spaces(INDENT)}
          {loaded ? 'no skills used in this period' : 'reading transcripts…'}
        </Text>
      )}
      {shown.map((row) => (
        <Text key={row.name} wrap="truncate-end">
          {spaces(INDENT)}
          <Name name={row.name} width={name} />
          {columns.map((c) => {
            const value = c.value(row, now);
            const color = value === '·' ? MUTED : c.color ? c.color(row, now) : c.tone === 'secondary' ? MUTED : undefined;
            return (
              <Text key={c.title} color={color} bold={c.sort === sorted && value !== '·'}>
                {spaces(GAP)}
                {right(value, c.width)}
              </Text>
            );
          })}
          {bar > 0 && (
            <>
              {spaces(GAP)}
              <Bar row={row} models={models} peak={peak} width={bar} palette={palette} />
            </>
          )}
        </Text>
      ))}
      <Box justifyContent="space-between" gap={2} paddingLeft={INDENT}>
        <Text color={MUTED} wrap="truncate-end">
          {[start > 0 && `↑ ${start} more`, more > 0 && `↓ ${more} more`].filter(Boolean).join('   ') || ' '}
        </Text>
        {bar > 0 && models.length > 0 && <Legend models={models} palette={palette} truncate="truncate-start" />}
      </Box>
    </Box>
  );
}

interface HeaderProps {
  columns: Column[];
  name: number;
  bar: number;
  sort?: SkillSort;
  width: number;
}

/** htop-style bar across the full width, built from sibling segments because Ink garbles a background nested in another. */
function Header({ columns, name, bar, sort, width }: HeaderProps) {
  const rest = Math.max(0, width - INDENT - name - spanOf(columns));
  return (
    <Box>
      <Text {...HEAD}>
        {spaces(INDENT)}
        {fit('SKILL', name)}
      </Text>
      {columns.map((c) => (
        <React.Fragment key={c.title}>
          <Text {...HEAD}>{spaces(GAP)}</Text>
          <Text {...(c.sort === sort ? SORTED : HEAD)}>{c.title.padStart(c.width)}</Text>
        </React.Fragment>
      ))}
      <Text {...HEAD}>{bar > 0 ? `${spaces(GAP)}${fit(SHARE, bar)}` : spaces(rest)}</Text>
    </Box>
  );
}

function Name({ name, width }: { name: string; width: number }) {
  const { plugin, skill } = splitName(name, width);
  return (
    <Text>
      <Text color={MUTED}>{plugin}</Text>
      {skill}
    </Text>
  );
}

interface BarProps {
  row: SkillRow;
  models: string[];
  peak: number;
  width: number;
  palette: Map<string, string>;
}

function Bar({ row, models, peak, width, palette }: BarProps) {
  const length = barCells(row.tokens, peak, width);
  const cells = splitCells(
    models.map((m) => row.tokensByModel[m] ?? 0),
    length,
  );
  return (
    <Text>
      {models.map((m, i) =>
        cells[i] ? (
          <Text key={m} color={palette.get(m)}>
            {BLOCK.repeat(cells[i]!)}
          </Text>
        ) : null,
      )}
      <Text color={MUTED}>{'─'.repeat(width - length)}</Text>
    </Text>
  );
}
