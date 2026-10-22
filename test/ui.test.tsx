import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'ink';
import { render } from 'ink-testing-library';
import { App, type Build, type Scan } from '../src/ui/App.js';
import { DEFAULT_VIEW, Screen, type Status, type View } from '../src/ui/Screen.js';
import type { ClaudeState, Overview, Period, TranscriptData } from '../src/types.js';
import { DAY_CHROME, INDENT } from '../src/layout.js';
import { MUTED } from '../src/format.js';
import { axis } from '../src/ui/History.js';
import { stripPairs } from '../src/ui/Totals.js';
import { recency, skillTable, sortSkills, splitName } from '../src/ui/Skills.js';

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
    { name: 'review-pr', calls: 5, typed: 2, turns: 40, tokens: 9e6, tokensByModel: { 'opus-5-5': 9e6 }, cost: 6, lastUsed: NOW - HOUR, allTime: 30 },
    {
      name: 'distill',
      calls: 6,
      typed: 0,
      turns: 90,
      tokens: 20e6,
      tokensByModel: { 'opus-5-5': 15e6, 'haiku-4-5': 5e6 },
      cost: 11, lastUsed: NOW - 3 * HOUR, allTime: null },
  ],
  models: [
    { name: 'opus-5-5', tokens: 300e6, share: 0.87, cost: 150 },
    { name: 'haiku-4-5', tokens: 44e6, share: 0.13, cost: 26 },
  ],
  projects: [
    { path: '/a/cctop', name: 'cctop', tokens: 200e6 },
    { path: '/b/api', name: 'api', tokens: 144e6 },
  ],
  topAgents: [{ name: 'general-purpose', count: 3 }],
  usage: {
    fetchedAt: NOW - 6 * 60_000,
    extraUsageEnabled: false,
    meters: [
      { label: '5h', percent: 42, resetsAt: NOW + 2 * HOUR + 14 * 60_000 },
      { label: 'Week', percent: 90, resetsAt: NOW + 3 * 24 * HOUR },
    ],
  },
  pending: { days: false, period: false },
};

const skillUsage = { 'review-pr': 30, distill: 4 };
const status: Status = { version: '0.1.0', interval: 60, refreshedAt: NOW, refreshing: false, progress: null };

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
const frame = (columns: number, rows: number, o: Overview | null = overview, s = status, view?: View) => {
  const state: ClaudeState = { usage: (o ?? overview).usage, skillUsage };
  return strip(
    renderToString(<Screen overview={o} state={state} now={NOW} status={s} columns={columns} rows={rows} view={view} />, {
      columns,
    }),
  );
};
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
  assert.match(f, /Mo 19 {2}─+$/m);
  assert.match(f, /TOTALS · 7d/);
  assert.match(f, /tokens +344M +sessions +12/);
  assert.match(f, /cost\* +\$176 +responses +900/);
  assert.match(f, /cache hit +90% +subagents +4/);
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

const SIZES = [
  [60, 15],
  [80, 24],
  [100, 30],
  [160, 50],
  [300, 80],
] as const;

/** Exactly as tall as the terminal, header on top, footer on the last row, no line too wide. */
function assertFills(f: string, columns: number, rows: number) {
  const ls = lines(f);
  const at = `${columns}×${rows}`;
  assert.equal(ls.length, rows, `${at}: ${ls.length} lines`);
  assert.match(ls[0]!, /cctop/, at);
  assert.match(ls.at(-1)!, /tab switch/, at);
  for (const l of ls) assert.ok([...l].length <= columns, `${at}: "${l}"`);
}

test('the frame fills the terminal exactly', () => {
  for (const [columns, rows] of SIZES) assertFills(frame(columns, rows), columns, rows);
});

test('the wide header pins the totals to the right edge', () => {
  const ls = lines(frame(200, 40));
  for (const label of ['5h', 'Week']) {
    const l = ls.find((x) => x.includes(`${label} `))!;
    assert.equal([...l].length, 199, l);
  }
  assert.match(ls.find((l) => l.includes('cache hit'))!, /subagents +4$/);
});

