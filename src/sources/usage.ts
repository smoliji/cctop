import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';

// No session file, MCP servers or project settings: the command only needs the login.
const ARGS = ['-p', '/usage', '--no-session-persistence', '--strict-mcp-config', '--setting-sources', 'user', '--output-format', 'json'];
const TIMEOUT_MS = 30_000;

export class UsageError extends Error {}

/**
 * Has Claude Code fetch the plan usage into `.claude.json`, which it otherwise
 * does only when someone types `/usage`. Print mode answers the command locally,
 * without a model turn; a reply that reports a turn or a cost throws, so a
 * future Claude Code that sends `/usage` to the model is caught at the first call.
 */
export function fetchUsage(configDir?: string): Promise<void> {
  const env = configDir ? { ...process.env, CLAUDE_CONFIG_DIR: configDir } : process.env;
  return new Promise((resolve, reject) => {
    execFile('claude', ARGS, { cwd: tmpdir(), env, timeout: TIMEOUT_MS }, (err, stdout) => {
      if (err) return reject(new UsageError(`claude -p /usage failed: ${err.message.split('\n')[0]}`));
      try {
        const reply = JSON.parse(stdout) as { num_turns?: number; total_cost_usd?: number; is_error?: boolean };
        if (reply.num_turns !== 0 || reply.total_cost_usd !== 0) throw new UsageError('claude -p /usage used a model turn');
        if (reply.is_error) throw new UsageError('claude -p /usage returned an error');
        resolve();
      } catch (e) {
        reject(e instanceof UsageError ? e : new UsageError('claude -p /usage printed no JSON'));
      }
    });
  });
}
