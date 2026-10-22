import prices from './pricing.json' with { type: 'json' };
import type { TokenUsage } from './types.js';

/** USD per token; `null` where LiteLLM has no price. */
export interface Price {
  input: number;
  output: number;
  cacheRead: number | null;
  cacheWrite5m: number | null;
  cacheWrite1h: number | null;
}

const table: Record<string, Price> = prices.models;

/** `us.anthropic.claude-opus-5-5-20260101-v1:0[1m]` -> `claude-opus-5-5`. */
export function normalizeModel(model: string): string {
  return model
    .toLowerCase()
    .replace(/\[.*?\]$/, '')
    .replace(/^.*\//, '')
    .replace(/^(?:[a-z]+\.)*(?=claude)/, '')
    .replace(/(?:-v\d+(?::\d+)?|@.*)$/, '')
    .replace(/-\d{8}$/, '')
    .replace(/-latest$/, '');
}

export function priceOf(model: string): Price | null {
  return table[normalizeModel(model)] ?? null;
}

/** API list-price equivalent in USD, or `null` when the model or a used rate is unknown. */
export function costOf(model: string, usage: TokenUsage): number | null {
  const price = priceOf(model);
  if (!price) return null;
  let cost = 0;
  for (const field of ['input', 'output', 'cacheRead', 'cacheWrite5m', 'cacheWrite1h'] as const) {
    if (!usage[field]) continue;
    const rate = price[field];
    if (rate == null) return null;
    cost += usage[field] * rate;
  }
  return cost;
}