test('values stay next to their names on a wide terminal', () => {
  const gap = (columns: number) => {
    const l = lines(frame(columns, 40)).find((x) => x.includes('Bash'))!;
    return l.indexOf('4027') - l.indexOf('Bash');
  };
  assert.equal(gap(300), gap(100));
  assert.ok(gap(300) <= 'mcp Slack'.length + 1);
});

test('day rows draw a track from the bar to the numbers', () => {
  const ls = lines(frame(200, 40));
  for (const [day, tokens] of [
    ['We 21', '49M'],
    ['Su 18', '30M'],
    ['Th 15', '37M'],
  ]) {
    const l = ls.find((x) => x.includes(day))!;
    const fields = l.trim().split(/ +/);
    assert.equal(fields.at(-3), tokens, l);
    assert.match(l, new RegExp(`▆─+ +${tokens} `), l);
  }
  const zero = ls.find((x) => x.includes('Mo 19'))!;
  assert.equal(zero, `   Mo 19  ${'─'.repeat(200 - 2 - INDENT - DAY_CHROME)}`);
});

test('more panels as the terminal gets wider', () => {
  const at140 = frame(140, 40);
  assert.match(at140, /PROJECTS · 7d/);
  assert.match(at140, /cctop +200M/);
  assert.doesNotMatch(at140, /AGENT TYPES/);
  const at170 = frame(170, 40);
  assert.match(at170, /AGENT TYPES · 7d/);
  assert.match(at170, /general-purpose +3/);
});

test('the narrow totals strip shows whole pairs only', () => {
  const l = lines(frame(80, 30)).find((x) => x.includes('TOTALS'))!;
  assert.match(l, /TOTALS · 7d +tokens 344M {2}cost\* \$176 {2}cache hit 90% {2}sessions 12$/);
  assert.doesNotMatch(frame(120, 30), /TOTALS · 7d +tokens/);
});

test('stripPairs keeps leading pairs that fit whole', () => {
  const pairs: [string, string][] = [
    ['tokens', '344M'],
    ['cost*', '$176'],
    ['sessions', '12'],
  ];
  assert.deepEqual(stripPairs(pairs, 0), []);
  assert.deepEqual(stripPairs(pairs, 10), []);
  assert.deepEqual(stripPairs(pairs, 11), pairs.slice(0, 1));
  assert.deepEqual(stripPairs(pairs, 22), pairs.slice(0, 1));
  assert.deepEqual(stripPairs(pairs, 23), pairs.slice(0, 2));
  assert.deepEqual(stripPairs(pairs, 100), pairs);
});

