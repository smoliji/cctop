import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { ApiResponse, FileEvents, SlashCommand, ToolCall, TokenUsage, TranscriptData } from '../types.js';

type Json = Record<string, any>;

const COMMAND = /^<command-(?:name|message)>/;
const COMMAND_NAME = /<command-name>\/?([^<]+)<\/command-name>/;

function emptyEvents(): FileEvents {
  return { responses: [], toolCalls: [], slashCommands: [] };
}

/** Lines without these markers can never yield an event, so they skip JSON.parse. */
function mayMatter(line: string): boolean {
  return line.includes('"usage"') || line.includes('"tool_use"') || line.includes('<command-name>');
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function tokens(usage: Json): TokenUsage {
  const split = usage.cache_creation;
  const hasSplit = split && typeof split === 'object';
  return {
    input: num(usage.input_tokens),
    output: num(usage.output_tokens),
    cacheRead: num(usage.cache_read_input_tokens),
    cacheWrite5m: hasSplit ? num(split.ephemeral_5m_input_tokens) : num(usage.cache_creation_input_tokens),
    cacheWrite1h: hasSplit ? num(split.ephemeral_1h_input_tokens) : 0,
  };
}

function assistant(record: Json, timestamp: number, into: FileEvents): void {
  const message = record.message;
  if (!message || typeof message !== 'object') return;

  const { id, model, usage } = message;
  if (typeof id === 'string' && typeof model === 'string' && model !== '<synthetic>' && usage && typeof usage === 'object') {
    into.responses.push({
      key: `${id}:${record.requestId ?? ''}`,
      timestamp,
      model,
      project: typeof record.cwd === 'string' ? record.cwd : '',
      sessionId: typeof record.sessionId === 'string' ? record.sessionId : '',
      sidechain: record.isSidechain === true,
      ...(typeof record.agentId === 'string' && { agentId: record.agentId }),
      ...(typeof record.attributionSkill === 'string' && { skill: record.attributionSkill }),
      usage: tokens(usage),
    });
  }

  if (!Array.isArray(message.content)) return;
  for (const block of message.content) {
    if (block?.type !== 'tool_use' || typeof block.id !== 'string' || typeof block.name !== 'string') continue;
    const call: ToolCall = { key: block.id, timestamp, name: block.name };
    const input = block.input;
    if (typeof input?.skill === 'string') call.skill = input.skill;
    if (typeof input?.subagent_type === 'string') call.subagentType = input.subagent_type;
    into.toolCalls.push(call);
  }
}

function user(record: Json, timestamp: number, into: FileEvents): void {
  const content = record.message?.content;
  // Tool results and harness text can quote the tag; only a typed command starts with it.
  if (typeof content !== 'string' || !COMMAND.test(content) || typeof record.uuid !== 'string') return;
  const name = COMMAND_NAME.exec(content)?.[1];
  if (name) into.slashCommands.push({ key: record.uuid, timestamp, name });
}

/** Adds the events of one transcript line to `into`. Unknown or malformed lines are ignored. */
export function parseLine(line: string, into: FileEvents = emptyEvents()): FileEvents {
  if (!mayMatter(line)) return into;
  let record: unknown;
  try {
    record = JSON.parse(line);
  } catch {
    return into;
  }
  if (!record || typeof record !== 'object') return into;

  const r = record as Json;
  const timestamp = Date.parse(r.timestamp);
  if (!Number.isFinite(timestamp)) return into;

  if (r.type === 'assistant') assistant(r, timestamp, into);
  else if (r.type === 'user') user(r, timestamp, into);
  return into;
}

function unique<T extends { key: string }>(items: Iterable<T>): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    out.push(item);
  }
  return out;
}

/** A streamed response is first written with partial `output_tokens`; the final line has the full count. */
function final(responses: Iterable<ApiResponse>): ApiResponse[] {
  const byKey = new Map<string, ApiResponse>();
  for (const r of responses) {
    const known = byKey.get(r.key);
    if (!known || r.usage.output > known.usage.output) byKey.set(r.key, r);
  }
  return [...byKey.values()];
}

export async function parseFile(path: string): Promise<FileEvents> {
  const events = emptyEvents();
  const lines = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity });
  for await (const line of lines) parseLine(line, events);
  // One response is written once per content block; collapse it here to keep memory small.
  return {
    responses: final(events.responses),
    toolCalls: unique(events.toolCalls),
    slashCommands: unique(events.slashCommands),
  };
}

async function listJsonl(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { recursive: true, withFileTypes: true });
    return entries.filter((e) => e.isFile() && e.name.endsWith('.jsonl')).map((e) => join(e.parentPath, e.name));
  } catch {
    return [];
  }
}

interface Entry {
  size: number;
  mtimeMs: number;
  events: FileEvents;
}

/** Incrementally parsed view of every transcript under `root`. */
export class TranscriptStore {
  private readonly files = new Map<string, Entry>();
  private merged: TranscriptData | null = null;

  constructor(private readonly root: string) {}

  async refresh(): Promise<TranscriptData> {
    const paths = await listJsonl(this.root);
    let changed = false;

    const live = new Set(paths);
    for (const path of this.files.keys()) {
      if (live.has(path)) continue;
      this.files.delete(path);
      changed = true;
    }

    for (const path of paths) {
      const info = await stat(path).catch(() => null);
      if (!info) {
        changed = this.files.delete(path) || changed;
        continue;
      }
      const known = this.files.get(path);
      if (known && known.size === info.size && known.mtimeMs === info.mtimeMs) continue;
      // On a failed read keep the previous events and leave the file unrecorded so the next refresh retries it.
      const events = await parseFile(path).catch(() => null);
      if (!events) continue;
      this.files.set(path, { size: info.size, mtimeMs: info.mtimeMs, events });
      changed = true;
    }

    if (changed || !this.merged) this.merged = this.merge();
    return this.merged;
  }

  private merge(): TranscriptData {
    const all = [...this.files.values()].map((f) => f.events);
    return {
      responses: final(all.flatMap((e) => e.responses)),
      toolCalls: unique<ToolCall>(all.flatMap((e) => e.toolCalls)),
      slashCommands: unique<SlashCommand>(all.flatMap((e) => e.slashCommands)),
      files: this.files.size,
    };
  }
}
