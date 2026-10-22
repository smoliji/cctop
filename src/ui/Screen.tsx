import React from 'react';
import { Box, Text } from 'ink';
import type { ClaudeState, Overview, Period } from '../types.js';
import type { Progress } from '../sources/transcripts.js';
import { computeLayout, HEAD_GAP, MIN_COLUMNS, MIN_ROWS, TOTALS_WIDTH } from '../layout.js';
import { formatClock, modelPalette, MUTED } from '../format.js';
import { History } from './History.js';
import { labelWidth, limitLines, Limits } from './Limits.js';
import { Panels } from './Panels.js';
import { Skills, type SkillSort } from './Skills.js';
import { Totals, TotalsStrip } from './Totals.js';

export interface Status {
  version: string;
  interval: number;
  refreshedAt: number | null;
  refreshing: boolean;
  /** Files read so far while a scan has files to read. */
  progress: Progress | null;
  error?: string;
}

export type Tab = 'overview' | 'skills';
export const TABS: Tab[] = ['overview', 'skills'];
const TAB_TITLES: Record<Tab, string> = { overview: 'Overview', skills: 'Skills' };

export interface View {
  tab: Tab;
  period: Period;
  skillSort: SkillSort;
  skillOffset: number;
}

export const DEFAULT_VIEW: View = { tab: 'overview', period: '7d', skillSort: 'uses', skillOffset: 0 };

interface Props {
  overview: Overview | null;
  state: ClaudeState;
  now: number;
  status: Status;
  columns: number;
  rows: number;
  view?: View;
}

// header, blank, title, column header, scroll hint, blank, footer
export const SKILLS_CHROME = 7;

/**
 * One full frame. Limits come from `state` and draw at once; `overview` is null
 * until the scan has read enough, and sections it has not reached yet draw placeholders.
 */
export function Screen({ overview, state, now, status, columns, rows, view = DEFAULT_VIEW }: Props) {
  // From `state`, not `overview`, so the layout does not jump when the data lands.
  const usage = state.usage;
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
    <Box flexDirection="column" width={layout.width + 2} height={rows} paddingX={1} gap={1}>
      <Header status={status} tab={view.tab} width={layout.width} />
      {view.tab === 'skills' ? (
        <Skills
          overview={overview}
          state={state}
          period={view.period}
          palette={palette}
          sort={view.skillSort}
          offset={view.skillOffset}
          rows={Math.max(1, rows - SKILLS_CHROME)}
          width={layout.width}
          now={now}
        />
      ) : (
        <>
          {layout.wide ? (
            <Box gap={HEAD_GAP}>
              <Box width={layout.head} flexShrink={0} flexDirection="column">
                <Limits usage={usage} now={now} bar={layout.meterBar} />
              </Box>
              <Box width={TOTALS_WIDTH} flexShrink={0} flexDirection="column">
                <Totals overview={overview} period={view.period} />
              </Box>
            </Box>
          ) : (
            <Limits usage={usage} now={now} bar={layout.meterBar} />
          )}
          {layout.strip && <TotalsStrip overview={overview} period={view.period} width={layout.width} />}
          <History
            overview={overview}
            now={now}
            days={layout.days}
            bar={layout.dayBar}
            palette={palette}
          />
          {layout.panels.length > 0 && (
            <Panels
              overview={overview}
              period={view.period}
              panels={layout.panels}
              widths={layout.panelWidths}
              rows={layout.panelRows}
              palette={palette}
            />
          )}
        </>
      )}
      {/* Takes the rows the sections leave, so the footer sits on the last row; the margin cancels its gap. */}
      <Box flexGrow={1} marginTop={-1} />
      <Footer error={status.error} tab={view.tab} width={layout.width} />
    </Box>
  );
}

/** Every model on screen, so the history and the panels share one palette. */
function modelsOf(overview: Overview): string[] {
  return [...overview.models.map((m) => m.name), ...overview.days.flatMap((d) => Object.keys(d.tokensByModel))];
}

/** Content width from which the header has room for the refresh interval beside the tabs. */
const INTERVAL_WIDTH = 62;

function Header({ status, tab, width }: { status: Status; tab: Tab; width: number }) {
  const { progress, refreshing, refreshedAt } = status;
  const time = refreshedAt === null ? '--:--:--' : formatClock(refreshedAt);
  return (
    <Box justifyContent="space-between" gap={2}>
      <Text wrap="truncate-end">
        <Text bold>cctop</Text> <Text color={MUTED}>{status.version}</Text>
        {TABS.map((t, i) => (
          <Text key={t}>
            {'   '}
            <Text color={MUTED}>{i + 1}</Text>{' '}
            <Text bold={t === tab} color={t === tab ? 'cyan' : MUTED}>
              {TAB_TITLES[t]}
            </Text>
          </Text>
        ))}
      </Text>
      <Text color={MUTED} wrap="truncate-start">
        {width >= INTERVAL_WIDTH && `refresh ${status.interval}s · `}
        {progress && progress.total > 0 ? (
          <Text color="yellow">
            scanning {progress.done}/{progress.total}
          </Text>
        ) : refreshing ? (
          <Text color="yellow">scanning</Text>
        ) : (
          <Text>{time}</Text>
        )}
      </Text>
    </Box>
  );
}

const NOTES = ['* API list-price equivalent', '* list price'];

function Footer({ error, tab, width }: { error?: string; tab: Tab; width: number }) {
  const keys: [string, string][] = [
    ['tab', 'switch'],
    ...(tab === 'skills' ? ([['s', 'sort'], ['↑↓', 'scroll']] as [string, string][]) : []),
    ['p', 'period'],
    ['r', 'refresh'],
    ['q', 'quit'],
  ];
  const used = keys.reduce((n, [key, label]) => n + key.length + label.length + 1, 0) + 2 * (keys.length - 1);
  const note = NOTES.find((n) => used + 2 + n.length <= width) ?? '';
  return (
    <Box justifyContent="space-between" gap={2}>
      <Box flexShrink={0}>
        <Text color={MUTED}>
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
        <Text color={MUTED} wrap="truncate-end">
          {note}
        </Text>
      )}
    </Box>
  );
}
