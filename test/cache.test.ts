import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, chmodSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { cachePath, loadCache } from '../src/sources/cache.js';
import { PARSER, TranscriptStore, type Progress } from '../src/sources/transcripts.js';

const fixtures = join(import.meta.dirname, 'fixtures', 'transcripts');
const MINUTE = 60_000;

function tmp(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), 'cctop-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A copy of the fixture transcripts and a cache path next to it. */
function setup(t: TestContext) {
  const dir = tmp(t);
  const root = join(dir, 'projects');
  cpSync(fixtures, root, { recursive: true });
  return { root, cache: join(dir, 'cache', 'cctop', 'transcripts.json') };
}

function assistant(id: string, output = 1): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp: '2026-10-20T10:00:00.000Z',
    requestId: 'r',
    message: { id, model: 'claude-opus-4-5', content: [], usage: { input_tokens: 1, output_tokens: output } },
  });
}

const keys = (data: { responses: { key: string }[] }) => data.responses.map((r) => r.key).sort();
const COLD = ['msg_1:req_1', 'msg_2:req_2', 'msg_3:req_3'];

async function warm(root: string, cache: string) {
  const store = new TranscriptStore(root, { cache });
  const data = await store.refresh();
  await store.flush();
  return data;
}

test('a second store reads unchanged files from the cache', { skip: process.getuid?.() === 0 }, async (t) => {
  const { root, cache } = setup(t);
  const first = await warm(root, cache);
  const file = join(root, 'proj-b', 's2.jsonl');
  chmodSync(file, 0o000);

  const seen: Progress[] = [];
  const second = await new TranscriptStore(root, { cache }).refresh({ onProgress: (p) => seen.push(p) });
  assert.deepEqual(second.responses, first.responses);
  assert.deepEqual(keys(second), COLD);
  assert.deepEqual(seen, [], 'nothing had to be read');
});

test('a changed file is read again despite the cache', async (t) => {
  const { root, cache } = setup(t);
  await warm(root, cache);
  const file = join(root, 'proj-b', 's2.jsonl');
  appendFileSync(file, assistant('m9') + '\n');
  const later = new Date(statSync(file).mtimeMs + 2000);
  utimesSync(file, later, later);

  const data = await new TranscriptStore(root, { cache }).refresh();
  assert.deepEqual(keys(data), [...COLD, 'm9:r'].sort());
});

test('the cache keeps the final line of a streamed response', async (t) => {
  for (const [cached, added] of [
    [3, 4136],
    [4136, 3],
  ]) {
    const dir = tmp(t);
    const cache = join(dir, 'cache.json');
    writeFileSync(join(dir, 'a.jsonl'), assistant('m', cached) + '\n');
    await warm(dir, cache);
    writeFileSync(join(dir, 'b.jsonl'), assistant('m', added) + '\n');

    const { responses } = await new TranscriptStore(dir, { cache }).refresh();
    assert.equal(responses.length, 1);
    assert.equal(responses[0]!.usage.output, 4136);
  }
});

test('a corrupt or foreign cache is ignored and rewritten', async (t) => {
  const valid = { format: 1, parser: PARSER, files: {} };
  const bad: [string, (root: string) => string][] = [
    ['garbage', () => '\x00\x01not json'],
    ['empty object', () => '{}'],
    ['wrong format', (root) => JSON.stringify({ ...valid, format: 99, root })],
    ['wrong parser', (root) => JSON.stringify({ ...valid, parser: 'other', root })],
    ['another root', () => JSON.stringify({ ...valid, root: '/elsewhere' })],
    ['files not an object', (root) => JSON.stringify({ ...valid, root, files: [] })],
  ];
  for (const [label, content] of bad) {
    const { root, cache } = setup(t);
    await warm(root, cache);
    writeFileSync(cache, content(root));

    const seen: Progress[] = [];
    const store = new TranscriptStore(root, { cache });
    assert.deepEqual(keys(await store.refresh({ onProgress: (p) => seen.push(p) })), COLD, label);
    assert.equal(seen[0]?.total, 3, `${label}: every file is read again`);
    await store.flush();
    assert.equal(JSON.parse(readFileSync(cache, 'utf8')).parser, PARSER, label);
    assert.equal((await loadCache(cache, root, PARSER)).size, 3, label);
  }
});

test('an invalid cache entry only costs reading that file again', async (t) => {
  const { root, cache } = setup(t);
  await warm(root, cache);
  const json = JSON.parse(readFileSync(cache, 'utf8'));
  const broken = join(root, 'proj-a', 's1.jsonl');
  json.files[broken].events.responses[0].usage = null;
  writeFileSync(cache, JSON.stringify(json));

  assert.equal((await loadCache(cache, root, PARSER)).size, 2);
  const seen: Progress[] = [];
  const data = await new TranscriptStore(root, { cache }).refresh({ onProgress: (p) => seen.push(p) });
  assert.deepEqual(keys(data), COLD);
  assert.deepEqual(seen.at(-1), { done: 1, total: 1 });
});

