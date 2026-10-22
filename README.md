<div align="center">

# cctop

**htop for your Claude Code usage.**

Plan limits, tokens and cost per day, top skills, tools and MCP servers, and the
model mix, in one terminal screen. Built from the files Claude Code already
keeps on your disk, so watching it costs nothing.

</div>

```
 cctop 0.1.0   1 Overview   2 Skills                                         refresh 60s · 11:05:16

 LIMITS                                                                                cache 8m old
   5h     ▆▆▆▆────────────────────────────────────────────   9%    reset 2h 54m
   Week   ▆▆▆▆▆▆▆▆────────────────────────────────────────  17%    reset 2d 20h
   Fable  ▆───────────────────────────────────────────────   3%    reset 2d 20h

 TOKENS · LAST 7 DAYS                                            avg 87M  peak 148M  7d 610M  $302*
   Th 22  ▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆                                                            40M  $ 21
   We 21  ▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆                                    86M  $ 48
   Tu 20  ▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆                                    87M  $ 52
   Mo 19  ▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆                   118M  $ 60
   Su 18  ▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆                                                            39M  $ 22
   Sa 17  ▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆                                  92M  $ 50
   Fr 16  ▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆    148M  $ 48
   ■ opus-5-5   ■ haiku-4-5   ■ fable-5-1   ■ sonnet-5-5

 TOP SKILLS · 7d                  TOOLS · 7d                       MODELS · 7d
   workflow-authoring           8   Bash                      4273   opus-5-5            93% ▆▆▆▆▆▆
   standup-notes                7   mcp Slack                 1409   haiku-4-5            6% ──────
   writing-plans                6   ToolSearch                 220   fable-5-1            1% ──────
   distill                      6   mcp linear                 217   sonnet-5-5           0% ──────
   google-sheets                6   Read                       193
   ops:triage-alerts            3   SubagentHandback           169
   grill-me                     3   Agent                      166
   team-report                  3   Write                      119

 tab switch  p period  r refresh  q quit                                * API list-price equivalent
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

| Key                 | Action                                  |
| ------------------- | --------------------------------------- |
| `1` / `2` / `Tab`   | switch between Overview and Skills      |
| `s`                 | sort skills by uses, tokens or recency  |
| `↑` `↓` `PgUp` `PgDn` | scroll the skills list                |
| `p`                 | switch period: today / 7d / 30d         |
| `r`                 | refresh now                             |
| `q` / `Ctrl-C`      | quit                                    |

### Skills tab

Every skill used in the period gets a row: how often it was used, the tokens
and cost of the turns spent inside it, when it last ran, and where the uses
came from (`MODEL` loaded it with the Skill tool, `YOU` typed it as a slash
command). `ALL TIME` is Claude Code's own lifetime counter, which outlives the
transcripts.

```
 cctop 0.1.0   1 Overview   2 Skills                                         refresh 60s · 11:05:37

 SKILLS · 7d                                                             26 skills · sorted by uses
                                     USES   TOKENS      LAST   COST*  MODEL   YOU   TURNS  ALL TIME
   workflow-authoring                   8     118M   <1m ago     $66      8     ·    1414        12
   standup-notes                        7     5.4M    1h ago      $7      1     6      43        10
   writing-plans                        6     5.9M   19h ago      $3      6     ·      66         7
   distill                              6      13M   20h ago      $9      6     ·     144        15
   google-sheets                        6     6.5M   22m ago      $4      6     ·      65         7
   ops:triage-alerts                    3        ·    6d ago       ·      3     ·       ·        23
   grill-me                             3       7M    9m ago      $3      3     ·      62         3
   team-report                          3     3.1M    1d ago      $2      2     1      38         3
   monthly-report                       3     1.5M    4d ago      $1      3     ·      21         3
   superpowers:writing-skills           2     8.2M    2d ago      $5      2     ·      93        35
   tickets:view                         1     741k   19h ago     <$1      1     ·       4        20
   artifact-design                      1     229k    3d ago     <$1      1     ·       3        16
   review-pr                            1     2.4M    1h ago      $1      1     ·      32         5
   config:sync                          1     255k    2d ago     <$1      ·     1       4         5
   gitlab                               1     380k    2d ago     <$1      1     ·       6        95
   ops:watch-alerts                     1     520k    6d ago     <$1      ·     1      13        96
   ↓ 10 more

 tab switch  s sort  ↑↓ scroll  p period  r refresh  q quit             * API list-price equivalent
```

## Flags

| Flag              | Effect                                                                        |
| ----------------- | ----------------------------------------------------------------------------- |
| `--interval <s>`  | auto refresh period in seconds (default 60)                                   |
| `--dir <path>`    | Claude config dir (default `$CLAUDE_CONFIG_DIR` or `~/.claude`), see below    |
| `--print`         | render one frame to stdout and exit (sized by `COLUMNS` / `LINES` when piped) |
| `--tab <name>`    | tab for `--print`: `overview` (default) or `skills`                           |
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
