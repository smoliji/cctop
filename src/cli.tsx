#!/usr/bin/env node
import React from 'react';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { render, renderToString } from 'ink';
import { buildOverview, historyStart, horizon } from './overview.js';
import { cachePath } from './sources/cache.js';
import { readClaudeState } from './sources/claudeJson.js';
import { fetchUsage } from './sources/usage.js';
import { TranscriptStore, type ScanOptions } from './sources/transcripts.js';
import { App } from './ui/App.js';
import { DEFAULT_VIEW, Screen, TABS, type Tab } from './ui/Screen.js';

const HELP = `cctop — a htop-like dashboard for your local Claude Code usage

Usage:
  cctop [options]

Options:
  --interval <s>  seconds between refreshes (default 60)
  --dir <path>    Claude config dir (default $CLAUDE_CONFIG_DIR or ~/.claude)
  --print         render one frame to stdout and exit (COLUMNS, LINES set the size when piped)
  --tab <name>    tab for --print: overview or skills (default overview)
  --json          print the overview as JSON and exit
  --no-cache      do not read or write the transcript cache
  --no-usage      do not run \`claude -p /usage\` to refresh the plan limits
  -h, --help      show this help
  -v, --version   show the version

Keys:
  1, 2, tab  switch between Overview and Skills
  s          sort skills (uses, tokens, recent)
  ↑↓         scroll skills
  p          cycle period (today, 7d, 30d)
  r          refresh now
  q          quit

cctop reads local files: transcripts in <dir>/projects and the cached plan
usage in <dir>/.claude.json, or ~/.claude.json when that does not exist. Claude
Code updates that cache only on /usage, so whenever it is older than the
interval (at least a minute) cctop runs \`claude -p /usage\`, which Claude Code
answers without a model turn and so without tokens. cctop itself never calls the API.
To start fast it keeps parsed token counts (no message text) in ~/.cache/cctop.
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
        tab: { type: 'string', default: 'overview' },
        // A plain flag: parseArgs only negates `--cache` from Node 22.4, and engines allow 22.0.
        'no-cache': { type: 'boolean', default: false },
        'no-usage': { type: 'boolean', default: false },
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

  const tab = args.tab as Tab;
  if (!TABS.includes(tab)) fail(`--tab must be one of ${TABS.join(', ')}`);

  const { transcripts, claudeJson } = paths(args.dir);
  const store = new TranscriptStore(transcripts, args['no-cache'] ? {} : { cache: cachePath(transcripts) });
  const readState = () => readClaudeState(claudeJson);
  const scan = (hooks: Pick<ScanOptions, 'onProgress' | 'onPartial'> = {}) => {
    const now = Date.now();
    return store.refresh({ since: horizon(now), partialAt: historyStart(now), ...hooks });
  };

  const tty = process.stdout.isTTY;
  if (args.json || args.print || !tty) {
    const [data, state] = await Promise.all([scan(), readState()]);
    const now = Date.now();
    const overview = buildOverview(data, state, '7d', now);
    if (args.json) {
      process.stdout.write(`${JSON.stringify(overview, null, 2)}\n`);
    } else {
      const columns = tty ? process.stdout.columns : size(process.env.COLUMNS, 100);
      // On a terminal the shell prompt takes the row after the frame.
      const rows = tty ? process.stdout.rows - 1 : size(process.env.LINES, 40);
      const status = { version: version(), interval, refreshedAt: now, refreshing: false, progress: null };
      const frame = renderToString(
        <Screen
          overview={overview}
          state={state}
          now={now}
          status={status}
          columns={columns}
          rows={rows}
          view={{ ...DEFAULT_VIEW, tab }}
        />,
        { columns },
      );
      process.stdout.write(`${frame}\n`);
    }
    return store.flush();
  }

  const initial = await readState();

  // The alternate screen gives Ink a clean full-height canvas, so redraws and
  // resizes never cascade copies of the frame into the scrollback. Ink keeps the
  // cursor where the shell left it, so home it or the frame starts mid-screen.
  process.stdout.write('\x1b[?1049h\x1b[H');
  const { waitUntilExit, unmount } = render(
    <App
      initial={initial}
      readState={readState}
      scan={scan}
      build={buildOverview}
      fetchUsage={args['no-usage'] ? undefined : () => fetchUsage(args.dir ?? process.env.CLAUDE_CONFIG_DIR)}
      interval={interval}
      version={version()}
    />,
    { exitOnCtrlC: false, alternateScreen: true },
  );
  process.on('SIGTERM', () => unmount());
  process.on('SIGHUP', () => unmount());
  await waitUntilExit();
  // Keep what this session parsed, even mid-scan, or the next start reads those transcripts again.
  await store.close();
  process.exit(0);
}

main().catch((err) => fail((err as Error).message));
