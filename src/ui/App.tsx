import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApp, useInput, useWindowSize } from 'ink';
import type { ClaudeState, Overview, Period, TranscriptData } from '../types.js';
import { DEFAULT_VIEW, Screen, SKILLS_CHROME, TABS, type View } from './Screen.js';
import { SKILL_SORTS } from './Skills.js';

export interface Snapshot {
  data: TranscriptData;
  state: ClaudeState;
}

export type Build = (data: TranscriptData, state: ClaudeState, period: Period, now: number) => Overview;

interface Props {
  load: () => Promise<Snapshot>;
  build: Build;
  interval: number;
  version: string;
  now?: () => number;
}

const PERIODS: Period[] = ['today', '7d', '30d'];

export function App({ load, build, interval, version, now = Date.now }: Props) {
  const { exit } = useApp();
  const { columns, rows } = useWindowSize();
  const snapshot = useRef<Snapshot | null>(null);
  const busy = useRef(false);
  const [period, setPeriod] = useState<Period>('7d');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string>();
  const [view, setView] = useState<View>(DEFAULT_VIEW);

  const rebuild = useCallback(
    (snap: Snapshot, p: Period, at: number) => {
      try {
        setOverview(build(snap.data, snap.state, p, at));
        setError(undefined);
      } catch (err) {
        setError(`build failed: ${message(err)}`);
      }
    },
    [build],
  );

  const periodRef = useRef(period);
  periodRef.current = period;

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setRefreshing(true);
    try {
      const snap = await load();
      const at = now();
      snapshot.current = snap;
      setRefreshedAt(at);
      rebuild(snap, periodRef.current, at);
    } catch (err) {
      setError(`refresh failed: ${message(err)}`);
    } finally {
      busy.current = false;
      setRefreshing(false);
    }
  }, [load, now, rebuild]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), interval * 1000);
    return () => clearInterval(timer);
  }, [refresh, interval]);

  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) return exit();
    if (input === 'r') return void refresh();
    if (input === 'p') {
      const p = next(PERIODS, period);
      setPeriod(p);
      if (snapshot.current) rebuild(snapshot.current, p, now());
      return;
    }
    const tab = Number(input);
    if (TABS[tab - 1]) return setView({ ...view, tab: TABS[tab - 1]! });
    if (key.tab) return setView({ ...view, tab: next(TABS, view.tab) });
    if (view.tab !== 'skills') return;
    if (input === 's') return setView({ ...view, skillSort: next(SKILL_SORTS, view.skillSort), skillOffset: 0 });
    const last = Math.max(0, (overview?.skills.length ?? 0) - Math.max(1, rows - SKILLS_CHROME));
    const step = key.upArrow || input === 'k' ? -1 : key.downArrow || input === 'j' ? 1 : key.pageUp ? -10 : key.pageDown ? 10 : 0;
    if (step) setView({ ...view, skillOffset: Math.min(last, Math.max(0, view.skillOffset + step)) });
  });

  return (
    <Screen
      overview={overview}
      status={{ version, interval, refreshedAt, refreshing, error }}
      columns={columns}
      rows={rows}
      view={view}
    />
  );
}

const next = <T,>(list: T[], current: T): T => list[(list.indexOf(current) + 1) % list.length]!;

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
