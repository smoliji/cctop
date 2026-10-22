import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costOf, normalizeModel, priceOf } from '../src/pricing.js';

const usage = (u: Partial<Record<string, number>> = {}) => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite5m: 0,
  cacheWrite1h: 0,
  ...u,
});

test('normalizeModel drops provider prefixes, date and version suffixes', () => {
  assert.equal(normalizeModel('claude-haiku-4-5-20251001'), 'claude-haiku-4-5');
  assert.equal(normalizeModel('anthropic/claude-opus-5'), 'claude-opus-5');
  assert.equal(normalizeModel('us.anthropic.claude-opus-5-5-20260101-v1:0'), 'claude-opus-5-5');
  assert.equal(normalizeModel('claude-opus-4-5@20251101'), 'claude-opus-4-5');
  assert.equal(normalizeModel('claude-opus-5-5[1m]'), 'claude-opus-5-5');
});

test('every model seen locally has a price', () => {
  for (const m of [
    'claude-opus-5-5',
    'claude-fable-5-1',
    'claude-haiku-4-5-20251001',
    'claude-opus-5',
    'claude-fable-5',
    'claude-sonnet-5-5',
  ]) {
    assert.ok(priceOf(m), m);
  }
});

test('costOf prices every token kind', () => {
  const p = priceOf('claude-haiku-4-5')!;
  const u = usage({ input: 10, output: 20, cacheRead: 30, cacheWrite5m: 40, cacheWrite1h: 50 });
  const expected =
    10 * p.input + 20 * p.output + 30 * p.cacheRead! + 40 * p.cacheWrite5m! + 50 * p.cacheWrite1h!;
  assert.equal(costOf('claude-haiku-4-5-20251001', u), expected);
  assert.ok(expected > 0);
});

test('costOf returns null for unknown models and 0 for empty usage', () => {
  assert.equal(costOf('<synthetic>', usage({ input: 1 })), null);
  assert.equal(costOf('gpt-5', usage({ input: 1 })), null);
  assert.equal(costOf('claude-opus-5', usage()), 0);
});
