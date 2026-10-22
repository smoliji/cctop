<div align="center">

# cctop

**htop for your Claude Code usage.**

Plan limits, tokens and cost per day, top skills, tools and MCP servers, and the
model mix, in one terminal screen. Built from the files Claude Code already
keeps on your disk, so watching it costs nothing.

</div>

```
 cctop 0.1.0   1 Overview   2 Skills                                         refresh 60s · 12:58:56

 LIMITS                                      cache 19m old   TOTALS · 7d
   5h     ▆▆▆▆▆▆▆────────────────────  25%     reset 1h 1m     tokens      658M    sessions      47
   Week   ▆▆▆▆▆──────────────────────  20%    reset 2d 19h     cost*       $327    responses   6.7k
   Fable  ▆──────────────────────────   3%    reset 2d 19h     cache hit    96%    subagents    333

 TOKENS · LAST 7 DAYS                                            avg 94M  peak 148M  7d 658M  $327*
   Th 22  ▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆───────────────────────────────     88M  $ 47
   We 21  ▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆───────────────────────────────     86M  $ 48
   Tu 20  ▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆───────────────────────────────     87M  $ 52
   Mo 19  ▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆───────────────    118M  $ 60
   Su 18  ▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆───────────────────────────────────────────────────────     39M  $ 22
   Sa 17  ▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆─────────────────────────────     92M  $ 50
   Fr 16  ▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆    148M  $ 48
          0           25M          50M           75M         100M          125M
   ■ opus-5-5   ■ haiku-4-5   ■ fable-5-1   ■ sonnet-5-5

 TOP SKILLS · 7d                  TOOLS · 7d                       MODELS · 7d
   workflow-authoring         8     Bash             4567            opus-5-5   93% ▆▆▆▆▆▆▆▆▆▆▆▆▆▆─
   distill                    8     mcp Slack        1409            haiku-4-5   6% ▆──────────────
   standup-notes              7     Read              242            fable-5-1   1% ───────────────
   google-sheets              6     ToolSearch        222            sonnet-5-5  0% ───────────────
   writing-plans              6     mcp linear        217
   grill-me                   3     Agent             169
   team-report                3     SubagentHandback  169
   monthly-report             3     Write             141
   ops:triage-alerts          3     StructuredOutput   72

 tab switch  p period  r refresh  q quit                                * API list-price equivalent
```

- **Limits at a glance.** The 5-hour and weekly plan meters with time to reset, the same numbers `/usage` shows.
- **Where the tokens went.** Tokens per day for the last week split by model, with an API-equivalent cost next to each day.
- **What you actually use.** Totals for the period, top skills, tools and MCP servers, the model mix, and on wider terminals tokens per project and Agent calls per subagent type.
- **Fills the terminal.** Like htop, the frame uses the whole window: limits sit beside the totals from 100 columns, up to five panels show as the width allows, and the panels grow with the height.
- **Zero tokens.** cctop reads local files and writes one cache file of token counts. To keep the limits fresh it runs `claude -p /usage`, which Claude Code answers without a model turn. cctop never calls an API itself and never shows or stores prompt text.

## Quick start

```sh
git clone https://github.com/smoliji/cctop && cd cctop
pnpm install && pnpm dev
```

The screen comes up at once with your plan limits; token history fills in as
transcripts are read. Parsed counts are cached in `~/.cache/cctop` (or
`$XDG_CACHE_HOME/cctop`), so later starts take well under a second. After that
it refreshes every 60 seconds.

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
transcripts. The `SHARE` bar shows each skill's tokens split by model, scaled
to the busiest skill. It comes last, like htop's command column, and takes
whatever width the columns leave, so the numbers stay next to the name. The
column header is a green bar with the sorted column in cyan, `LAST` is cyan for
skills used today and gray after a week, and a long plugin prefix is cut before
the skill name. Until the transcripts are read the tab lists the lifetime counts.

```
 cctop 0.1.0   1 Overview   2 Skills                                         refresh 60s · 11:05:37

 SKILLS · 7d                                              26 skills  174M tokens  27% of all  $103*
   SKILL                        USES   TOKENS      LAST   COST*  MODEL   YOU  SHARE
   workflow-authoring              8     118M   <1m ago     $66      8     ·  ▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆
   standup-notes                   7     5.4M    1h ago      $7      1     6  ▆────────────────────
   distill                         6      13M   20h ago      $9      6     ·  ▆▆───────────────────
   google-sheets                   6     6.5M   22m ago      $4      6     ·  ▆────────────────────
   writing-plans                   6     5.9M   19h ago      $3      6     ·  ▆────────────────────
   grill-me                        3       7M    9m ago      $3      3     ·  ▆────────────────────
   team-report                     3     3.1M    1d ago      $2      2     1  ▆────────────────────
   monthly-report                  3     1.5M    4d ago      $1      3     ·  ▆────────────────────
   ops:triage-alerts               3        ·    6d ago       ·      3     ·  ─────────────────────
   superpowers:writing-skills      2     8.2M    2d ago      $5      2     ·  ▆────────────────────
   review-pr                       1     2.4M    1h ago      $1      1     ·  ▆────────────────────
   tickets:view                    1     741k   19h ago     <$1      1     ·  ▆────────────────────
   ops:watch-alerts                1     520k    6d ago     <$1      ·     1  ▆────────────────────
   gitlab                          1     380k    2d ago     <$1      1     ·  ▆────────────────────
   config:sync                     1     255k    2d ago     <$1      ·     1  ▆────────────────────
   artifact-design                 1     229k    3d ago     <$1      1     ·  ▆────────────────────
   ↓ 10 more                                                               ■ opus-5-5   ■ haiku-4-5

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
| `--no-cache`      | do not read or write the transcript cache                                     |
| `--no-usage`      | do not run `claude -p /usage`; limits are only as fresh as Claude Code's cache |
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

Limits come from `~/.claude.json` alone, so they show before any transcript is
read. Transcripts are read newest first; the last 7 days fill in as soon as
their files are done, while the 30-day period shows placeholders, and lifetime
skill counts on the Skills tab, until the scan reaches the oldest files.

A few things to keep in mind:

- **Costs are API list-price equivalents.** They show what the same tokens would
  cost on the pay-as-you-go API, not what a Pro or Max subscription pays,
  hence the `*` next to the total. Prices come from LiteLLM's price list and
  are baked into `src/pricing.json`; `pnpm prices` regenerates it. A day or
  model that includes a model missing from that list shows no cost rather than
  a partial one.
- **Plan limits come from Claude Code's cache.** Claude Code writes them to
  `~/.claude.json` only when `/usage` runs, so whenever they are older than the
  interval (at least a minute, since Claude Code answers from its own cache
  before that) cctop runs `claude -p /usage --no-session-persistence` in a temp
  dir. Print mode handles `/usage` without a model turn; if a reply
  ever reports a turn or a cost, cctop shows an error instead of hiding it. The
  call takes about 2 s of CPU. Turn it off with `--no-usage`; cctop then shows
  how old the numbers are, and once a window's reset time has passed its meter
  shows empty with `window reset`.
- **Counts are cached.** The cache holds per-transcript counts keyed by path,
  size and modification time, and is rebuilt automatically when cctop's parser
  changes; `--no-cache` turns it off and deleting the directory is always safe.
- **History goes back 30 days.** The longest period is 30 days, so older
  transcripts are not read at all, and Claude Code cleans them up by default
  anyway.

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
