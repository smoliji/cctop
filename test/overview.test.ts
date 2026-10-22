import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOverview, localDate, shortModel } from '../src/overview.js';
import { costOf } from '../src/pricing.js';
import type {
  ApiResponse,
  ClaudeState,
  PlanUsage,
  SlashCommand,
  TokenUsage,
  ToolCall,
  TranscriptData,
} from '../src/types.js';

// Local noon, so the tests hold in any timezone.
const NOW = new Date(2026, 9, 21, 12).getTime();
const daysAgo = (n: number, hour = 10) => new Date(2026, 9, 21 - n, hour).getTime();

let seq = 0;
const usage = (u: Partial<TokenUsage> = {}): TokenUsage => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite5m: 0,
  cacheWrite1h: 0,
  ...u,
});
const response = (r: Partial<ApiResponse> = {}): ApiResponse => ({
  key: `r${seq++}`,
  timestamp: NOW,
  model: 'claude-opus-5-5',
  project: '/p',
  sessionId: 's1',
  sidechain: false,
  usage: usage({ input: 100 }),
  ...r,
});
const call = (name: string, extra: Partial<ToolCall> = {}): ToolCall => ({
  key: `t${seq++}`,
  timestamp: NOW,
  name,
  ...extra,
});
const command = (name: string, timestamp = NOW): SlashCommand => ({
  key: `c${seq++}`,
  timestamp,
  name,
});
const data = (d: Partial<TranscriptData> = {}): TranscriptData => ({
  responses: [],
  toolCalls: [],
  slashCommands: [],
  files: 1,
  ...d,
});
const state = (s: Partial<ClaudeState> = {}): ClaudeState => ({ usage: null, skillUsage: {}, ...s });

test('empty data still yields 7 days, newest first, today included', () => {
  const o = buildOverview(data(), state(), 'today', NOW);
  assert.equal(o.days.length, 7);
  assert.equal(o.days[0].date, '2026-10-21');
  assert.equal(o.days[6].date, '2026-10-15');
  assert.deepEqual(o.days[0], { date: '2026-10-21', tokensByModel: {}, tokens: 0, cost: null });
  assert.deepEqual(o.week, { tokens: 0, cost: null, avg: 0, peak: 0, peakDate: null });
  assert.equal(o.totals.tokens, 0);
  assert.equal(o.totals.cost, null);
  assert.equal(o.totals.cacheHit, 0);
  assert.deepEqual(o.models, []);
});

test('tokens sum all five kinds, grouped per local day and short model name', () => {
  const u = usage({ input: 1, output: 2, cacheRead: 3, cacheWrite5m: 4, cacheWrite1h: 5 });
  const o = buildOverview(
    data({
      responses: [
        response({ usage: u, model: 'claude-haiku-4-5-20251001' }),
        response({ usage: u, model: 'claude-haiku-4-5' }),
        response({ usage: u, timestamp: daysAgo(2) }),
        response({ usage: u, timestamp: daysAgo(7) }),
      ],
    }),
    state(),
    '7d',
    NOW,
  );
  assert.deepEqual(o.days[0].tokensByModel, { 'haiku-4-5': 30 });
  assert.equal(o.days[0].tokens, 30);
  assert.equal(o.days[1].tokens, 0);
  assert.deepEqual(o.days[2].tokensByModel, { 'opus-5-5': 15 });
  assert.equal(o.week.tokens, 45);
  assert.equal(o.week.avg, 45 / 7);
  assert.equal(o.week.peak, 30);
  assert.equal(o.week.peakDate, '2026-10-21');
  assert.equal(o.totals.tokens, 45);
});

test('costs are null where any response has an unknown price', () => {
  const u = usage({ input: 1000, output: 100 });
  const known = response({ usage: u });
  const o = buildOverview(
    data({
      responses: [
        known,
        response({ usage: u, model: 'mystery-1' }),
        response({ usage: u, timestamp: daysAgo(2) }),
      ],
    }),
    state(),
    'today',
    NOW,
  );
  assert.equal(o.days[0].cost, null);
  assert.equal(o.days[2].cost, costOf(known.model, u));
  assert.equal(o.totals.cost, null);
  assert.equal(o.week.cost, null);
  assert.equal(o.models.find((m) => m.name === 'mystery-1')!.cost, null);
  assert.equal(o.models.find((m) => m.name !== 'mystery-1')!.cost, costOf(known.model, u));
});

test('week cost sums the priced days and skips empty ones', () => {
  const u = usage({ input: 1000, output: 100 });
  const one = costOf(response({ usage: u }).model, u)!;
  const o = buildOverview(
    data({ responses: [response({ usage: u }), response({ usage: u, timestamp: daysAgo(3) })] }),
    state(),
    '7d',
    NOW,
  );
  assert.equal(o.days[1].cost, null);
  assert.equal(o.week.cost, one * 2);
  assert.equal(o.totals.cost, one * 2);
});