test('panel rows grow with the terminal', () => {
  const topTools = Array.from({ length: 30 }, (_, i) => ({ name: `Tool${i}`, count: 100 - i }));
  const ls = lines(frame(100, 60, { ...overview, topTools }));
  for (let i = 0; i < 30; i++) assert.ok(ls.some((l) => l.includes(`Tool${i} `)), `Tool${i}`);
  assert.equal(ls.length, 60);
  assert.match(ls[59]!, /tab switch/);
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

test('a short terminal sums and scales the history over the days it shows', () => {
  const days = overview.days.map((d) => (d.date === '2026-10-15' ? { ...d, tokens: 200e6, tokensByModel: { 'fable-5-1': 200e6 } } : d));
  const f = frame(100, 18, { ...overview, days });
  assert.match(f, /TOKENS · LAST 6 DAYS +avg 51M {2}peak 118M {2}6d 307M {2}\$148\*/);
  assert.doesNotMatch(f, /Th 15|200M/);
  const row = lines(f).find((l) => l.includes('Tu 20'))!;
  assert.doesNotMatch(row, /─/, 'the peak of the shown days fills the bar');
});

test('the history axis numbers the bar scale from zero under the bars', () => {
  assert.equal(axis(0, 60), '');
  const scale = axis(148e6, 60);
  assert.match(scale, /^0 +50M +100M$/);
  assert.equal(scale.indexOf('50M'), Math.round((50e6 / 148e6) * 60 - 1.5));
  assert.ok(axis(148e6, 1000).length <= 1000);
  const f = lines(frame(120, 34));
  const legend = f.findIndex((l) => l.includes('■ opus-5-5'));
  assert.match(f[legend - 1]!, /^ {10}0 {2,}\S+/, 'the axis sits right above the legend, aligned with the bars');
});

test('the models panel bar takes the width of the panel', () => {
  const row = lines(frame(200, 40)).find((l) => /opus-5-5 +87%/.test(l))!;
  assert.match(row, /87% ▆+─+ /);
  assert.ok(/▆+─+/.exec(row)![0].length > 20, row);
});

test('a too small terminal shows a short message', () => {
  assert.match(frame(59, 40), /terminal too small \(needs 60×15\)/);
  assert.match(frame(100, 14), /terminal too small/);
});

test('missing plan usage says so', () => {
  assert.match(frame(100, 30, { ...overview, usage: null }), /no plan usage cached yet/);
});

const loading: Status = { ...status, refreshedAt: null, refreshing: true, progress: { done: 412, total: 1497 } };
/** The top skills panel holds an ellipsis while its period is read. */
const PENDING = /TOP SKILLS · \w+[^\n]*\n {3}…/;

test('the loading frame shows limits and a skeleton', () => {
  const f = frame(120, 40, null, loading);
  assert.match(f, /5h .*42%.*reset 2h 14m/);
  assert.match(f, /TOKENS · LAST 7 DAYS *\n/);
  assert.match(f, /We 21 {2}─+/);
  assert.match(f, /Th 15/);
  assert.match(f, PENDING);
  assert.match(lines(f)[0]!, /scanning 412\/1497/);
  assert.equal(f.match(/412\/1497/g)?.length, 1, 'the progress shows once');
  assert.doesNotMatch(f, /waiting/);
  assert.doesNotMatch(f, /no plan usage/);
  assert.doesNotMatch(f, /49M/);
});

test('the loading frame fills the terminal exactly', () => {
  for (const [columns, rows] of SIZES) assertFills(frame(columns, rows, null, loading), columns, rows);
});

test('the loading frame keeps the loaded height of the head and the history', () => {
  for (const [columns, rows] of [
    [80, 30],
    [120, 40],
  ] as const) {
    const at = (f: string, text: string) => lines(f).findIndex((l) => l.includes(text));
    for (const text of ['TOKENS', 'TOP SKILLS']) {
      assert.equal(at(frame(columns, rows, null, loading), text), at(frame(columns, rows), text), `${columns}: ${text}`);
    }
  }
  assert.match(frame(120, 40, null, loading), /TOTALS · 7d\n.*tokens +…/);
  assert.match(frame(80, 30, null, loading), /TOTALS · 7d +reading transcripts…/);
});

test('a partial scan shows history and holds back the period panels', () => {
  const f = frame(120, 40, { ...overview, period: '30d', pending: { days: false, period: true } });
  assert.match(f, /We 21 .*49M/);
  const ls = lines(f);
  const panels = ls.slice(ls.findIndex((l) => l.includes('TOP SKILLS'))).join('\n');
  assert.match(panels, PENDING);
  assert.doesNotMatch(panels, /review-pr/);
});

test('the skills tab shows lifetime counts while loading', () => {
  const ls = lines(frame(120, 30, null, loading, { ...DEFAULT_VIEW, tab: 'skills' }));
  const f = ls.join('\n');
  assert.match(f, /2 skills · lifetime counts *\n/);
  assert.equal(f.match(/412\/1497/g)?.length, 1, 'the progress shows once');
  assert.match(f, /review-pr +30/);
  assert.ok(ls.findIndex((l) => l.includes('review-pr')) < ls.findIndex((l) => l.includes('distill')));
  assert.doesNotMatch(f, /TOKENS/);
});

test('the skills tab keeps lifetime counts until the period is read', () => {
  const f = frame(120, 30, { ...overview, pending: { days: false, period: true } }, status, {
    ...DEFAULT_VIEW,
    tab: 'skills',
    skillSort: 'tokens',
  });
  assert.match(f, /2 skills · lifetime counts *\n/);
  assert.match(f, /review-pr +30\n.*distill +4/);
});

const data: TranscriptData = { responses: [], toolCalls: [], slashCommands: [], files: 0, knownAfter: -Infinity };
const initial: ClaudeState = { usage: overview.usage, skillUsage };
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const text = (f: string | undefined) => strip(f ?? '');

type Hooks = Parameters<Scan>[0];

/** A scan that stays pending until the test settles it, with the hooks the App passed. */
function deferredScan() {
  let calls = 0;
  let hooks!: Hooks;
  let resolve!: (d: TranscriptData) => void;
  let reject!: (e: Error) => void;
  const scan: Scan = (h) => {
    calls++;
    hooks = h;
    return new Promise<TranscriptData>((res, rej) => {
      resolve = res;
      reject = rej;
    });
  };
  return {
    scan,
    get calls() {
      return calls;
    },
    get hooks() {
      return hooks;
    },
    resolve: (d = data) => resolve(d),
    reject: (e: Error) => reject(e),
  };
}

interface AppOptions {
  scan?: Scan;
  build?: Build;
  readState?: () => Promise<ClaudeState>;
  interval?: number;
}

function app({ scan = async () => data, build = () => overview, readState = async () => initial, interval = 60 }: AppOptions = {}) {
  return render(
    <App
      initial={initial}
      readState={readState}
      scan={scan}
      build={build}
      interval={interval}
      version="0.1.0"
      now={() => NOW}
    />,
  );
}

test('the first frame shows limits before the scan ends', async () => {
  const pending = deferredScan();
  let builds = 0;
  const { lastFrame, unmount } = app({
    scan: pending.scan,
    build: () => {
      builds++;
      return overview;
    },
  });
  await tick();
  const f = text(lastFrame());
  assert.match(f, /42%/);
  assert.match(f, PENDING);
  assert.equal(builds, 0);
  unmount();
});

test('progress and data reach the screen', async () => {
  const pending = deferredScan();
  const { lastFrame, unmount } = app({ scan: pending.scan });
  await tick();
  pending.hooks.onProgress({ done: 3, total: 10 });
  await tick();
  let f = text(lastFrame());
  assert.match(f, /scanning 3\/10/);

  pending.resolve();
  await tick();
  f = text(lastFrame());
  assert.match(f, /We 21 .*49M/);
  assert.doesNotMatch(f, PENDING);
  assert.match(lines(f)[0]!, /14:03:22/);
  unmount();
});

test('a partial result fills the history first', async () => {
  const pending = deferredScan();
  const partial: TranscriptData = { ...data, knownAfter: NOW - 10 * 24 * HOUR };
  const build: Build = (d) => ({ ...overview, pending: { days: false, period: d === partial } });
  const { lastFrame, unmount } = app({ scan: pending.scan, build });
  await tick();
  pending.hooks.onPartial(partial);
  await tick();
  let f = text(lastFrame());
  assert.match(f, /We 21 .*49M/);
  assert.match(f, PENDING);
  assert.doesNotMatch(f, /mcp Slack/);

  pending.resolve();
  await tick();
  f = text(lastFrame());
  assert.match(f, /mcp Slack/);
  assert.doesNotMatch(f, PENDING);
  unmount();
});

test('keys work during the scan', async () => {
  const pending = deferredScan();
  const { lastFrame, stdin, unmount } = app({ scan: pending.scan });
  await tick();
  stdin.write('2');
  await tick();
  assert.match(text(lastFrame()), /2 skills · lifetime counts/);
  stdin.write('1');
  await tick();
  assert.match(text(lastFrame()), /LIMITS/);

  stdin.write('q');
  await tick();
  const last = lastFrame();
  stdin.write('2');
  await tick();
  assert.equal(lastFrame(), last);
  unmount();
});

test('the timer does not start a second scan', async () => {
  const pending = deferredScan();
  let reads = 0;
  const readState = async () => {
    reads++;
    return initial;
  };
  const { unmount } = app({ scan: pending.scan, readState, interval: 0.05 });
  await tick(200);
  assert.equal(pending.calls, 1);
  assert.ok(reads >= 3, `${reads} reads`);

  pending.resolve();
  await tick(80);
  assert.equal(pending.calls, 2);
  unmount();
});

test('p cycles the period without rescanning', async () => {
  let scans = 0;
  const periods: Period[] = [];
  const scan = async () => {
    scans++;
    return data;
  };
  const build = (_d: unknown, _s: unknown, period: Period) => {
    periods.push(period);
    return { ...overview, period };
  };
  const { lastFrame, stdin, unmount } = app({ scan, build });
  await tick();
  assert.match(text(lastFrame()), /TOP SKILLS · 7d/);
  stdin.write('p');
  await tick();
  stdin.write('p');
  await tick();
  assert.deepEqual(periods, ['7d', '30d', 'today']);
  assert.equal(scans, 1);
  assert.match(text(lastFrame()), /TOP SKILLS · today/);
  unmount();
});

test('r is ignored while a refresh is running', async () => {
  const pending = deferredScan();
  let reads = 0;
  const readState = async () => {
    reads++;
    return initial;
  };
  const { lastFrame, stdin, unmount } = app({ scan: pending.scan, readState });
  await tick();
  assert.match(text(lastFrame()), PENDING);
  stdin.write('r');
  await tick();
  assert.equal(pending.calls, 1);
  assert.equal(reads, 1, 'r still re-reads the limits');
  pending.resolve();
  await tick();
  assert.match(text(lastFrame()), /TOKENS · LAST 7 DAYS +avg/);
  unmount();
});

test('a failed refresh keeps the last data and shows the error', async () => {
  let fail = false;
  const scan = async () => {
    if (fail) throw new Error('disk on fire');
    return data;
  };
  const { lastFrame, stdin, unmount } = app({ scan });
  await tick();
  fail = true;
  stdin.write('r');
  await tick();
  const f = text(lastFrame());
  assert.match(f, /refresh failed: disk on fire/);
  assert.match(f, /avg 49M/);
  unmount();
});

test('a failed read of the limits keeps the last ones and shows the error', async () => {
  let fail = false;
  const readState = async () => {
    if (fail) throw new Error('locked');
    return initial;
  };
  const { lastFrame, stdin, unmount } = app({ readState });
  await tick();
  fail = true;
  stdin.write('r');
  await tick();
  const f = text(lastFrame());
  assert.match(f, /reading ~\/\.claude\.json failed: locked/);
  assert.match(f, /5h .*42%/);
  unmount();
});

const named = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ ...overview.skills[0]!, name: `skill-${String(i).padStart(2, '0')}` }));
const firstSkill = (f: string | undefined) => Number(/skill-(\d\d)/.exec(text(f))![1]);

