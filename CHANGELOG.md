# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Overview screen: plan limits (5h, weekly and per-model weekly) with time to
  reset, as last cached by Claude Code in `~/.claude.json`, plus how old that
  cache is. A stale cache is refreshed with `claude -p /usage`, which uses no
  tokens (`--no-usage` turns it off).
- Tokens per day for the last 7 days with average, peak and weekly total, an
  API list-price cost estimate per day and a token scale under the bars.
- Top skills (Skill tool calls and typed slash commands), top tools with MCP
  calls grouped by server, and the model mix by tokens.
- Skills tab (`2`): every skill in the period with uses, tokens and cost spent
  inside it (from `attributionSkill`), last use, model vs typed invocations and
  the lifetime count; sortable with `s` and scrollable. Styled like htop: a
  green column header with the sorted column in cyan, the numbers right after
  the name and a bar of tokens per skill split by model at the end of the row
  that takes the spare width, plugin prefixes in gray and cut first, and the
  last use in cyan for today. `--json` has the per-model split as
  `tokensByModel` on each skill.
- Layout fills the whole terminal, like htop: limits beside the totals from
  100 columns (a one-row totals strip below that when there is room), up to
  five panels (skills, tools, models, projects, agent types) as the width
  allows, panels that grow with the height, and fewer days and panels on small
  terminals. Bars stretch to the full width and end in a gray track, so every
  number stays visually tied to its row. Models of one family come in shades of
  one color that keep at least 3:1 contrast on light and dark backgrounds.
- Totals for the period: tokens, cost, cache hit rate, sessions, responses and
  subagents.
- `--json` lists every skill, tool and agent type of the period, plus tokens
  per project (`projects`) and Agent calls per subagent type (`topAgents`).
- Period switch (`p`: today / 7d / 30d), manual refresh (`r`) and auto refresh
  every `--interval` seconds.
- `--print` renders one frame and exits, `--json` dumps the computed overview,
  `--dir` points at a different Claude config directory.
- Reads only local files: no network calls, no model tokens, no prompt text.
- Instant start: limits and lifetime skill counts show at once, token history
  fills in while transcripts are read, newest first, with progress in the
  header. Transcript cache in `~/.cache/cctop` (`--no-cache` to disable),
  written on quit too, so even a session closed during the first scan speeds
  up the next start. Only transcripts that can still appear in the 30-day
  period are read.
