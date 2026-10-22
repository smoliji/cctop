import React from 'react';
import { Box, Text } from 'ink';
import type { Overview, Period, Ranked } from '../types.js';
import { INDENT, PANEL_GAP, type Panel } from '../layout.js';
import { BLOCK, fit, formatTokens } from '../format.js';

const MIN_SHARE = 6;

const TITLES: Record<Panel, string> = {
  skills: 'TOP SKILLS',
  tools: 'TOOLS',
  models: 'MODELS',
  projects: 'PROJECTS',
  // Not "subagents": the totals count distinct subagents, this panel counts Agent calls.
  agents: 'AGENT TYPES',
};

interface Props {
  /** Null, or pending for the period, while the scan has not read it yet. */
  overview: Overview | null;
  period: Period;
  panels: Panel[];
  widths: number[];
  rows: number;
  palette: Map<string, string>;
}

export function Panels({ overview, period, panels, widths, rows, palette }: Props) {
  const ready = overview && !overview.pending.period ? overview : null;
  return (
    <Box gap={PANEL_GAP}>
      {panels.map((panel, i) => (
        <Box key={panel} flexDirection="column" width={widths[i]} flexShrink={0}>
          <Text bold wrap="truncate-end">
            {TITLES[panel]} <Text color="gray">· {overview?.period ?? period}</Text>
          </Text>
          <Box flexDirection="column" paddingLeft={INDENT}>
            {ready ? (
              <Items items={items(panel, ready, palette).slice(0, rows)} width={widths[i]! - INDENT} />
            ) : (
              <Text color="gray">…</Text>
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

/** One panel row: a name, its value and an optional share bar. */
interface Item {
  key: string;
  name: string;
  prefix?: string;
  value: string;
  color?: string;
  share?: number;
}

function items(panel: Panel, overview: Overview, palette: Map<string, string>): Item[] {
  const ranked = (list: Ranked[]): Item[] =>
    list.map((r) => ({
      key: r.name,
      name: r.server ?? r.name,
      ...(r.server ? { prefix: 'mcp ' } : {}),
      value: String(r.count),
    }));
  switch (panel) {
    case 'skills':
      return ranked(overview.topSkills);
    case 'tools':
      return ranked(overview.topTools);
    case 'agents':
      return ranked(overview.topAgents);
    case 'projects':
      return overview.projects.map((p) => ({ key: p.path, name: p.name, value: formatTokens(p.tokens) }));
    case 'models':
      return overview.models.map((m) => ({
        key: m.name,
        name: m.name,
        value: `${Math.round(m.share * 100)}%`,
        color: palette.get(m.name),
        share: m.share,
      }));
  }
}

/**
 * The name column fits the longest name, not the panel, so values stay next to
 * their names; a share bar after the value takes the rest of the panel.
 */
function Items({ items, width }: { items: Item[]; width: number }) {
  if (items.length === 0) return <Text color="gray">none</Text>;
  const value = Math.max(...items.map((i) => i.value.length));
  const shares = items.some((i) => i.share !== undefined);
  const longest = Math.max(...items.map((i) => (i.prefix?.length ?? 0) + i.name.length));
  const name = Math.max(1, Math.min(longest, width - value - 1 - (shares ? MIN_SHARE + 1 : 0)));
  const bar = shares ? Math.max(MIN_SHARE, width - name - value - 2) : 0;
  return items.map((item) => {
    const prefix = item.prefix ?? '';
    const filled = item.share === undefined ? 0 : Math.round(item.share * bar);
    return (
      <Text key={item.key} wrap="truncate-end">
        {prefix && <Text color="yellow">{prefix}</Text>}
        <Text color={item.color}>{fit(item.name, name - prefix.length)}</Text> {item.value.padStart(value)}
        {bar > 0 && (
          <>
            {' '}
            <Text color={item.color}>{BLOCK.repeat(filled)}</Text>
            <Text color="gray">{'─'.repeat(bar - filled)}</Text>
          </>
        )}
      </Text>
    );
  });
}