test('a period change scrolls the skills back to the top', async () => {
  const { lastFrame, stdin, unmount } = app({ build: () => ({ ...overview, skills: named(60) }) });
  await tick();
  stdin.write('2');
  await tick();
  for (let i = 0; i < 3; i++) {
    stdin.write('j');
    await tick();
  }
  assert.equal(firstSkill(lastFrame()), 3);
  stdin.write('p');
  await tick();
  assert.equal(firstSkill(lastFrame()), 0);
  unmount();
});

test('a shorter list scrolls up from its own last row', async () => {
  let count = 60;
  const { lastFrame, stdin, unmount } = app({ build: () => ({ ...overview, skills: named(count) }) });
  await tick();
  stdin.write('2');
  await tick();
  for (let i = 0; i < 6; i++) {
    stdin.write('\x1b[6~');
    await tick();
  }
  const bottom = firstSkill(lastFrame());
  count = 50;
  stdin.write('r');
  await tick();
  const shrunk = firstSkill(lastFrame());
  assert.equal(shrunk, bottom - 10);
  stdin.write('k');
  await tick();
  assert.equal(firstSkill(lastFrame()), shrunk - 1);
  unmount();
});

test('q quits', async () => {
  let builds = 0;
  const build = () => {
    builds++;
    return overview;
  };
  const { stdin } = app({ build });
  await tick();
  stdin.write('q');
  await tick();
  stdin.write('p');
  await tick();
  assert.equal(builds, 1);
});

