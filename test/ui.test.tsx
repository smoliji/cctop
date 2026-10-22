import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'ink';
import { render } from 'ink-testing-library';
import { App, type Snapshot } from '../src/ui/App.js';
import { DEFAULT_VIEW, Screen, type Status, type View } from '../src/ui/Screen.js';
import type { Overview, Period } from '../src/types.js';
import { DAY_CHROME, INDENT } from '../src/layout.js';

const NOW = new Date(2026, 9, 21, 14, 3, 22).getTime();
const HOUR = 3_600_000;

const overview: Overview = {
  now: NOW,
  period: '7d',
  days: [
    { date: '2026-10-21', tokensByModel: { 'opus-5-5': 40e6, 'haiku-4-5': 9e6 }, tokens: 49e6, cost: 20 },
    { date: '2026-10-20', tokensByModel: { 'opus-5-5': 118e6 }, tokens: 118e6, cost: 61 },
    { date: '2026-10-19', tokensByModel: {}, tokens: 0, cost: null },
    { date: '2026-10-18', tokensByModel: { 'sonnet-5-5': 30e6 }, tokens: 30e6, cost: 12 },
    { date: '2026-10-17', tokensByModel: { 'opus-5-5': 50e6 }, tokens: 50e6, cost: 25 },
    { date: '2026-10-16', tokensByModel: { 'opus-5-5': 60e6 }, tokens: 60e6, cost: 30 },
    { date: '2026-10-15', tokensByModel: { 'fable-5-1': 37e6 }, tokens: 37e6, cost: 28 },
  ],
  week: { tokens: 344e6, cost: 176, avg: 49e6, peak: 118e6, peakDate: '2026-10-20' },
  totals: { tokens: 344e6, cost: 176, cacheHit: 0.9, sessions: 12, responses: 900, subagents: 4 },
  topSkills: [
    { name: 'review-pr', count: 7 },
    { name: 'distill', count: 6 },
    { name: 'a-very-long-skill-name-that-will-not-fit-anywhere-at-all', count: 5 },
  ],
  topTools: [
    { name: 'Bash', count: 4027 },
    { name: 'Slack', count: 1407, server: 'Slack' },
    { name: 'Read', count: 187 },
  ],
  skills: [
    { name: 'review-pr', calls: 5, typed: 2, turns: 40, tokens: 9e6, cost: 6, lastUsed: NOW - HOUR, allTime: 30 },
    { name: 'distill', calls: 6, typed: 0, turns: 90, tokens: 20e6, cost: 11, lastUsed: NOW - 3 * HOUR, allTime: null },
  ],
  models: [
    { name: 'opus-5-5', tokens: 300e6, share: 0.87, cost: 150 },
    { name: 'haiku-4-5', tokens: 44e6, share: 0.13, cost: 26 },
  ],
  usage: {
    fetchedAt: NOW - 6 * 60_000,
    extraUsageEnabled: false,
    meters: [
      { label: '5h', percent: 42, resetsAt: NOW + 2 * HOUR + 14 * 60_000 },
      { label: 'Week', percent: 90, resetsAt: NOW + 3 * 24 * HOUR },
    ],
  },
};

const status: Status = { version: '0.1.0', interval: 60, refreshedAt: NOW, refreshing: false };

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
const frame = (columns: number, rows: number, o: Overview | null = overview, s = status, view?: View) =>
  strip(renderToString(<Screen overview={o} status={s} columns={columns} rows={rows} view={view} />, { columns }));
const lines = (f: string) => f.split('\n');

test('renders every section at a roomy size', () => {
  const f = frame(120, 40);
  assert.match(f, /cctop 0\.1\.0/);
  assert.match(f, /refresh 60s · 14:03:22/);
  assert.match(f, /5h .*42%.*reset 2h 14m/);
  assert.match(f, /Week .*90%.*reset 3d/);
  assert.match(f, /cache 6m old/);
  assert.match(f, /avg 49M {2}peak 118M {2}7d 344M {2}\$176\*/);
  assert.match(f, /We 21 .*49M {2}\$ 20/);
  assert.match(f, /Mo 19 {2}·/);
  assert.match(f, /TOP SKILLS · 7d/);
  assert.match(f, /mcp Slack/);
  assert.match(f, /opus-5-5 .*87%/);
  assert.match(f, /tab switch {2}p period {2}r refresh {2}q quit/);
  assert.match(f, /\* API list-price equivalent/);
});

test('a meter whose window already reset shows empty instead of the cached percent', () => {
  const usage = { ...overview.usage!, meters: [{ label: '5h', percent: 42, resetsAt: NOW - HOUR }] };
  const f = frame(120, 40, { ...overview, usage });
  assert.match(f, /5h +─+ +0% +window reset/);
  assert.doesNotMatch(f, /42%/);
});

test('a model with a 0% share draws an empty bar', () => {
  const models = [...overview.models, { name: 'sonnet-5-5', tokens: 1, share: 0.001, cost: 0 }];
  const f = frame(120, 40, { ...overview, models });
  assert.match(f, /sonnet-5-5 +0% ─{6}/);
});

test('the header ends with the refresh time', () => {
  assert.match(lines(frame(120, 40))[0]!, /14:03:22 *$/);
});

