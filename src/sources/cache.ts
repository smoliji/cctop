import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import type { FileEntry } from '../types.js';

const FORMAT = 1;
const STALE_TMP_MS = 3_600_000;
/** A cache of a root nobody opened for this long, like a one-off `--dir`, is dropped. */
const STALE_CACHE_MS = 30 * 86_400_000;

type Json = Record<string, unknown>;

/** `$XDG_CACHE_HOME/cctop` or `~/.cache/cctop`, one file per transcripts root. */
export function cachePath(root: string, env = process.env): string {
  const xdg = env.XDG_CACHE_HOME;
  const base = xdg && isAbsolute(xdg) ? xdg : join(homedir(), '.cache');
  return join(base, 'cctop', `transcripts-${createHash('sha256').update(root).digest('hex').slice(0, 16)}.json`);
}

/** Entries of a cache written by `parser` for `root`; empty when missing or not trusted. */
export async function loadCache(file: string, root: string, parser: string): Promise<Map<string, FileEntry>> {
  const entries = new Map<string, FileEntry>();
  let json: unknown;
  try {
    json = JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return entries;
  }
  if (!isObject(json) || json.format !== FORMAT || json.parser !== parser || json.root !== root) return entries;
  if (!isObject(json.files)) return entries;
  for (const [path, entry] of Object.entries(json.files)) {
    if (isEntry(entry)) entries.set(path, entry);
  }
  return entries;
}

/** Writes atomically; a failed write leaves the previous cache in place and is ignored. */
export async function saveCache(file: string, root: string, parser: string, files: Map<string, FileEntry>): Promise<void> {
  const dir = dirname(file);
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await sweep(dir);
    await writeFile(tmp, JSON.stringify({ format: FORMAT, parser, root, files: Object.fromEntries(files) }), { mode: 0o600 });
    await rename(tmp, file);
  } catch {
    await unlink(tmp).catch(() => {});
  }
}

/** Removes temp files left behind by a process that died mid-write, and caches of roots no longer used. */
async function sweep(dir: string): Promise<void> {
  const names = await readdir(dir).catch(() => []);
  for (const name of names) {
    const age = name.endsWith('.tmp') ? STALE_TMP_MS : /^transcripts-.*\.json$/.test(name) ? STALE_CACHE_MS : null;
    if (age === null) continue;
    const path = join(dir, name);
    const info = await stat(path).catch(() => null);
    if (info && info.mtimeMs < Date.now() - age) await unlink(path).catch(() => {});
  }
}

function isEntry(value: unknown): value is FileEntry {
  if (!isObject(value) || !finite(value.size) || !finite(value.mtimeMs) || !isObject(value.events)) return false;
  const { responses, toolCalls, slashCommands } = value.events;
  return (
    Array.isArray(responses) &&
    Array.isArray(toolCalls) &&
    Array.isArray(slashCommands) &&
    responses.every(isResponse) &&
    toolCalls.every(isToolCall) &&
    slashCommands.every(isNamed)
  );
}

function isEvent(value: unknown): value is Json {
  return isObject(value) && typeof value.key === 'string' && finite(value.timestamp);
}

function isNamed(value: unknown): value is Json {
  return isEvent(value) && typeof value.name === 'string';
}

function isToolCall(value: unknown): boolean {
  return isNamed(value) && optionalString(value.skill) && optionalString(value.subagentType);
}

const USAGE = ['input', 'output', 'cacheRead', 'cacheWrite5m', 'cacheWrite1h'] as const;

function isResponse(value: unknown): boolean {
  if (!isEvent(value)) return false;
  const { model, project, sessionId, sidechain, agentId, skill, usage } = value;
  return (
    typeof model === 'string' &&
    typeof project === 'string' &&
    typeof sessionId === 'string' &&
    typeof sidechain === 'boolean' &&
    optionalString(agentId) &&
    optionalString(skill) &&
    isObject(usage) &&
    USAGE.every((k) => finite(usage[k]))
  );
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const optionalString = (value: unknown) => value === undefined || typeof value === 'string';
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
