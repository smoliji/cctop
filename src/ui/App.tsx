import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApp, useInput, useWindowSize } from 'ink';
import type { ClaudeState, Overview, Period, TranscriptData } from '../types.js';
import type { Progress } from '../sources/transcripts.js';
import { DEFAULT_VIEW, Screen, SKILLS_CHROME, TABS, type View } from './Screen.js';
import { SKILL_SORTS, skillRows } from './Skills.js';

export type Build = (data: TranscriptData, state: ClaudeState, period: Period, now: number) => Overview;

export type Scan = (hooks: {
  onProgress: (progress: Progress) => void;
  onPartial: (data: TranscriptData) => void;
}) => Promise<TranscriptData>;

interface Props {
  /** `~/.claude.json` as read before the first frame, so limits show at once. */
  initial: ClaudeState;
  readState: () => Promise<ClaudeState>;
  scan: Scan;
  build: Build;
  /** Has Claude Code fetch fresh plan usage into `.claude.json`; omitted, the limits are only read. */
  fetchUsage?: () => Promise<void>;
  interval: number;
  version: string;
  now?: () => number;
}

type Source = 'state' | 'usage' | 'scan' | 'build';

const PERIODS: Period[] = ['today', '7d', '30d'];
/** Claude Code answers `/usage` from its own cache for about a minute after a fetch. */
const MIN_USAGE_MS = 61_000;
/** Wait after a fetch that left the cache as it was, so a longer cache on Claude Code's side never spins. */
const MIN_RETRY_MS = 15_000;

export function App({ initial, readState, scan, build, fetchUsage, interval, version, now = Date.now }: Props) {
  const { exit } = useApp();
  const { columns, rows } = useWindowSize();
  const stateRef = useRef(initial);
  const dataRef = useRef<TranscriptData | null>(null);
  const busy = useRef(false);
  const fetching = useRef(false);
  const [state, setState] = useState(initial);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Kept per source, so a success of one step never hides the failure of another.
  const [errors, setErrors] = useState<Partial<Record<Source, string>>>({});
  const [view, setView] = useState<View>(DEFAULT_VIEW);

  const periodRef = useRef(view.period);
  periodRef.current = view.period;

  const report = useCallback((source: Source, error?: string) => {
    setErrors((e) => (e[source] === error ? e : { ...e, [source]: error }));
  }, []);

  const rebuild = useCallback(
    (period = periodRef.current) => {
      if (!dataRef.current) return;
      try {
        setOverview(build(dataRef.current, stateRef.current, period, now()));
        report('build');
      } catch (err) {
        report('build', `build failed: ${message(err)}`);
      }
    },
    [build, now, report],
  );

  const reread = useCallback(async () => {
    try {
      const s = await readState();
      stateRef.current = s;
      setState(s);
      report('state');
      rebuild();
    } catch (err) {
      report('state', `reading ~/.claude.json failed: ${message(err)}`);
    }
  }, [readState, rebuild, report]);

  const usagePeriod = Math.max(interval * 1000, MIN_USAGE_MS);
  const usageAge = useCallback(() => now() - (stateRef.current.usage?.fetchedAt ?? 0), [now]);

  /** Fetches the plan usage when it is older than a period; resolves to whether it ran the command and failed. */
  const updateUsage = useCallback(async () => {
    await reread();
    // Another Claude Code may have fetched it in the meantime.
    if (!fetchUsage || fetching.current || usageAge() < usagePeriod) return false;
    fetching.current = true;
    try {
      await fetchUsage();
      report('usage');
      await reread();
      return false;
    } catch (err) {
      report('usage', message(err));
      return true;
    } finally {
      fetching.current = false;
    }
  }, [fetchUsage, usageAge, usagePeriod, reread, report]);

  const rescan = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setRefreshing(true);
    try {
      const data = await scan({
        onProgress: setProgress,
        onPartial: (partial) => {
          dataRef.current = partial;
          rebuild();
        },
      });
      dataRef.current = data;
      setRefreshedAt(now());
      rebuild();
      report('scan');
    } catch (err) {
      report('scan', `refresh failed: ${message(err)}`);
    } finally {
      busy.current = false;
      setRefreshing(false);
      setProgress(null);
    }
  }, [scan, now, rebuild, report]);

  const refresh = useCallback(() => {
    void updateUsage();
    void rescan();
  }, [updateUsage, rescan]);

  // `initial` was just read, so the first round only needs the transcripts.
  useEffect(() => void rescan(), []);

  // Usage runs on its own clock, due a period after the last fetch: on the refresh tick
  // it would come a few seconds short of a period, and Claude Code would answer from its cache.
  useEffect(() => {
    if (!fetchUsage) return;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const loop = async () => {
      const failed = await updateUsage();
      if (stopped) return;
      timer = setTimeout(loop, failed ? usagePeriod : Math.max(MIN_RETRY_MS, usagePeriod - usageAge()));
    };
    void loop();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [fetchUsage, updateUsage, usageAge, usagePeriod]);

  useEffect(() => {
    const timer = setInterval(refresh, interval * 1000);
    return () => clearInterval(timer);
  }, [refresh, interval]);

  // The list can shrink under the stored offset, when the period changes or the lifetime counts give way to the period's.
  const last = Math.max(0, skillRows(overview, state).length - Math.max(1, rows - SKILLS_CHROME));
  const offset = Math.min(view.skillOffset, last);

  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) return exit();
    if (input === 'r') return refresh();
    if (input === 'p') {
      const period = next(PERIODS, view.period);
      setView({ ...view, period, skillOffset: 0 });
      return rebuild(period);
    }
    const tab = Number(input);
    if (TABS[tab - 1]) return setView({ ...view, tab: TABS[tab - 1]! });
    if (key.tab) return setView({ ...view, tab: next(TABS, view.tab) });
    if (view.tab !== 'skills') return;
    if (input === 's') return setView({ ...view, skillSort: next(SKILL_SORTS, view.skillSort), skillOffset: 0 });
    const step = key.upArrow || input === 'k' ? -1 : key.downArrow || input === 'j' ? 1 : key.pageUp ? -10 : key.pageDown ? 10 : 0;
    if (step) setView({ ...view, skillOffset: Math.min(last, Math.max(0, offset + step)) });
  });

  return (
    <Screen
      overview={overview}
      state={state}
      now={now()}
      status={{ version, interval, refreshedAt, refreshing, progress, error: errors.state ?? errors.usage ?? errors.scan ?? errors.build }}
      columns={columns}
      rows={rows}
      view={{ ...view, skillOffset: offset }}
    />
  );
}

const next = <T,>(list: T[], current: T): T => list[(list.indexOf(current) + 1) % list.length]!;

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
