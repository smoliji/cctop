// Regenerates src/pricing.json from LiteLLM's price list. Build time only: cctop never goes online.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizeModel, type Price } from '../src/pricing.js';

const SOURCE =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const target = fileURLToPath(new URL('../src/pricing.json', import.meta.url));

interface Entry {
  litellm_provider?: string;
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  cache_read_input_token_cost?: number;
  cache_creation_input_token_cost?: number;
  cache_creation_input_token_cost_above_1hr?: number;
}

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`${SOURCE}: HTTP ${res.status}`);
const all = (await res.json()) as Record<string, Entry>;

const models: Record<string, Price> = {};
// Undated aliases sort first, so they win over dated snapshots of the same model.
for (const key of Object.keys(all).sort((a, b) => a.length - b.length || a.localeCompare(b))) {
  const e = all[key];
  if (e.litellm_provider !== 'anthropic' || !key.startsWith('claude')) continue;
  if (e.input_cost_per_token == null || e.output_cost_per_token == null) continue;
  const name = normalizeModel(key);
  models[name] ??= {
    input: e.input_cost_per_token,
    output: e.output_cost_per_token,
    cacheRead: e.cache_read_input_token_cost ?? null,
    cacheWrite5m: e.cache_creation_input_token_cost ?? null,
    cacheWrite1h: e.cache_creation_input_token_cost_above_1hr ?? null,
  };
}

const sorted = Object.fromEntries(Object.entries(models).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(target, JSON.stringify({ source: SOURCE, models: sorted }, null, 2) + '\n');
console.log(`${Object.keys(sorted).length} models -> ${target}`);
