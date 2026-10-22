import React from 'react';
import { Box, Text } from 'ink';
import type { Overview } from '../types.js';
import { computeLayout, MIN_COLUMNS, MIN_ROWS } from '../layout.js';
import { formatClock } from '../format.js';
import { History } from './History.js';
import { labelWidth, limitLines, Limits } from './Limits.js';
import { Panels } from './Panels.js';

export interface Status {
  version: string;
  interval: number;
  refreshedAt: number | null;
  refreshing: boolean;
  error?: string;
}

interface Props {
  overview: Overview | null;
  status: Status;
  columns: number;
  rows: number;
}

/** One full frame of the Overview; `overview` is null until the first scan finishes. */
export function Screen({ overview, status, columns, rows }: Props) {
  const usage = overview?.usage ?? null;
  const layout = computeLayout(columns, rows, { lines: limitLines(usage), labelWidth: labelWidth(usage) });
  if (layout.tooSmall) {
    return (
      <Text color="yellow" wrap="truncate-end">
        terminal too small (needs {MIN_COLUMNS}×{MIN_ROWS})
      </Text>
    );
  }
  return (
    <Box flexDirection="column" width={columns} paddingX={1} gap={1}>
      <Header status={status} />
      {overview ? (
        <>
          <Limits usage={overview.usage} now={overview.now} bar={layout.meterBar} />
          <History overview={overview} days={layout.days} bar={layout.dayBar} />
          {layout.panels.length > 0 && (
            <Panels overview={overview} panels={layout.panels} rows={layout.panelRows} width={layout.width} />
          )}
        </>
      ) : (
        <Text color="gray">{status.error ? 'no data yet' : 'scanning transcripts…'}</Text>
      )}
      <Footer error={status.error} />
    </Box>
  );
}

function Header({ status }: { status: Status }) {
  const time = status.refreshedAt === null ? '--:--:--' : formatClock(status.refreshedAt);
  return (
    <Box justifyContent="space-between">
      <Text>
        <Text bold>cctop</Text> <Text color="gray">{status.version}</Text>
      </Text>
      <Text color="gray">
        refresh {status.interval}s ·{' '}
        {status.refreshing ? <Text color="yellow">scanning</Text> : <Text>{time}</Text>}
      </Text>
    </Box>
  );
}

function Footer({ error }: { error?: string }) {
  return (
    <Box justifyContent="space-between" gap={2}>
      <Box flexShrink={0}>
        <Text color="gray">
          <Text bold>p</Text> period  <Text bold>r</Text> refresh  <Text bold>q</Text> quit
        </Text>
      </Box>
      {error ? (
        <Text color="red" wrap="truncate-end">
          {error}
        </Text>
      ) : (
        <Text color="gray">* API list-price equivalent</Text>
      )}
    </Box>
  );
}
