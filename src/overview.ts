import { basename, dirname, join } from 'node:path';
import { costOf, normalizeModel } from './pricing.js';
import type {
  ApiResponse,
  ClaudeState,
  DayRow,
  ModelShare,
  Overview,
  Period,
  ProjectRow,
  Ranked,
  SkillRow,
  TokenUsage,
  TranscriptData,
} from './types.js';

const PERIOD_DAYS: Record<Period, number> = { today: 1, '7d': 7, '30d': 30 };
export const HISTORY_DAYS = 7;

/** Oldest instant any period can show. */
export const horizon = (now: number) => dayStart(now, Math.max(...Object.values(PERIOD_DAYS)) - 1);
/** Start of the per-day history. */
export const historyStart = (now: number) => dayStart(now, HISTORY_DAYS - 1);

export function buildOverview(
  data: TranscriptData,
  state: ClaudeState,
  period: Period,
  now: number,
): Overview {
  const days = lastDays(data.responses, now, HISTORY_DAYS);
  const since = dayStart(now, PERIOD_DAYS[period] - 1);
  const responses = data.responses.filter((r) => r.timestamp >= since);
  const calls = data.toolCalls.filter((c) => c.timestamp >= since);

  const usage = sumUsage(responses.map((r) => r.usage));
  const cacheIn = usage.input + usage.cacheRead + usage.cacheWrite5m + usage.cacheWrite1h;
  const peakDay = days.reduce((a, b) => (b.tokens > a.tokens ? b : a));
  const weekTokens = sum(days.map((d) => d.tokens));

  const skills = skillRows(data, since, state);

  const tools = new Map<string, Ranked>();
  for (const c of calls) {
    const server = mcpServer(c.name);
    const name = server ?? c.name;
    const row = tools.get(name) ?? { name, count: 0, ...(server ? { server } : {}) };
    row.count++;
    tools.set(name, row);
  }

  const agents = new Map<string, Ranked>();
  for (const c of calls) {
    if (!c.subagentType) continue;
    const row = agents.get(c.subagentType) ?? { name: c.subagentType, count: 0 };
    row.count++;
    agents.set(c.subagentType, row);
  }

  return {
    now,
    period,
    days,
    week: {
      tokens: weekTokens,
      cost: sumKnown(days.filter((d) => d.tokens > 0).map((d) => d.cost)),
      avg: weekTokens / days.length,
      peak: peakDay.tokens,
      peakDate: peakDay.tokens > 0 ? peakDay.date : null,
    },
    totals: {
      tokens: tokensOf(usage),
      cost: sumKnown(responses.map(costOfResponse)),
      cacheHit: cacheIn ? usage.cacheRead / cacheIn : 0,
      sessions: new Set(responses.filter((r) => !r.sidechain).map((r) => r.sessionId)).size,
      responses: responses.length,
      subagents: new Set(responses.flatMap((r) => (r.agentId ? [r.agentId] : []))).size,
    },
    // In the order of `skills`, so ties sort the same on both tabs.
    topSkills: skills.map((s) => ({ name: s.name, count: s.calls + s.typed })).filter((s) => s.count > 0),
    skills,
    topTools: rank([...tools.values()]),
    models: modelShares(responses),
    projects: projectRows(responses),
    topAgents: rank([...agents.values()]),
    usage: state.usage,
    // Events after `knownAfter` are known; one exactly at a day start is not proven read yet.
    pending: { days: data.knownAfter >= historyStart(now), period: data.knownAfter >= since },
  };
}

/** Lifetime skill counts from `~/.claude.json`, shown while transcripts are still being read. */
export function lifetimeSkills(state: ClaudeState): SkillRow[] {
  return Object.entries(state.skillUsage)
    .map(([name, allTime]) => ({ name, calls: 0, typed: 0, turns: 0, tokens: 0, tokensByModel: {}, cost: null, lastUsed: null, allTime }))
    .sort((a, b) => b.allTime - a.allTime || a.name.localeCompare(b.name));
}

/** Local dates of the last `count` days, newest first. */
export function recentDates(now: number, count = HISTORY_DAYS): string[] {
  return Array.from({ length: count }, (_, i) => localDate(dayStart(now, i)));
}

/** `claude-opus-5-5-20260101` -> `opus-5-5`. */
export function shortModel(model: string): string {
  return normalizeModel(model).replace(/^claude-/, '');
}

export function tokensOf(u: TokenUsage): number {
  return u.input + u.output + u.cacheRead + u.cacheWrite5m + u.cacheWrite1h;
}

/** Local calendar date, `YYYY-MM-DD`. */
export function localDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight `back` days before the day of `now`; via Date so DST days stay whole. */
export function dayStart(now: number, back: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - back);
  return d.getTime();
}

