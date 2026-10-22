import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApp, useInput, useWindowSize } from 'ink';
import type { ClaudeState, Overview, Period, TranscriptData } from '../types.js';
import { Screen } from './Screen.js';

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
      const next = PERIODS[(PERIODS.indexOf(period) + 1) % PERIODS.length]!;
      setPeriod(next);
      if (snapshot.current) rebuild(snapshot.current, next, now());
    }
  });

  return (
    <Screen
      overview={overview}
      status={{ version, interval, refreshedAt, refreshing, error }}
      columns={columns}
      rows={rows}
    />
  );
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
