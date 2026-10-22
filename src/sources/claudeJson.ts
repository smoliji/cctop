import { readFile } from 'node:fs/promises';
import type { ClaudeState, LimitMeter, PlanUsage } from '../types.js';

type Json = Record<string, unknown>;

const empty = (): ClaudeState => ({ usage: null, skillUsage: {} });

export async function readClaudeState(file: string): Promise<ClaudeState> {
  const json = await load(file);
  if (!json) return empty();
  return { usage: planUsage(json.cachedUsageUtilization), skillUsage: skillUsage(json.skillUsage) };
}

// Claude Code rewrites the file while running, so a read can catch it half written.
async function load(file: string): Promise<Json | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch {
      return null;
    }
    try {
      const json: unknown = JSON.parse(text);
      return isObject(json) ? json : null;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  return null;
}

function planUsage(cached: unknown): PlanUsage | null {
  if (!isObject(cached) || !isObject(cached.utilization)) return null;
  const { utilization } = cached;
  const meters = Array.isArray(utilization.limits)
    ? utilization.limits.flatMap(limitMeter)
    : windowMeters(utilization);
  const extra = utilization.extra_usage;
  return {
    meters,
    fetchedAt: typeof cached.fetchedAtMs === 'number' ? cached.fetchedAtMs : 0,
    extraUsageEnabled: isObject(extra) && extra.is_enabled === true,
  };
}

function limitMeter(limit: unknown): LimitMeter[] {
  if (!isObject(limit) || typeof limit.percent !== 'number') return [];
  const label = limitLabel(limit);
  return label ? [meter(label, limit.percent, limit.resets_at)] : [];
}

function limitLabel(limit: Json): string | null {
  switch (limit.kind) {
    case 'session':
      return '5h';
    case 'weekly_all':
      return 'Week';
    case 'weekly_scoped': {
      const model = isObject(limit.scope) && isObject(limit.scope.model) ? limit.scope.model : null;
      return typeof model?.display_name === 'string' ? model.display_name : 'Scoped';
    }
    default:
      return null;
  }
}

function windowMeters(utilization: Json): LimitMeter[] {
  const windows = [
    ['5h', utilization.five_hour],
    ['Week', utilization.seven_day],
  ] as const;
  return windows.flatMap(([label, window]) =>
    isObject(window) && typeof window.utilization === 'number'
      ? [meter(label, window.utilization, window.resets_at)]
      : [],
  );
}

function meter(label: string, percent: number, resetsAt: unknown): LimitMeter {
  return { label, percent: Math.min(100, Math.max(0, percent)), resetsAt: toMs(resetsAt) };
}

function toMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Epoch seconds are below 1e12 until the year 33658.
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

function skillUsage(raw: unknown): Record<string, number> {
  if (!isObject(raw)) return {};
  const counts: Record<string, number> = {};
  for (const [name, entry] of Object.entries(raw)) {
    if (isObject(entry) && typeof entry.usageCount === 'number') counts[name] = entry.usageCount;
  }
  return counts;
}

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
