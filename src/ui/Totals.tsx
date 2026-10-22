import React from 'react';
import { Box, Text } from 'ink';
import type { Overview, Period } from '../types.js';
import { formatCost, formatTokens, MUTED } from '../format.js';
import { INDENT, TOTALS_GAP, TOTALS_LABEL, TOTALS_ROWS, TOTALS_VALUE } from '../layout.js';

type Pair = [label: string, value: string];

const LABELS = ['tokens', 'cost*', 'cache hit', 'sessions', 'responses', 'subagents'];

/** Label-value pairs of the period, most telling first. */
export function totalsOf(overview: Overview): Pair[] {
  const t = overview.totals;
  const values = [
    formatTokens(t.tokens),
    t.cost === null ? '?' : formatCost(t.cost),
    `${Math.round(t.cacheHit * 100)}%`,
    formatTokens(t.sessions),
    formatTokens(t.responses),
    formatTokens(t.subagents),
  ];
  return LABELS.map((label, i) => [label, values[i]!]);
}

interface Props {
  /** Null, or pending for the period, while the scan has not read it yet. */
  overview: Overview | null;
  period: Period;
}

const ready = (overview: Overview | null) => (overview && !overview.pending.period ? overview : null);

function Title({ overview, period }: Props) {
  return (
    <Text bold>
      TOTALS <Text color={MUTED}>· {overview?.period ?? period}</Text>
    </Text>
  );
}

/** The wide header's right column: two columns of pairs, each value right next to its label. */
export function Totals({ overview, period }: Props) {
  const data = ready(overview);
  // The labels hold the rows while loading, so the frame keeps its height.
  const pairs: Pair[] = data ? totalsOf(data) : LABELS.map((label) => [label, '…']);
  return (
    <Box flexDirection="column">
      <Title overview={overview} period={period} />
      <Box flexDirection="column" paddingLeft={INDENT}>
        {Array.from({ length: TOTALS_ROWS }, (_, row) => (
          <Text key={row} wrap="truncate-end">
            {[pairs[row]!, pairs[row + TOTALS_ROWS]!].map(([label, value], i) => (
              <Text key={label}>
                {i > 0 && ' '.repeat(TOTALS_GAP)}
                <Text color={MUTED}>{label.padEnd(TOTALS_LABEL)}</Text>
                <Text color={data ? undefined : MUTED}>{value.padStart(TOTALS_VALUE)}</Text>
              </Text>
            ))}
          </Text>
        ))}
      </Box>
    </Box>
  );
}

/** The narrow layout's one-row totals: as many pairs as fit, never a cut one. */
export function TotalsStrip({ overview, period, width }: Props & { width: number }) {
  const data = ready(overview);
  const title = `TOTALS · ${overview?.period ?? period}`;
  const shown = data ? stripPairs(totalsOf(data), width - title.length - 2) : [];
  return (
    <Box justifyContent="space-between" gap={2}>
      <Title overview={overview} period={period} />
      {data ? (
        <Text wrap="truncate-start">
          {shown.map(([label, value], i) => (
            <Text key={label}>
              {i > 0 && '  '}
              <Text color={MUTED}>{label}</Text> {value}
            </Text>
          ))}
        </Text>
      ) : (
        <Text color={MUTED} wrap="truncate-start">
          reading transcripts…
        </Text>
      )}
    </Box>
  );
}

/** Leading pairs that fit in `room` as "label value", two spaces apart. */
export function stripPairs(pairs: Pair[], room: number): Pair[] {
  const shown: Pair[] = [];
  let used = 0;
  for (const [label, value] of pairs) {
    const cost = label.length + 1 + value.length + (shown.length ? 2 : 0);
    if (used + cost > room) break;
    shown.push([label, value]);
    used += cost;
  }
  return shown;
}
