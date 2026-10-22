# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Overview screen: plan limits (5h, weekly and per-model weekly) with time to
  reset, as last cached by Claude Code in `~/.claude.json`, plus how old that
  cache is.
- Tokens per day for the last 7 days with average, peak and weekly total, and an
  API list-price cost estimate per day.
- Top skills (Skill tool calls and typed slash commands), top tools with MCP
  calls grouped by server, and the model mix by tokens.
- Period switch (`p`: today / 7d / 30d), manual refresh (`r`) and auto refresh
  every `--interval` seconds.
- `--print` renders one frame and exits, `--json` dumps the computed overview,
  `--dir` points at a different Claude config directory.
- Reads only local files: no network calls, no model tokens, no prompt text.