test('the frame never outgrows the terminal', () => {
  for (const [columns, rows] of [
    [60, 15],
    [80, 24],
    [100, 30],
    [160, 50],
  ] as const) {
    const ls = lines(frame(columns, rows));
    assert.ok(ls.length < rows, `${columns}×${rows}: ${ls.length} lines`);
    for (const l of ls) assert.ok([...l].length <= columns, `${columns}×${rows}: "${l}"`);
  }
});

test('the busiest day gets the full bar and others scale to it', () => {
  const f = frame(100, 40);
  const bar = (label: string) => lines(f).find((l) => l.includes(label))!.split('▆').length - 1;
  assert.equal(bar('Tu 20'), 100 - 2 - INDENT - DAY_CHROME);
  assert.ok(bar('We 21') < bar('Tu 20'));
  assert.ok(bar('We 21') > 0);
});

test('fewer panels and days on a small terminal', () => {
  const f = frame(70, 16);
  assert.doesNotMatch(f, /TOOLS/);
  assert.doesNotMatch(f, /TOP SKILLS/);
  assert.match(f, /We 21/);
  assert.doesNotMatch(f, /Th 15/);
  assert.match(frame(90, 40), /TOOLS · 7d/);
  assert.doesNotMatch(frame(90, 40), /MODELS/);
});

test('a too small terminal shows a short message', () => {
  assert.match(frame(59, 40), /terminal too small \(needs 60×15\)/);
  assert.match(frame(100, 14), /terminal too small/);
});

test('missing plan usage says so', () => {
  assert.match(frame(100, 30, { ...overview, usage: null }), /no plan usage cached yet/);
});

test('shows scanning before the first data arrives', () => {
  assert.match(frame(100, 30, null, { ...status, refreshing: true }), /scanning transcripts…/);
});

const snapshot: Snapshot = {
  data: { responses: [], toolCalls: [], slashCommands: [], files: 0 },
  state: { usage: null, skillUsage: {} },
};
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

function deferred() {
  let resolve!: (s: Snapshot) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<Snapshot>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('p cycles the period without rescanning', async () => {
  let loads = 0;
  const periods: Period[] = [];
  const load = async () => {
    loads++;
    return snapshot;
  };
  const build = (_d: unknown, _s: unknown, period: Period) => {
    periods.push(period);
    return { ...overview, period };
  };
  const { lastFrame, stdin, unmount } = render(<App load={load} build={build} interval={60} version="0.1.0" />);
  await tick();
  assert.match(strip(lastFrame() ?? ''), /TOP SKILLS · 7d/);
  stdin.write('p');
  await tick();
  stdin.write('p');
  await tick();
  assert.deepEqual(periods, ['7d', '30d', 'today']);
  assert.equal(loads, 1);
  assert.match(strip(lastFrame() ?? ''), /TOP SKILLS · today/);
  unmount();
});

test('r is ignored while a refresh is running', async () => {
  const pending = deferred();
  let loads = 0;
  const load = () => {
    loads++;
    return pending.promise;
  };
  const { lastFrame, stdin, unmount } = render(
    <App load={load} build={() => overview} interval={60} version="0.1.0" />,
  );
  await tick();
  assert.match(strip(lastFrame() ?? ''), /scanning transcripts…/);
  stdin.write('r');
  await tick();
  assert.equal(loads, 1);
  pending.resolve(snapshot);
  await tick();
  assert.match(strip(lastFrame() ?? ''), /LIMITS/);
  unmount();
});

test('a failed refresh keeps the last data and shows the error', async () => {
  let fail = false;
  const load = async () => {
    if (fail) throw new Error('disk on fire');
    return snapshot;
  };
  const { lastFrame, stdin, unmount } = render(
    <App load={load} build={() => overview} interval={60} version="0.1.0" />,
  );
  await tick();
  fail = true;
  stdin.write('r');
  await tick();
  const f = strip(lastFrame() ?? '');
  assert.match(f, /refresh failed: disk on fire/);
  assert.match(f, /TOKENS · LAST/);
  unmount();
});

test('q quits', async () => {
  let builds = 0;
  const build = () => {
    builds++;
    return overview;
  };
  const { stdin } = render(<App load={async () => snapshot} build={build} interval={60} version="0.1.0" />);
  await tick();
  stdin.write('q');
  await tick();
  stdin.write('p');
  await tick();
  assert.equal(builds, 1);
});

test('the skills tab lists every skill sorted by the chosen column', () => {
  const byUses = lines(frame(120, 30, overview, status, { ...DEFAULT_VIEW, tab: 'skills' }));
  assert.match(byUses.join('\n'), /SKILLS · 7d .* 2 skills · sorted by uses/);
  assert.ok(byUses.findIndex((l) => l.includes('review-pr')) < byUses.findIndex((l) => l.includes('distill')));
  assert.match(byUses.join('\n'), /review-pr +7 +9M +1h ago +\$6 +5 +2 +40 +30/);

  const byTokens = lines(frame(120, 30, overview, status, { ...DEFAULT_VIEW, tab: 'skills', skillSort: 'tokens' }));
  assert.ok(byTokens.findIndex((l) => l.includes('distill')) < byTokens.findIndex((l) => l.includes('review-pr')));
});

test('the skills tab drops columns on a narrow terminal', () => {
  const f = frame(60, 20, overview, status, { ...DEFAULT_VIEW, tab: 'skills' });
  assert.match(f, /USES/);
  assert.doesNotMatch(f, /ALL TIME/);
  for (const l of lines(f)) assert.ok([...l].length <= 60, l);
});
