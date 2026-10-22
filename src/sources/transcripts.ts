import { createHash } from 'node:crypto';
import { createReadStream, readFileSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { ApiResponse, FileEntry, FileEvents, SlashCommand, ToolCall, TokenUsage, TranscriptData } from '../types.js';
import { loadCache, saveCache } from './cache.js';

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

export interface Progress {
  /** Files read in this refresh. */
  done: number;
  /** Files this refresh has to read; cached and unchanged files are not counted. */
  total: number;
}

export interface ScanOptions {
  /** Events before this are never shown; files last modified over a day earlier are not read. */
  since?: number;
  /** On the first scan, once every file modified at or after this is read, `onPartial` gets the data so far. */
  partialAt?: number;
  onProgress?: (progress: Progress) => void;
  onPartial?: (data: TranscriptData) => void;
}

export interface StoreOptions {
  /** Path of the on-disk cache; none means no cache. */
  cache?: string;
  now?: () => number;
}

const DAY = 86_400_000;
const PROGRESS_MS = 100;
const SAVE_MS = 15 * 60_000;

/** Changes whenever this parser changes, so a cache written by another parser is ignored. */
export const PARSER = createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex').slice(0, 16);

interface Listed {
  path: string;
  size: number;
  mtimeMs: number;
}

/** Incrementally parsed view of every transcript under `root`. */
export class TranscriptStore {
  private readonly files = new Map<string, FileEntry>();
  private merged: TranscriptData | null = null;
  /** The on-disk cache, loaded once and dropped after the first refresh. */
  private cached: Map<string, FileEntry> | null = null;
  private running: Promise<TranscriptData> | null = null;
  private saving: Promise<void> = Promise.resolve();
  private savedAt = -Infinity;
  private unsaved = false;
  private closed = false;

  constructor(
    private readonly root: string,
    private readonly options: StoreOptions = {},
  ) {}

  /** A call while a refresh runs joins it instead of starting a second scan. */
  refresh(options: ScanOptions = {}): Promise<TranscriptData> {
    this.running ??= this.scan(options).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /** Resolves once the pending cache write, if any, is done. */
  flush(): Promise<void> {
    return this.saving;
  }

  /**
   * Stops a running scan after the file in hand and writes every file parsed so
   * far, throttle or not, so quitting mid-scan never throws that work away.
   */
  async close(): Promise<void> {
    this.closed = true;
    await this.running?.catch(() => {});
    const { cache } = this.options;
    if (cache && this.unsaved) this.save(cache);
    return this.saving;
  }

  private async scan({ since = -Infinity, partialAt, onProgress, onPartial }: ScanOptions): Promise<TranscriptData> {
    const { cache, now = Date.now } = this.options;
    if (cache && !this.merged) this.cached = await loadCache(cache, this.root, PARSER);

    const listed = await this.list(since);
    let changed = false;

    const live = new Set(listed.map((f) => f.path));
    for (const path of this.files.keys()) {
      if (live.has(path)) continue;
      this.files.delete(path);
      changed = true;
    }

    // Newest first: a record is written before its file's mtime, so once every file
    // modified after T is read, every event after T is known.
    listed.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const todo: Listed[] = [];
    for (const file of listed) {
      if (matches(this.files.get(file.path), file)) continue;
      const cached = this.cached?.get(file.path);
      if (matches(cached, file)) {
        this.files.set(file.path, cached!);
        changed = true;
      } else {
        todo.push(file);
      }
    }
    this.cached = null;

    const total = todo.length;
    if (total) onProgress?.({ done: 0, total });
    let emitted = false;
    let reported = Date.now();
    for (const [i, file] of todo.entries()) {
      if (this.closed) break;
      if (!this.merged && onPartial && partialAt !== undefined && !emitted && file.mtimeMs < partialAt) {
        emitted = true;
        onPartial(this.merge(file.mtimeMs));
      }
      // On a failed read keep the previous events and leave the file unrecorded so the next refresh retries it.
      const events = await parseFile(file.path).catch(() => null);
      if (events) {
        this.files.set(file.path, { size: file.size, mtimeMs: file.mtimeMs, events });
        changed = true;
        this.unsaved = true;
      }
      if (i === total - 1 || Date.now() - reported >= PROGRESS_MS) {
        reported = Date.now();
        onProgress?.({ done: i + 1, total });
      }
    }

    if (changed || !this.merged) this.merged = this.merge(-Infinity);
    if (cache && this.unsaved && !this.closed && now() - this.savedAt >= SAVE_MS) this.save(cache);
    return this.merged;
  }

  private save(cache: string): void {
    this.savedAt = (this.options.now ?? Date.now)();
    this.unsaved = false;
    const files = new Map(this.files);
    this.saving = this.saving.then(() => saveCache(cache, this.root, PARSER, files));
  }

  /** Transcripts that can still hold a shown event, with the stat taken before any read. */
  private async list(since: number): Promise<Listed[]> {
    const paths = await listJsonl(this.root);
    const stats = await Promise.all(paths.map((path) => stat(path).catch(() => null)));
    return paths.flatMap((path, i) => {
      const info = stats[i];
      // The day of margin covers clocks that disagree between machines syncing transcripts.
      return info && info.mtimeMs >= since - DAY ? [{ path, size: info.size, mtimeMs: info.mtimeMs }] : [];
    });
  }

  private merge(knownAfter: number): TranscriptData {
    const all = [...this.files.values()].map((f) => f.events);
    return {
      responses: final(all.flatMap((e) => e.responses)),
      toolCalls: unique<ToolCall>(all.flatMap((e) => e.toolCalls)),
      slashCommands: unique<SlashCommand>(all.flatMap((e) => e.slashCommands)),
      files: this.files.size,
      knownAfter,
    };
  }
}

const matches = (entry: FileEntry | undefined, file: Listed) =>
  entry !== undefined && entry.size === file.size && entry.mtimeMs === file.mtimeMs;
