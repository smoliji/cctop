import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, chmodSync, cpSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseFile, parseLine, TranscriptStore } from '../src/sources/transcripts.js';

const fixtures = join(import.meta.dirname, 'fixtures', 'transcripts');

function tmp(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), 'cctop-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function copy(t: TestContext): string {
  const dir = tmp(t);
  cpSync(fixtures, dir, { recursive: true });
  return dir;
}

function assistant(fields: Record<string, unknown> = {}, message: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp: '2026-10-20T10:00:00.000Z',
    requestId: 'r',
    ...fields,
    message: { id: 'm', model: 'claude-opus-4-5', content: [], usage: { input_tokens: 1 }, ...message },
  });
}

test('parseLine extracts an API response with its usage', () => {
  const line = assistant(
    { cwd: '/work', sessionId: 's', isSidechain: true },
    {
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 100,
        cache_creation_input_tokens: 30,
        cache_creation: { ephemeral_5m_input_tokens: 20, ephemeral_1h_input_tokens: 10 },
      },
    },
  );
  assert.deepEqual(parseLine(line).responses, [
    {
      key: 'm:r',
      timestamp: Date.parse('2026-10-20T10:00:00.000Z'),
      model: 'claude-opus-4-5',
      project: '/work',
      sessionId: 's',
      sidechain: true,
      usage: { input: 10, output: 5, cacheRead: 100, cacheWrite5m: 20, cacheWrite1h: 10 },
    },
  ]);
});

test('parseLine counts cache writes as 5m when the split is missing', () => {
  const [response] = parseLine(assistant({}, { usage: { cache_creation_input_tokens: 40 } })).responses;
  assert.equal(response.usage.cacheWrite5m, 40);
  assert.equal(response.usage.cacheWrite1h, 0);
  assert.equal(response.project, '');
});

test('parseLine skips synthetic responses', () => {
  assert.equal(parseLine(assistant({}, { model: '<synthetic>' })).responses.length, 0);
});

test('parseLine extracts tool calls with skill and subagent type', () => {
  const line = assistant({}, {
    content: [
      { type: 'text', text: 'x' },
      { type: 'tool_use', id: 't1', name: 'Skill', input: { skill: 'tdd' } },
      { type: 'tool_use', id: 't2', name: 'Agent', input: { subagent_type: 'Explore' } },
      { type: 'tool_use', id: 't3', name: 'mcp__github__search', input: {} },
    ],
  });
  const ts = Date.parse('2026-10-20T10:00:00.000Z');
  assert.deepEqual(parseLine(line).toolCalls, [
    { key: 't1', timestamp: ts, name: 'Skill', skill: 'tdd' },
    { key: 't2', timestamp: ts, name: 'Agent', subagentType: 'Explore' },
    { key: 't3', timestamp: ts, name: 'mcp__github__search' },
  ]);
});

test('parseLine extracts a typed slash command but not a quoted one', () => {
  const typed = JSON.stringify({
    type: 'user',
    uuid: 'u1',
    timestamp: '2026-10-20T10:00:00.000Z',
    message: { content: '<command-message>x</command-message>\n<command-name>/plugin:deploy</command-name>' },
  });
  const quoted = JSON.stringify({
    type: 'user',
    uuid: 'u2',
    timestamp: '2026-10-20T10:00:00.000Z',
    message: { content: 'see <command-name>/foo</command-name>' },
  });
  assert.deepEqual(parseLine(typed).slashCommands, [
    { key: 'u1', timestamp: Date.parse('2026-10-20T10:00:00.000Z'), name: 'plugin:deploy' },
  ]);
  assert.equal(parseLine(quoted).slashCommands.length, 0);
});

test('parseLine ignores malformed and irrelevant lines', () => {
  for (const line of ['', 'nope "usage"', '"usage"', 'null', '{"type":"assistant","usage":1}', assistant({ timestamp: 'bad' })]) {
    assert.deepEqual(parseLine(line), { responses: [], toolCalls: [], slashCommands: [] });
  }
});

