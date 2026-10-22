/** Token counts of one API response, as reported in `message.usage`. */
export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
}

/** One API response, deduplicated by `message.id` + `requestId` across all files. */
export interface ApiResponse {
  key: string;
  timestamp: number;
  model: string;
  project: string;
  sessionId: string;
  sidechain: boolean;
  /** Subagent that made the call; absent in the main session. */
  agentId?: string;
  usage: TokenUsage;
}

/** One `tool_use` block, deduplicated by its id. */
export interface ToolCall {
  key: string;
  timestamp: number;
  name: string;
  /** `input.skill` of a `Skill` call. */
  skill?: string;
  /** `input.subagent_type` of an `Agent` call. */
  subagentType?: string;
}

/** A skill the user typed as a slash command (`<command-name>/x</command-name>`). */
export interface SlashCommand {
  key: string;
  timestamp: number;
  name: string;
}

/** Everything cctop extracts from one transcript file. */
export interface FileEvents {
  responses: ApiResponse[];
  toolCalls: ToolCall[];
  slashCommands: SlashCommand[];
}

/** All transcripts merged, with duplicates across files removed. */
export interface TranscriptData {
  responses: ApiResponse[];
  toolCalls: ToolCall[];
  slashCommands: SlashCommand[];
  files: number;
}

export interface LimitMeter {
  label: string;
  percent: number;
  resetsAt: number | null;
}

/** Plan usage as last fetched by Claude Code itself (`cachedUsageUtilization`). */
export interface PlanUsage {
  meters: LimitMeter[];
  fetchedAt: number;
  extraUsageEnabled: boolean;
}

/** The whitelisted part of `~/.claude.json` cctop reads. */
export interface ClaudeState {
  usage: PlanUsage | null;
  /** Lifetime skill invocation counts (`skillUsage`). */
  skillUsage: Record<string, number>;
}

export type Period = 'today' | '7d' | '30d';

export interface DayRow {
  /** Local date, `YYYY-MM-DD`. */
  date: string;
  tokensByModel: Record<string, number>;
  tokens: number;
  /** API list-price equivalent in USD; `null` when any response lacks a known price. */
  cost: number | null;
}

export interface Ranked {
  name: string;
  count: number;
  /** MCP server for `mcp__server__tool` names. */
  server?: string;
}

export interface ModelShare {
  name: string;
  tokens: number;
  share: number;
  cost: number | null;
}

/** Everything the Overview screen renders. Pure data, computed by `buildOverview`. */
export interface Overview {
  now: number;
  period: Period;
  /** The last 7 local days, newest first, today included even when empty. */
  days: DayRow[];
  week: { tokens: number; cost: number | null; avg: number; peak: number; peakDate: string | null };
  totals: {
    tokens: number;
    cost: number | null;
    cacheHit: number;
    sessions: number;
    responses: number;
    subagents: number;
  };
  topSkills: Ranked[];
  topTools: Ranked[];
  models: ModelShare[];
  usage: PlanUsage | null;
}