function lastDays(responses: ApiResponse[], now: number, count: number): DayRow[] {
  const rows = recentDates(now, count).map((date) => ({
    date,
    tokensByModel: {} as Record<string, number>,
    tokens: 0,
    costs: [] as (number | null)[],
  }));
  const byDate = new Map(rows.map((r) => [r.date, r]));
  for (const r of responses) {
    const row = byDate.get(localDate(r.timestamp));
    if (!row) continue;
    const tokens = tokensOf(r.usage);
    const model = shortModel(r.model);
    row.tokensByModel[model] = (row.tokensByModel[model] ?? 0) + tokens;
    row.tokens += tokens;
    row.costs.push(costOfResponse(r));
  }
  return rows.map(({ costs, ...row }) => ({ ...row, cost: sumKnown(costs) }));
}

function skillRows(data: TranscriptData, since: number, state: ClaudeState): SkillRow[] {
  const rows = new Map<string, SkillRow & { costs: (number | null)[] }>();
  const touch = (name: string, timestamp: number) => {
    let row = rows.get(name);
    if (!row) {
      const allTime = Object.hasOwn(state.skillUsage, name) ? state.skillUsage[name]! : null;
      row = { name, calls: 0, typed: 0, turns: 0, tokens: 0, tokensByModel: {}, cost: null, lastUsed: null, allTime, costs: [] };
      rows.set(name, row);
    }
    row.lastUsed = Math.max(row.lastUsed ?? 0, timestamp);
    return row;
  };

  for (const c of data.toolCalls) {
    if (c.timestamp >= since && c.name === 'Skill' && c.skill) touch(c.skill, c.timestamp).calls++;
  }
  for (const c of data.slashCommands) {
    const name = c.name.replace(/^\//, '');
    // Built-in commands like /clear share the slash syntax; only skills are named plugin:skill or tracked in skillUsage.
    if (c.timestamp >= since && (name.includes(':') || Object.hasOwn(state.skillUsage, name))) {
      touch(name, c.timestamp).typed++;
    }
  }
  for (const r of data.responses) {
    if (r.timestamp < since || !r.skill) continue;
    const row = touch(r.skill, r.timestamp);
    const tokens = tokensOf(r.usage);
    const model = shortModel(r.model);
    row.turns++;
    row.tokens += tokens;
    row.tokensByModel[model] = (row.tokensByModel[model] ?? 0) + tokens;
    row.costs.push(costOfResponse(r));
  }
  return [...rows.values()]
    .map(({ costs, ...row }) => ({ ...row, cost: sumKnown(costs) }))
    .sort((a, b) => b.calls + b.typed - (a.calls + a.typed) || b.tokens - a.tokens || a.name.localeCompare(b.name));
}

function modelShares(responses: ApiResponse[]): ModelShare[] {
  const groups = new Map<string, { tokens: number; costs: (number | null)[] }>();
  for (const r of responses) {
    const name = shortModel(r.model);
    const g = groups.get(name) ?? { tokens: 0, costs: [] };
    g.tokens += tokensOf(r.usage);
    g.costs.push(costOfResponse(r));
    groups.set(name, g);
  }
  const total = sum([...groups.values()].map((g) => g.tokens));
  return [...groups]
    .map(([name, g]) => ({
      name,
      tokens: g.tokens,
      share: total ? g.tokens / total : 0,
      cost: sumKnown(g.costs),
    }))
    .sort((a, b) => b.tokens - a.tokens || a.name.localeCompare(b.name));
}

function projectRows(responses: ApiResponse[]): ProjectRow[] {
  const groups = new Map<string, ProjectRow>();
  for (const r of responses) {
    const row = groups.get(r.project) ?? { path: r.project, name: basename(r.project) || r.project || 'unknown', tokens: 0 };
    row.tokens += tokensOf(r.usage);
    groups.set(r.project, row);
  }
  const rows = [...groups.values()];
  const seen = new Map<string, number>();
  for (const row of rows) seen.set(row.name, (seen.get(row.name) ?? 0) + 1);
  // Two `src` folders read the same; their parent tells them apart.
  for (const row of rows) {
    if (seen.get(row.name)! > 1 && row.path) row.name = join(basename(dirname(row.path)), basename(row.path));
  }
  return rows.sort((a, b) => b.tokens - a.tokens || a.name.localeCompare(b.name));
}

/** `mcp__claude_ai_Gmail__send` -> `Gmail`; null for non-MCP tools. */
function mcpServer(tool: string): string | null {
  const m = /^mcp__(.+?)__/.exec(tool);
  return m ? m[1].replace(/^claude_ai_/, '') : null;
}

function costOfResponse(r: ApiResponse): number | null {
  return costOf(r.model, r.usage);
}

function sumUsage(list: TokenUsage[]): TokenUsage {
  const total = { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 };
  for (const u of list) {
    total.input += u.input;
    total.output += u.output;
    total.cacheRead += u.cacheRead;
    total.cacheWrite5m += u.cacheWrite5m;
    total.cacheWrite1h += u.cacheWrite1h;
  }
  return total;
}

/** Null when any value is unknown: a partial sum would pass for the whole cost. */
function sumKnown(values: (number | null)[]): number | null {
  if (values.length === 0 || values.includes(null)) return null;
  return sum(values as number[]);
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** All, sorted by count, then name. */
function rank(rows: Ranked[]): Ranked[] {
  return rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