const skillsTab = (columns: number, rows: number, o: Overview = overview, view: Partial<View> = {}) =>
  lines(frame(columns, rows, o, status, { ...DEFAULT_VIEW, tab: 'skills', ...view }));
const headerOf = (ls: string[]) => ls.find((l) => /^ +SKILL /.test(l))!;

test('the skills tab lists every skill sorted by the chosen column', () => {
  const byUses = skillsTab(120, 30);
  const f = byUses.join('\n');
  assert.match(f, /SKILLS · 7d .* 2 skills {2}29M tokens {2}8% of all {2}\$17\*/);
  assert.match(headerOf(byUses), /SKILL +USES +TOKENS +LAST +COST\* +MODEL +YOU +TURNS +ALL TIME +SHARE/);
  assert.match(f, /review-pr +7 +9M +1h ago +\$6 +5 +2 +40 +30 +▆+─*/);
  assert.match(f, /■ opus-5-5 {3}■ haiku-4-5/);
  assert.ok(byUses.findIndex((l) => l.includes('review-pr')) < byUses.findIndex((l) => l.includes('distill')));

  const byTokens = skillsTab(120, 30, overview, { skillSort: 'tokens' });
  assert.ok(byTokens.findIndex((l) => l.includes('distill')) < byTokens.findIndex((l) => l.includes('review-pr')));
});