test('parseFile collapses the per-block lines of one response', async () => {
  const events = await parseFile(join(fixtures, 'proj-a', 's1.jsonl'));
  assert.deepEqual(events.responses.map((r) => r.key), ['msg_1:req_1']);
  assert.deepEqual(events.toolCalls.map((t) => t.key), ['tu_1']);
  assert.deepEqual(events.slashCommands.map((c) => c.name), ['review']);
});

test('TranscriptStore merges files recursively and dedups across them', async () => {
  const data = await new TranscriptStore(fixtures).refresh();
  assert.equal(data.files, 3);
  assert.deepEqual(data.responses.map((r) => r.key).sort(), ['msg_1:req_1', 'msg_2:req_2', 'msg_3:req_3']);
  assert.deepEqual(data.toolCalls.map((t) => t.key).sort(), ['tu_1', 'tu_2', 'tu_3']);
  assert.equal(data.slashCommands.length, 1);
});

test('TranscriptStore picks up new, changed and deleted files', async (t) => {
  const root = copy(t);
  const store = new TranscriptStore(root);
  const first = await store.refresh();
  assert.equal(await store.refresh(), first, 'unchanged tree returns the cached merge');

  const changed = join(root, 'proj-b', 's2.jsonl');
  appendFileSync(changed, assistant({ requestId: 'r9' }, { id: 'm9' }) + '\n');
  const later = new Date(statSync(changed).mtimeMs + 2000);
  utimesSync(changed, later, later);
  writeFileSync(join(root, 'proj-b', 'new.jsonl'), assistant({ requestId: 'r8' }, { id: 'm8' }) + '\n');
  rmSync(join(root, 'proj-a', 's1', 'subagents', 'agent-1.jsonl'));

  const second = await store.refresh();
  assert.equal(second.files, 3);
  assert.deepEqual(second.responses.map((r) => r.key).sort(), ['m8:r8', 'm9:r9', 'msg_1:req_1', 'msg_3:req_3']);
});

test('TranscriptStore treats a missing root as empty', async () => {
  const data = await new TranscriptStore(join(tmpdir(), 'cctop-missing-root')).refresh();
  assert.deepEqual(data, { responses: [], toolCalls: [], slashCommands: [], files: 0 });
});

test('parseFile keeps the final line of a streamed response', async (t) => {
  const file = join(tmp(t), 's.jsonl');
  const line = (output: number) => assistant({}, { usage: { input_tokens: 1, output_tokens: output } });
  writeFileSync(file, [line(3), line(4136), line(3)].join('\n'));
  const { responses } = await parseFile(file);
  assert.equal(responses.length, 1);
  assert.equal(responses[0]!.usage.output, 4136);
});

test('TranscriptStore keeps the final line of a response streamed across files', async (t) => {
  const line = (output: number) => assistant({}, { usage: { input_tokens: 1, output_tokens: output } });
  for (const order of [[3, 4136], [4136, 3]]) {
    const root = tmp(t);
    writeFileSync(join(root, 'a.jsonl'), line(order[0]!) + '\n');
    writeFileSync(join(root, 'b.jsonl'), line(order[1]!) + '\n');
    const { responses } = await new TranscriptStore(root).refresh();
    assert.equal(responses.length, 1);
    assert.equal(responses[0]!.usage.output, 4136);
  }
});

test('TranscriptStore keeps a file whose read failed and retries it', { skip: process.getuid?.() === 0 }, async (t) => {
  const root = copy(t);
  const store = new TranscriptStore(root);
  assert.equal((await store.refresh()).responses.length, 3);

  const file = join(root, 'proj-b', 's2.jsonl');
  chmodSync(file, 0o000);
  const later = new Date(statSync(file).mtimeMs + 2000);
  utimesSync(file, later, later);
  assert.equal((await store.refresh()).responses.length, 3, 'a failed read keeps the parsed events');

  chmodSync(file, 0o644);
  const fixed = await store.refresh();
  assert.equal(fixed.responses.length, 3);
  assert.equal(fixed.files, 3);
});
