<div align="center">

# cctop

**htop for your Claude Code usage.**

Plan limits, tokens and cost per day, top skills, tools and MCP servers, and the
model mix, in one terminal screen. Built from the files Claude Code already
keeps on your disk, so watching it costs nothing.

</div>

```
 cctop 0.1.0                                                                refresh 60s · 15:18:00

 LIMITS                                                                                cache 7m old
   5h     ██████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  20%    reset 2h 51m
   Week   ███████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  16%    reset 3d 16h
   Fable  ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   3%    reset 3d 16h

 TOKENS · LAST 7 DAYS                                            avg 83M  peak 148M  7d 582M  $293*
   We 21  ██████████████████████████████████████████                                      83M  $ 46
   Tu 20  ████████████████████████████████████████████                                    87M  $ 52
   Mo 19  ████████████████████████████████████████████████████████████                   118M  $ 60
   Su 18  ████████████████████                                                            39M  $ 22
   Sa 17  ██████████████████████████████████████████████                                  92M  $ 50
   Fr 16  ███████████████████████████████████████████████████████████████████████████    148M  $ 48
   Th 15  ████████                                                                        15M  $ 14
   ■ opus-5-5   ■ haiku-4-5   ■ fable-5-1   ■ sonnet-5-5

 TOP SKILLS · 7d                  TOOLS · 7d                       MODELS · 7d
   review-pr                    7   Bash                      4086   opus-5-5            92% ██████
   writing-plans                7   mcp Slack                 1407   haiku-4-5            7% ░░░░░░
   superpowers:brainstorming    6   ToolSearch                 212   fable-5-1            1% ░░░░░░
   distill                      6   Read                       193   sonnet-5-5           0% ░░░░░░
   google-sheets                6   Edit                       166
   ops:triage-alerts            3   Agent                      164
   release-notes                3   mcp linear                 139
   commit                       3   Write                      117

 p period  r refresh  q quit                                            * API list-price equivalent
```

- **Limits at a glance.** The 5-hour and weekly plan meters with time to reset, the same numbers `/usage` shows.
- **Where the tokens went.** Tokens per day for the last week split by model, with an API-equivalent cost next to each day.
- **What you actually use.** Top skills, tools and MCP servers, and the model mix for the period.
- **Zero tokens, zero network.** cctop only reads local files. It never runs `claude`, never calls an API and never shows prompt text.

## Quick start

```sh
git clone https://github.com/smoliji/cctop && cd cctop
pnpm install && pnpm dev
```

The first scan reads every transcript under `~/.claude/projects`, which can take
a few seconds on a busy machine. After that it refreshes every 60 seconds.

## Keys

| Key            | Action                              |
| -------------- | ----------------------------------- |
| `p`            | switch period: today / 7d / 30d     |
| `r`            | refresh now                         |
| `q` / `Ctrl-C` | quit                                |

## Flags

| Flag              | Effect                                                                        |
| ----------------- | ----------------------------------------------------------------------------- |
| `--interval <s>`  | auto refresh period in seconds (default 60)                                   |
| `--dir <path>`    | Claude config dir (default `$CLAUDE_CONFIG_DIR` or `~/.claude`), see below    |
| `--print`         | render one frame to stdout and exit (sized by `COLUMNS` / `LINES` when piped) |
| `--json`          | print the computed overview as JSON and exit                                  |
| `-h`, `--help`    | show help                                                                     |
| `-v`, `--version` | show the version                                                              |

Transcripts are read from `<dir>/projects`. Plan usage comes from
`<dir>/.claude.json` when that file exists (Claude Code puts it there when
`CLAUDE_CONFIG_DIR` is set) and from `~/.claude.json` otherwise.

## How it works

cctop reads two things, both written by Claude Code itself:

- **Transcripts** in `~/.claude/projects/**/*.jsonl`, subagent transcripts
  included. From assistant records it takes the model, timestamp and token
  usage; from `tool_use` blocks the tool name, the skill name and the subagent
  type; from user records only the name of a typed slash command. One API
  response is spread over several lines (and sometimes several files), so cctop
  counts each response once by its message and request id, taking the final
  line of a streamed response. Message text is never read into the stats or
  rendered.
- **`~/.claude.json`** (or `<dir>/.claude.json`, see Flags), from which it
  reads only the cached plan usage (`cachedUsageUtilization`) and skill usage
  counts. Nothing else in that file is touched.

A few things to keep in mind:

- **Costs are API list-price equivalents.** They show what the same tokens would
  cost on the pay-as-you-go API, not what a Pro or Max subscription pays,
  hence the `*` next to the total. Prices come from LiteLLM's price list and
  are baked into `src/pricing.json`; `pnpm prices` regenerates it. A day or
  model that includes a model missing from that list shows no cost rather than
  a partial one.
- **Plan limits are only as fresh as Claude Code's cache.** Claude Code refreshes
  them while a session is running; cctop shows how old the numbers are and
  never fetches them itself. Once a window's reset time has passed, its meter
  shows empty with `window reset` until Claude Code fetches fresh numbers.
- **History goes back about 30 days.** Claude Code cleans up older transcripts,
  so there is nothing further back to count.

cctop is a personal project and is not affiliated with or endorsed by Anthropic.

## Install

Published to GitHub Packages as `@smoliji/cctop`. Point the scope at the registry,
authenticate with a GitHub token (a classic PAT with `read:packages` does the
job), then install it globally:

```sh
echo "@smoliji:registry=https://npm.pkg.github.com" >> ~/.npmrc
echo "//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN" >> ~/.npmrc

npm install -g @smoliji/cctop   # puts `cctop` on your PATH
```

From source: `pnpm install && pnpm build && pnpm link --global`.

---

<div align="center"><sub>

Requires Node ≥ 22 · [Changelog](CHANGELOG.md)

</sub></div>
