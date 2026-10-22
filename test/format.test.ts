import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCost, formatDuration, formatTokens, splitCells } from '../src/format.js';

test('formatTokens rounds within and across unit boundaries', () => {
  assert.equal(formatTokens(0), '0');
  assert.equal(formatTokens(999), '999');
  assert.equal(formatTokens(8_400), '8.4k');
  assert.equal(formatTokens(9_950), '9.9k');
  assert.equal(formatTokens(84_000), '84k');
  assert.equal(formatTokens(999_950), '1M');
  assert.equal(formatTokens(4.9e6), '4.9M');
  assert.equal(formatTokens(999.6e6), '1B');
  assert.equal(formatTokens(1.2e9), '1.2B');
});

test('formatCost pads to width and abbreviates thousands', () => {
  assert.equal(formatCost(null, 4), '    ');
  assert.equal(formatCost(20, 4), '$ 20');
  assert.equal(formatCost(12_345), '$12.3k');
});

test('formatDuration', () => {
  assert.equal(formatDuration(59_000), '<1m');
  assert.equal(formatDuration(12 * 60_000), '12m');
  assert.equal(formatDuration((2 * 60 + 14) * 60_000), '2h 14m');
  assert.equal(formatDuration(3 * 86_400_000), '3d');
  assert.equal(formatDuration((3 * 24 + 4) * 3_600_000), '3d 4h');
});

test('splitCells always adds up to the requested length', () => {
  for (const [parts, length] of [
    [[1, 1, 1], 10],
    [[5, 3, 2], 7],
    [[0.1, 0.2, 99.7], 60],
    [[1, 0, 0], 3],
  ] as const) {
    const cells = splitCells([...parts], length);
    assert.equal(cells.reduce((a, b) => a + b, 0), length);
  }
  assert.deepEqual(splitCells([0, 0], 5), [0, 0]);
});
