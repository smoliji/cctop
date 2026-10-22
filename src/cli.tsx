#!/usr/bin/env node
import React from 'react';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { render, renderToString } from 'ink';
import { buildOverview } from './overview.js';
import { readClaudeState } from './sources/claudeJson.js';
import { TranscriptStore } from './sources/transcripts.js';
import { App, type Snapshot } from './ui/App.js';
import { Screen } from './ui/Screen.js';

const HELP = `cctop — a htop-like dashboard for your local Claude Code usage

Usage:
  cctop [options]

Options:
  --interval <s>  seconds between refreshes (default 60)
  --dir <path>    Claude config dir (default $CLAUDE_CONFIG_DIR or ~/.claude)
  --print         render one frame to stdout and exit (COLUMNS, LINES set the size when piped)
  --json          print the overview as JSON and exit
  -h, --help      show this help
  -v, --version   show the version

Keys:
  p  cycle period (today, 7d, 30d)
  r  refresh now
  q  quit

cctop only reads local files: transcripts in <dir>/projects and the cached
plan usage in <dir>/.claude.json, or ~/.claude.json when that does not exist.
It never calls the API.
`;

function fail(msg: string): never {
  process.stderr.write(`cctop: ${msg}\n`);
  process.exit(1);
}

function version(): string {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  return String(pkg.version);
}

function size(env: string | undefined, fallback: number): number {
  const n = Number(env);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

// Claude Code keeps .claude.json in the home dir unless CLAUDE_CONFIG_DIR moves it,
// so `--dir ~/.claude` must still find ~/.claude.json.
function claudeJson(custom: string | undefined): string {
  const moved = custom && join(custom, '.claude.json');
  return moved && existsSync(moved) ? moved : join(homedir(), '.claude.json');
}

function paths(dir: string | undefined) {
  const custom = dir ?? process.env.CLAUDE_CONFIG_DIR;
  const root = custom ?? join(homedir(), '.claude');
  return {
    transcripts: join(root, 'projects'),
    claudeJson: claudeJson(custom),
  };
}

function parse() {
  try {
    return parseArgs({
      options: {
        interval: { type: 'string', default: '60' },
        dir: { type: 'string' },
        print: { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
        version: { type: 'boolean', short: 'v', default: false },
      },
    }).values;
  } catch (err) {
    fail((err as Error).message);
  }
}

async function main() {
  const args = parse();
  if (args.help) return void process.stdout.write(HELP);
  if (args.version) return void process.stdout.write(`${version()}\n`);

  const interval = Number(args.interval);
  if (!Number.isFinite(interval) || interval < 1) fail(`--interval must be a number of seconds ≥ 1`);

  const { transcripts, claudeJson } = paths(args.dir);
  const store = new TranscriptStore(transcripts);
  const load = async (): Promise<Snapshot> => {
    const [data, state] = await Promise.all([store.refresh(), readClaudeState(claudeJson)]);
    return { data, state };
  };

  const tty = process.stdout.isTTY;
  if (args.json || args.print || !tty) {
    const { data, state } = await load();
    const now = Date.now();
    const overview = buildOverview(data, state, '7d', now);
    if (args.json) return void process.stdout.write(`${JSON.stringify(overview, null, 2)}\n`);
    const columns = tty ? process.stdout.columns : size(process.env.COLUMNS, 100);
    const rows = tty ? process.stdout.rows : size(process.env.LINES, 40);
    const status = { version: version(), interval, refreshedAt: now, refreshing: false };
    const frame = renderToString(<Screen overview={overview} status={status} columns={columns} rows={rows} />, {
      columns,
    });
    return void process.stdout.write(`${frame}\n`);
  }

  // The alternate screen gives Ink a clean full-height canvas, so redraws and
  // resizes never cascade copies of the frame into the scrollback.
  const { waitUntilExit, unmount } = render(
    <App load={load} build={buildOverview} interval={interval} version={version()} />,
    { exitOnCtrlC: false, alternateScreen: true },
  );
  process.on('SIGTERM', () => unmount());
  process.on('SIGHUP', () => unmount());
  await waitUntilExit();
  process.exit(0);
}

main().catch((err) => fail((err as Error).message));