test('the skills tab drops columns on a narrow terminal', () => {
  const ls = skillsTab(60, 20);
  const f = ls.join('\n');
  assert.match(f, /USES/);
  assert.match(f, /COST\*/);
  assert.doesNotMatch(f, /ALL TIME|SHARE|■/);
  for (const l of ls) assert.ok([...l].length <= 60, l);
});

test('the skills tab keeps the bar but drops MODEL and YOU together at 80 columns', () => {
  const ls = skillsTab(80, 24);
  assert.match(headerOf(ls), /SKILL +USES +TOKENS +LAST +COST\* +SHARE$/);
  assert.doesNotMatch(headerOf(ls), /MODEL|YOU/);
  for (const l of ls) assert.ok([...l].length <= 80, l);
});

test('the skills tab keeps the numbers next to the name and gives a wide terminal to the bar', () => {
  const ls = skillsTab(200, 30);
  const row = ls.find((l) => l.includes('review-pr'))!;
  assert.match(headerOf(ls), /ALL TIME  SHARE$/);
  assert.equal([...row].length, 199);
  assert.ok(row.indexOf(' 7 ') < 30 && row.indexOf(' 30 ') < row.indexOf('▆'), row);
  assert.match(row, /[▆─]$/);
  assert.ok(/▆+─*/.exec(row)![0].length > 100);
});

test('the lifetime counts stay next to their names on a wide terminal', () => {
  const ls = lines(frame(200, 30, null, loading, { ...DEFAULT_VIEW, tab: 'skills' }));
  const row = ls.find((l) => l.includes('review-pr'))!;
  assert.match(row, /review-pr +30 *$/);
  assert.ok(row.trimEnd().length < 40, row);
  assert.match(headerOf(ls), /SKILL +ALL TIME$/);
});

test('the skills tab fills the terminal height', () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ ...overview.skills[0]!, name: `skill-${String(i).padStart(2, '0')}` }));
  const ls = skillsTab(100, 30, { ...overview, skills: many });
  assert.equal(ls.length, 30);
  assert.match(ls.at(-1)!, /tab switch/);
  assert.match(ls.at(-3)!, /↓ 17 more/);
});

test('the skills summary leaves out the cost when a skill has none', () => {
  const skills = [{ ...overview.skills[0]!, cost: null }, overview.skills[1]!];
  const title = skillsTab(120, 30, { ...overview, skills }).find((l) => l.includes('SKILLS'))!;
  assert.match(title, /2 skills {2}29M tokens {2}8% of all$/);
  assert.doesNotMatch(title, /\$\d+\*/);
});

