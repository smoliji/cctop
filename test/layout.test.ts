import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeLayout,
  INDENT,
  MIN_PANEL,
  MIN_PANEL_ROWS,
  meterChrome,
  PANEL_GAP,
  PANELS,
  TOTALS_ROWS,
  type Layout,
} from '../src/layout.js';

const meters = { lines: 3, labelWidth: 5 };
const SIZES = [
  [60, 15],
  [80, 24],
  [80, 30],
  [100, 30],
  [120, 34],
  [200, 50],
  [300, 80],
] as const;

/** Rows the frame takes: the same sum Screen renders. */
const height = (l: Layout, lines: number) =>
  9 +
  (l.wide ? Math.max(lines, TOTALS_ROWS) : lines) +
  l.days +
  (l.panels.length ? 2 + l.panelRows : 0) +
  (l.strip ? 2 : 0);

test('too small below 60 columns or 15 rows', () => {
  assert.equal(computeLayout(59, 40, meters).tooSmall, true);
  assert.equal(computeLayout(100, 14, meters).tooSmall, true);
  assert.equal(computeLayout(60, 15, meters).tooSmall, false);
});

test('the sections fill the terminal height', () => {
  for (const lines of [1, 3, 8]) {
    for (const [columns, rows] of SIZES) {
      const l = computeLayout(columns, rows, { lines, labelWidth: 5 });
      const at = `${columns}×${rows}, ${lines} meters`;
      // Eight meters leave no row for even one day on the smallest terminal; see the next test.
      if (columns === 60 && lines === 8) continue;
      // Panels take every row left; without them the spare rows are too few for panels.
      if (l.panels.length) assert.equal(height(l, lines), rows, at);
      else assert.ok(rows - height(l, lines) >= 0 && rows - height(l, lines) < 2 + MIN_PANEL_ROWS, at);
    }
  }
});

test('history keeps one day and drops the panels when nothing fits', () => {
  const l = computeLayout(100, 15, { lines: 8, labelWidth: 5 });
  assert.equal(l.days, 1);
  assert.deepEqual(l.panels, []);
  assert.equal(l.panelRows, 0);
});

test('history takes rows first, up to 7 days', () => {
  assert.equal(computeLayout(80, 15, meters).days, 3);
  assert.equal(computeLayout(80, 20, meters).days, 7);
  assert.equal(computeLayout(80, 80, meters).days, 7);
});

test('panels need at least 3 item rows, else they hide', () => {
  const tight = computeLayout(80, 23, meters);
  assert.deepEqual(tight.panels, []);
  assert.equal(tight.panelRows, 0);
  const fits = computeLayout(80, 24, meters);
  assert.equal(fits.panelRows, 3);
  assert.deepEqual(fits.panels, ['skills', 'tools']);
});

test('panel rows take every row left', () => {
  assert.equal(computeLayout(100, 80, meters).panelRows, 80 - 9 - 3 - 7 - 2);
});

test('the narrow totals strip waits for the panels minimum', () => {
  const small = computeLayout(80, 24, meters);
  assert.equal(small.strip, false);
  assert.equal(small.panelRows, 3);
  const tall = computeLayout(80, 30, meters);
  assert.equal(tall.strip, true);
  assert.equal(tall.panelRows, 7);
  for (const [columns, rows] of SIZES) {
    if (columns >= 100) assert.equal(computeLayout(columns, rows, meters).strip, false);
  }
});

test('limits sit beside the totals from 100 columns', () => {
  const narrow = computeLayout(99, 30, meters);
  assert.equal(narrow.wide, false);
  assert.equal(narrow.head, narrow.width);
  const wide = computeLayout(100, 30, meters);
  assert.equal(wide.wide, true);
  assert.equal(wide.head, 98 - 3 - 38);
  // One meter still leaves room for the three rows of totals.
  const one = computeLayout(120, 34, { lines: 1, labelWidth: 5 });
  const three = computeLayout(120, 34, meters);
  assert.equal(one.days + one.panelRows, three.days + three.panelRows);
});

test('panel count follows the width', () => {
  const counts = [
    [60, 1],
    [66, 1],
    [67, 2],
    [99, 2],
    [100, 3],
    [132, 3],
    [133, 4],
    [165, 4],
    [166, 5],
    [300, 5],
  ] as const;
  for (const [columns, count] of counts) {
    assert.deepEqual(computeLayout(columns, 60, meters).panels, PANELS.slice(0, count), `${columns} columns`);
  }
});

test('panels fill the width', () => {
  for (const columns of [60, 66, 67, 80, 99, 100, 120, 132, 133, 165, 166, 200, 300]) {
    const l = computeLayout(columns, 60, meters);
    const total = l.panelWidths.reduce((a, b) => a + b, 0) + PANEL_GAP * (l.panelWidths.length - 1);
    assert.equal(total, l.width, `${columns} columns`);
    if (l.panelWidths.length > 1) assert.ok(Math.min(...l.panelWidths) >= MIN_PANEL, `${columns}: ${l.panelWidths}`);
    assert.ok(Math.max(...l.panelWidths) - Math.min(...l.panelWidths) <= 1);
  }
  assert.deepEqual(computeLayout(200, 50, meters).panelWidths, [39, 39, 39, 39, 38]);
});

test('bars stretch with the terminal, uncapped', () => {
  const narrow = computeLayout(80, 30, meters);
  const wide = computeLayout(300, 30, meters);
  assert.equal(wide.dayBar - narrow.dayBar, 300 - 80);
  for (const columns of [80, 100, 200, 300]) {
    const l = computeLayout(columns, 30, meters);
    assert.equal(l.meterBar, l.head - INDENT - meterChrome(meters.labelWidth));
  }
});
