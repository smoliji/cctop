import { costOf, normalizeModel } from './pricing.js';
import type {
  ApiResponse,
  ClaudeState,
  DayRow,
  ModelShare,
  Overview,
  Period,
  Ranked,
  TokenUsage,
  TranscriptData,
} from './types.js';

const TOP = 8;
const PERIOD_DAYS: Record<Period, number> = { today: 1, '7d': 7, '30d': 30 };

export function buildOverview(
  data: TranscriptData,
  state: ClaudeState,
  period: Period,
  now: number,
): Overview {
  const days = lastDays(data.responses, now, 7);
  const since = dayStart(now, PERIOD_DAYS[period] - 1);
  const responses = data.responses.filter((r) => r.timestamp >= since);
  const calls = data.toolCalls.filter((c) => c.timestamp >= since);
  const commands = data.slashCommands.filter((c) => c.timestamp >= since);

  const usage = sumUsage(responses.map((r) => r.usage));
  const cacheIn = usage.input + usage.cacheRead + usage.cacheWrite5m + usage.cacheWrite1h;
  const peakDay = days.reduce((a, b) => (b.tokens > a.tokens ? b : a));
  const weekTokens = sum(days.map((d) => d.tokens));

  const skills = new Map<string, number>();
  for (const c of calls) if (c.name === 'Skill' && c.skill) bump(skills, c.skill);
  for (const c of commands) {
    const name = c.name.replace(/^\//, '');
    if (name.includes(':') || Object.hasOwn(state.skillUsage, name)) bump(skills, name);
  }

  const tools = new Map<string, Ranked>();
  for (const c of calls) {
    const server = mcpServer(c.name);
    const name = server ?? c.name;
    const row = tools.get(name) ?? { name, count: 0, ...(server ? { server } : {}) };
    row.count++;
    tools.set(name, row);
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
    topSkills: rank([...skills].map(([name, count]) => ({ name, count }))),
    topTools: rank([...tools.values()]),
    models: modelShares(responses),
    usage: state.usage,
  };
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
function dayStart(now: number, back: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - back);
  return d.getTime();
}

function lastDays(responses: ApiResponse[], now: number, count: number): DayRow[] {
  const rows = Array.from({ length: count }, (_, i) => ({
    date: localDate(dayStart(now, i)),
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

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function rank(rows: Ranked[]): Ranked[] {
  return rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, TOP);
}