test('the skills tab says so when no skill was used', () => {
  const ls = skillsTab(120, 30, { ...overview, skills: [] });
  const f = ls.join('\n');
  assert.match(f, /no skills used in this period/);
  assert.match(headerOf(ls), /SKILL/);
  assert.doesNotMatch(f, /■/);
});

test('a long plugin name gives way to the skill', () => {
  const long = { ...overview.skills[0]!, name: 'issue-tracker-get-issue:issue-tracker-get-issue' };
  const f = skillsTab(80, 24, { ...overview, skills: [long] }).join('\n');
  assert.match(f, /…:issue-tracker-get-issue /);
});

test('the overview cuts a plugin before the skill like the skills tab', () => {
  const name = 'issue-tracker-get-issue:issue-tracker-get-issue';
  const f = frame(80, 30, { ...overview, topSkills: [{ name, count: 9 }] });
  assert.match(f, /…:issue-tracker-get-issue +9/);
});

const titles = (t: { columns: { title: string }[] }) => t.columns.map((c) => c.title);

test('skillTable shares the width between name, bar and columns', () => {
  const PRIMARY = ['USES', 'TOKENS', 'LAST', 'COST*'];
  assert.deepEqual(skillTable(58, 47), { ...skillTable(58, 47), name: 22, bar: 0 });
  assert.deepEqual(titles(skillTable(58, 47)), PRIMARY);
  // The bar and the gray columns wait until the name has 32 columns.
  assert.deepEqual(skillTable(78, 47), { ...skillTable(78, 47), name: 42, bar: 0 });
  assert.deepEqual(titles(skillTable(78, 47)), PRIMARY);
  assert.deepEqual(skillTable(98, 47), { ...skillTable(98, 47), name: 44, bar: 16 });
  assert.deepEqual(titles(skillTable(98, 47)), PRIMARY);
  assert.equal(skillTable(118, 47).columns.length, 8);
  assert.equal(skillTable(118, 47).name, 33);
  assert.equal(skillTable(118, 47).bar, 16);
  assert.equal(skillTable(158, 47).name, 47);
  assert.equal(skillTable(158, 47).bar, 42);
  assert.equal(skillTable(158, 10).name, 20);
  assert.equal(skillTable(158, 10).bar, 69);
  assert.deepEqual(titles(skillTable(78, 10)), PRIMARY);
  assert.equal(skillTable(78, 10).bar, 20);
  for (let width = 58; width <= 300; width++) {
    const { columns, name, bar } = skillTable(width, 47);
    const span = INDENT + name + (bar ? 2 + bar : 0) + columns.reduce((a, c) => a + 2 + c.width, 0);
    if (bar) assert.equal(span, width, `width ${width}`);
    else assert.ok(span <= width && name === Math.min(47, width - span + name), `width ${width}`);
  }
});

test('recency colors today cyan and anything older than a week muted', () => {
  assert.equal(recency(NOW - HOUR, NOW), 'cyan');
  assert.equal(recency(NOW - 15 * HOUR, NOW), undefined);
  assert.equal(recency(NOW - 8 * 24 * HOUR, NOW), MUTED);
  assert.equal(recency(null, NOW), MUTED);
});

test('splitName cuts the plugin before the skill', () => {
  assert.deepEqual(splitName('a:b', 10), { plugin: 'a:', skill: 'b'.padEnd(8) });
  assert.deepEqual(splitName('release', 10), { plugin: '', skill: 'release   ' });
  assert.deepEqual(splitName('issue-tracker-get-issue:issue-tracker-get-issue', 32), {
    plugin: 'issue-t…:',
    skill: 'issue-tracker-get-issue',
  });
  assert.deepEqual(splitName('plugin:averyveryverylongskillname', 10), { plugin: '', skill: 'averyvery…' });
});

test('sortSkills breaks ties by tokens', () => {
  const a = { ...overview.skills[0]!, name: 'a', calls: 3, typed: 0, tokens: 1 };
  const b = { ...overview.skills[0]!, name: 'b', calls: 3, typed: 0, tokens: 2 };
  assert.deepEqual(sortSkills([a, b], 'uses').map((r) => r.name), ['b', 'a']);
});
