import React from 'react';
import { Box, Text } from 'ink';
import type { Overview } from '../types.js';
import { computeLayout, MIN_COLUMNS, MIN_ROWS } from '../layout.js';
import { formatClock, modelPalette } from '../format.js';
import { History } from './History.js';
import { labelWidth, limitLines, Limits } from './Limits.js';
import { Panels } from './Panels.js';
import { Skills, type SkillSort } from './Skills.js';

export interface Status {
  version: string;
  interval: number;
  refreshedAt: number | null;
  refreshing: boolean;
  error?: string;
}

export type Tab = 'overview' | 'skills';
export const TABS: Tab[] = ['overview', 'skills'];
const TAB_TITLES: Record<Tab, string> = { overview: 'Overview', skills: 'Skills' };

export interface View {
  tab: Tab;
  skillSort: SkillSort;
  skillOffset: number;
}

export const DEFAULT_VIEW: View = { tab: 'overview', skillSort: 'uses', skillOffset: 0 };

interface Props {
  overview: Overview | null;
  status: Status;
  columns: number;
  rows: number;
  view?: View;
}

// header, blank, title, column header, scroll hint, blank, footer, headroom
export const SKILLS_CHROME = 8;

/** One full frame; `overview` is null until the first scan finishes. */
export function Screen({ overview, status, columns, rows, view = DEFAULT_VIEW }: Props) {
  const usage = overview?.usage ?? null;
  const layout = computeLayout(columns, rows, { lines: limitLines(usage), labelWidth: labelWidth(usage) });
  if (layout.tooSmall) {
    return (
      <Text color="yellow" wrap="truncate-end">
        terminal too small (needs {MIN_COLUMNS}×{MIN_ROWS})
      </Text>
    );
  }
  const palette = overview ? modelPalette(modelsOf(overview)) : new Map<string, string>();
  return (
    <Box flexDirection="column" width={layout.width + 2} paddingX={1} gap={1}>
      <Header status={status} tab={view.tab} />
      {!overview ? (
        <Text color="gray">{status.error ? 'no data yet' : 'scanning transcripts…'}</Text>
      ) : view.tab === 'skills' ? (
        <Skills
          overview={overview}
          sort={view.skillSort}
          offset={view.skillOffset}
          rows={Math.max(1, rows - SKILLS_CHROME)}
          width={layout.width}
        />
      ) : (
        <>
          <Limits usage={overview.usage} now={overview.now} bar={layout.meterBar} />
          <History overview={overview} days={layout.days} bar={layout.dayBar} palette={palette} />
          {layout.panels.length > 0 && (
            <Panels
              overview={overview}
              panels={layout.panels}
              rows={layout.panelRows}
              width={layout.width}
              palette={palette}
            />
          )}
        </>
      )}
      <Footer error={status.error} tab={view.tab} />
    </Box>
  );
}

/** Every model on screen, so the history and the panels share one palette. */
function modelsOf(overview: Overview): string[] {
  return [...overview.models.map((m) => m.name), ...overview.days.flatMap((d) => Object.keys(d.tokensByModel))];
}

function Header({ status, tab }: { status: Status; tab: Tab }) {
  const time = status.refreshedAt === null ? '--:--:--' : formatClock(status.refreshedAt);
  return (
    <Box justifyContent="space-between" gap={2}>
      <Text wrap="truncate-end">
        <Text bold>cctop</Text> <Text color="gray">{status.version}</Text>
        {TABS.map((t, i) => (
          <Text key={t}>
            {'   '}
            <Text color="gray">{i + 1}</Text>{' '}
            <Text bold={t === tab} color={t === tab ? 'cyan' : 'gray'}>
              {TAB_TITLES[t]}
            </Text>
          </Text>
        ))}
      </Text>
      <Text color="gray" wrap="truncate-start">
        refresh {status.interval}s ·{' '}
        {status.refreshing ? <Text color="yellow">scanning</Text> : <Text>{time}</Text>}
      </Text>
    </Box>
  );
}

function Footer({ error, tab }: { error?: string; tab: Tab }) {
  const keys: [string, string][] = [
    ['tab', 'switch'],
    ...(tab === 'skills' ? ([['s', 'sort'], ['↑↓', 'scroll']] as [string, string][]) : []),
    ['p', 'period'],
    ['r', 'refresh'],
    ['q', 'quit'],
  ];
  return (
    <Box justifyContent="space-between" gap={2}>
      <Box flexShrink={0}>
        <Text color="gray">
          {keys.map(([key, label], i) => (
            <Text key={key}>
              {i > 0 && '  '}
              <Text bold>{key}</Text> {label}
            </Text>
          ))}
        </Text>
      </Box>
      {error ? (
        <Text color="red" wrap="truncate-end">
          {error}
        </Text>
      ) : (
        <Text color="gray" wrap="truncate-end">
          * API list-price equivalent
        </Text>
      )}
    </Box>
  );
}
