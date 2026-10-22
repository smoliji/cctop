import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readClaudeState } from '../src/sources/claudeJson.js';

const fixture = (name: string) => join(import.meta.dirname, 'fixtures', name);

const dir = mkdtempSync(join(tmpdir(), 'cctop-'));
after(() => rmSync(dir, { recursive: true, force: true }));
let seq = 0;

function tmpFile(content: string): string {
  const file = join(dir, `${seq++}.json`);
  writeFileSync(file, content);
  return file;
}

test('readClaudeState returns empty state for a missing file', async () => {
  assert.deepEqual(await readClaudeState('/nonexistent/.claude.json'), { usage: null, skillUsage: {} });
});

test('readClaudeState maps limits to meters and prefers them over windows', async () => {
  const { usage } = await readClaudeState(fixture('claude-limits.json'));
  assert.deepEqual(usage, {
    fetchedAt: 1760000000000,
    extraUsageEnabled: true,
    meters: [
      { label: '5h', percent: 42, resetsAt: Date.parse('2025-10-09T12:00:00Z') },
      { label: 'Week', percent: 17, resetsAt: 1760400000000 },
      { label: 'Fable', percent: 100, resetsAt: null },
    ],
  });
});

test('readClaudeState falls back to five_hour and seven_day without limits', async () => {
  const { usage } = await readClaudeState(fixture('claude-windows.json'));
  assert.deepEqual(usage, {
    fetchedAt: 1760000000000,
    extraUsageEnabled: false,
    meters: [
      { label: '5h', percent: 30.5, resetsAt: Date.parse('2025-10-09T12:00:00Z') },
      { label: 'Week', percent: 8, resetsAt: null },
    ],
  });
});

test('readClaudeState reads skill usage counts and skips malformed entries', async () => {
  const { skillUsage } = await readClaudeState(fixture('claude-limits.json'));
  assert.deepEqual(skillUsage, { review: 7, plan: 2 });
});

test('readClaudeState returns null usage when the cache is absent', async () => {
  assert.deepEqual(await readClaudeState(tmpFile('{"skillUsage":{}}')), { usage: null, skillUsage: {} });
});

test('readClaudeState retries a half written file', async () => {
  const file = tmpFile('{"skillUsage":{"review":');
  const state = readClaudeState(file);
  writeFileSync(file, '{"skillUsage":{"review":{"usageCount":3}}}');
  assert.deepEqual((await state).skillUsage, { review: 3 });
});

test('readClaudeState gives up on a file that stays corrupt', async () => {
  assert.deepEqual(await readClaudeState(tmpFile('{not json')), { usage: null, skillUsage: {} });
});