test('period filters totals, skills, tools and models by local day boundaries', () => {
  const d = data({
    responses: [
      response({ timestamp: new Date(2026, 9, 21, 0, 1).getTime() }),
      response({ timestamp: new Date(2026, 9, 20, 23, 59).getTime() }),
      response({ timestamp: daysAgo(6) }),
      response({ timestamp: daysAgo(7) }),
      response({ timestamp: daysAgo(29) }),
      response({ timestamp: daysAgo(30) }),
    ],
    toolCalls: [call('Read'), call('Read', { timestamp: daysAgo(3) })],
  });
  const tokens = (p: 'today' | '7d' | '30d') => buildOverview(d, state(), p, NOW).totals.tokens;
  assert.equal(tokens('today'), 100);
  assert.equal(tokens('7d'), 300);
  assert.equal(tokens('30d'), 500);
  assert.equal(buildOverview(d, state(), 'today', NOW).topTools[0].count, 1);
  assert.equal(buildOverview(d, state(), '7d', NOW).topTools[0].count, 2);
});

test('cache hit, sessions, responses and subagents', () => {
  const o = buildOverview(
    data({
      responses: [
        response({
          sessionId: 'a',
          usage: usage({ input: 10, output: 999, cacheRead: 60, cacheWrite5m: 20, cacheWrite1h: 10 }),
        }),
        response({ sessionId: 'a' }),
        response({ sessionId: 'b' }),
        response({ sessionId: 'c', sidechain: true, agentId: 'x' }),
        response({ sessionId: 'c', sidechain: true, agentId: 'x' }),
        response({ sessionId: 'c', sidechain: true, agentId: 'y' }),
      ],
      toolCalls: [call('Agent', { subagentType: 'Explore' }), call('Bash')],
    }),
    state(),
    'today',
    NOW,
  );
  assert.equal(o.totals.cacheHit, 60 / (10 + 500 + 60 + 20 + 10));
  assert.equal(o.totals.sessions, 2);
  assert.equal(o.totals.responses, 6);
  assert.equal(o.totals.subagents, 2);
});

test('top skills merge Skill calls with skill slash commands', () => {
  const o = buildOverview(
    data({
      toolCalls: [
        call('Skill', { skill: 'superpowers:tdd' }),
        call('Skill', { skill: 'commit' }),
        call('Skill'),
      ],
      slashCommands: [
        command('/superpowers:tdd'),
        command('/commit'),
        command('/clear'),
        command('/constructor'),
        command('/old:skill', daysAgo(1)),
      ],
    }),
    state({ skillUsage: { commit: 5 } }),
    'today',
    NOW,
  );
  assert.deepEqual(o.topSkills, [
    { name: 'commit', count: 2 },
    { name: 'superpowers:tdd', count: 2 },
  ]);
});

test('skill rows join calls, typed commands, attributed turns and the lifetime count', () => {
  const o = buildOverview(
    data({
      responses: [
        response({ skill: 'commit', usage: usage({ input: 100 }) }),
        response({ skill: 'commit', usage: usage({ output: 50 }), timestamp: NOW + 1 }),
        response({ skill: 'commit', timestamp: daysAgo(1) }),
      ],
      toolCalls: [call('Skill', { skill: 'commit' })],
      slashCommands: [command('/commit'), command('/clear')],
    }),
    state({ skillUsage: { commit: 40 } }),
    'today',
    NOW,
  );
  assert.equal(o.skills.length, 1);
  const { cost, ...row } = o.skills[0]!;
  assert.deepEqual(row, { name: 'commit', calls: 1, typed: 1, turns: 2, tokens: 150, lastUsed: NOW + 1, allTime: 40 });
  assert.ok(cost! > 0);
});

test('top tools group MCP calls per server and keep the top 8', () => {
  const calls = [
    call('mcp__claude_ai_Gmail__send'),
    call('mcp__claude_ai_Gmail__search'),
    call('mcp__gcloud__run_gcloud_command'),
    ...Array.from({ length: 3 }, () => call('Read')),
    ...'abcdefgh'.split('').map((c) => call(`T${c}`)),
  ];
  const o = buildOverview(data({ toolCalls: calls }), state(), 'today', NOW);
  assert.equal(o.topTools.length, 8);
  assert.deepEqual(o.topTools.slice(0, 3), [
    { name: 'Read', count: 3 },
    { name: 'Gmail', count: 2, server: 'Gmail' },
    { name: 'gcloud', count: 1, server: 'gcloud' },
  ]);
});

test('models are token shares sorted desc', () => {
  const o = buildOverview(
    data({
      responses: [
        response({ model: 'claude-fable-5-1', usage: usage({ input: 300 }) }),
        response({ model: 'claude-haiku-4-5-20251001', usage: usage({ output: 100 }) }),
      ],
    }),
    state(),
    'today',
    NOW,
  );
  assert.deepEqual(
    o.models.map(({ name, tokens, share }) => ({ name, tokens, share })),
    [
      { name: 'fable-5-1', tokens: 300, share: 0.75 },
      { name: 'haiku-4-5', tokens: 100, share: 0.25 },
    ],
  );
});

test('usage is passed through from state', () => {
  const plan: PlanUsage = { meters: [], fetchedAt: 1, extraUsageEnabled: false };
  assert.equal(buildOverview(data(), state({ usage: plan }), 'today', NOW).usage, plan);
});

test('helpers', () => {
  assert.equal(shortModel('claude-haiku-4-5-20251001'), 'haiku-4-5');
  assert.equal(localDate(new Date(2026, 0, 5, 23, 59).getTime()), '2026-01-05');
});
