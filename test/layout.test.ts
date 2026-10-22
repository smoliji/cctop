import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLayout, MAX_COLUMNS } from '../src/layout.js';

const meters = { lines: 3, labelWidth: 5 };

test('too small below 60 columns or 15 rows', () => {
  assert.equal(computeLayout(59, 40, meters).tooSmall, true);
  assert.equal(computeLayout(100, 14, meters).tooSmall, true);
  assert.equal(computeLayout(60, 15, meters).tooSmall, false);
});

test('panel count follows the width', () => {
  assert.deepEqual(computeLayout(120, 40, meters).panels, ['skills', 'tools', 'models']);
  assert.deepEqual(computeLayout(100, 40, meters).panels, ['skills', 'tools', 'models']);
  assert.deepEqual(computeLayout(99, 40, meters).panels, ['skills', 'tools']);
  assert.deepEqual(computeLayout(80, 40, meters).panels, ['skills', 'tools']);
  assert.deepEqual(computeLayout(79, 40, meters).panels, ['skills']);
});

test('history takes rows first, up to 7 days', () => {
  assert.equal(computeLayout(100, 15, meters).days, 3);
  assert.equal(computeLayout(100, 19, meters).days, 7);
  assert.equal(computeLayout(100, 60, meters).days, 7);
});

test('history keeps one day even when nothing fits', () => {
  assert.equal(computeLayout(100, 15, { lines: 8, labelWidth: 5 }).days, 1);
});

test('panels need at least 3 item rows, else they hide', () => {
  const tight = computeLayout(100, 23, meters);
  assert.deepEqual(tight.panels, []);
  assert.equal(tight.panelRows, 0);
  const fits = computeLayout(100, 24, meters);
  assert.equal(fits.panelRows, 3);
  assert.equal(fits.panels.length, 3);
});

test('panel rows are capped', () => {
  assert.equal(computeLayout(100, 80, meters).panelRows, 10);
});

test('bars stretch with the width up to the frame cap', () => {
  const narrow = computeLayout(80, 30, meters);
  const capped = computeLayout(MAX_COLUMNS, 30, meters);
  assert.equal(capped.dayBar - narrow.dayBar, MAX_COLUMNS - 80);
  assert.deepEqual(computeLayout(200, 30, meters), capped);
  assert.equal(capped.meterBar, 48);
});