test('the cache is written atomically and privately', async (t) => {
  const { root, cache } = setup(t);
  await warm(root, cache);
  const dir = join(cache, '..');
  assert.equal(JSON.parse(readFileSync(cache, 'utf8')).root, root);
  assert.equal(statSync(cache).mode & 0o777, 0o600);
  assert.deepEqual(readdirSync(dir).filter((n) => n.endsWith('.tmp')), []);

  const stale = join(dir, 'transcripts.json.1.x.tmp');
  const fresh = join(dir, 'transcripts.json.2.y.tmp');
  writeFileSync(stale, '');
  writeFileSync(fresh, '');
  const old = new Date(Date.now() - 2 * 60 * MINUTE);
  utimesSync(stale, old, old);
  appendFileSync(join(root, 'proj-b', 's2.jsonl'), assistant('m9') + '\n');
  await warm(root, cache);
  assert.deepEqual(readdirSync(dir).filter((n) => n.endsWith('.tmp')), ['transcripts.json.2.y.tmp']);
});

test('saves are throttled', async (t) => {
  const { root, cache } = setup(t);
  let clock = Date.now();
  const store = new TranscriptStore(root, { cache, now: () => clock });
  await store.refresh();
  await store.flush();
  const saved = readFileSync(cache, 'utf8');
  const file = join(root, 'proj-b', 's2.jsonl');

  clock += 14 * MINUTE;
  appendFileSync(file, assistant('m8') + '\n');
  assert.equal((await store.refresh()).responses.length, 4);
  await store.flush();
  assert.equal(readFileSync(cache, 'utf8'), saved, 'a change within 15 minutes is not written');

  clock += 2 * MINUTE;
  appendFileSync(file, assistant('m9') + '\n');
  await store.refresh();
  await store.flush();
  const entries = await loadCache(cache, root, PARSER);
  const cached = entries.get(file)!.events.responses.map((r) => r.key);
  assert.ok(cached.includes('m8:r') && cached.includes('m9:r'), 'a change after 15 minutes is written');
});

test('closing mid-scan keeps the files parsed so far', async (t) => {
  const { root, cache } = setup(t);
  const files = [join(root, 'proj-a', 's1.jsonl'), join(root, 'proj-b', 's2.jsonl'), join(root, 'proj-a', 's1', 'subagents', 'agent-1.jsonl')];
  files.forEach((file, i) => {
    const at = new Date(Date.now() - i * 60 * MINUTE);
    utimesSync(file, at, at);
  });
  const store = new TranscriptStore(root, { cache });
  // The partial fires before the second file is read, so the scan stops after it.
  const scan = store.refresh({ partialAt: Date.now() - 30 * MINUTE, onPartial: () => void store.close() });
  await scan;
  await store.close();
  assert.deepEqual([...(await loadCache(cache, root, PARSER)).keys()].sort(), files.slice(0, 2).sort());

  const seen: Progress[] = [];
  await new TranscriptStore(root, { cache }).refresh({ onProgress: (p) => seen.push(p) });
  assert.deepEqual(seen.at(-1), { done: 1, total: 1 }, 'only the unread file is read');
});

test('closing writes changes the throttle held back', async (t) => {
  const { root, cache } = setup(t);
  let clock = Date.now();
  const store = new TranscriptStore(root, { cache, now: () => clock });
  await store.refresh();
  await store.flush();
  clock += MINUTE;
  const file = join(root, 'proj-b', 's2.jsonl');
  appendFileSync(file, assistant('m8') + '\n');
  await store.refresh();
  await store.close();
  const cached = (await loadCache(cache, root, PARSER)).get(file)!.events.responses.map((r) => r.key);
  assert.ok(cached.includes('m8:r'));
});

test('caches of roots unused for a month are removed', async (t) => {
  const { root, cache } = setup(t);
  const dir = join(cache, '..');
  mkdirSync(dir, { recursive: true });
  const old = join(dir, 'transcripts-0123456789abcdef.json');
  const recent = join(dir, 'transcripts-fedcba9876543210.json');
  const other = join(dir, 'notes.json');
  for (const file of [old, recent, other]) writeFileSync(file, '{}');
  const month = new Date(Date.now() - 31 * 24 * 60 * MINUTE);
  utimesSync(old, month, month);
  utimesSync(other, month, month);
  await warm(root, cache);
  assert.deepEqual(readdirSync(dir).sort(), ['notes.json', 'transcripts-fedcba9876543210.json', 'transcripts.json']);
});

test('cachePath honours XDG_CACHE_HOME and separates roots', () => {
  const a = cachePath('/a', { XDG_CACHE_HOME: '/xdg' });
  assert.match(a, /^\/xdg\/cctop\/transcripts-[0-9a-f]{16}\.json$/);
  assert.ok(cachePath('/a', { XDG_CACHE_HOME: 'relative' }).startsWith(join(homedir(), '.cache', 'cctop')));
  assert.ok(cachePath('/a', {}).startsWith(join(homedir(), '.cache', 'cctop')));
  assert.notEqual(cachePath('/b', { XDG_CACHE_HOME: '/xdg' }), a);
});
