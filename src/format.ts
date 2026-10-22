
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Compact token count: 0, 840, 8.4k, 84k, 4.9M, 118M, 1.2B. */
export function formatTokens(n: number): string {
  const units: [number, string][] = [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'k'],
  ];
  for (const [i, [size, unit]] of units.entries()) {
    if (n < size) continue;
    const value = n / size;
    // 999_950 would round to "1000k"; the next unit up reads "1M".
    if (value >= 999.5 && i > 0) return `1${units[i - 1]![1]}`;
    return `${value < 10 ? trim(value.toFixed(1)) : Math.round(value)}${unit}`;
  }
  if (n >= 999.5) return '1k';
  return String(Math.round(n));
}

const trim = (s: string) => s.replace(/\.0$/, '');

/** Whole dollars, `$` padded to `width` so a column of costs lines up: "$ 20". */
export function formatCost(usd: number | null, width = 0): string {
  if (usd === null) return ''.padStart(width);
  const amount = usd >= 10_000 ? `${trim((usd / 1000).toFixed(1))}k` : String(Math.round(usd));
  return `$${amount.padStart(Math.max(0, width - 1))}`;
}

/** "2h 14m", "3d 4h", "12m", "<1m". */
export function formatDuration(ms: number): string {
  if (ms < MINUTE) return '<1m';
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  const minutes = Math.floor((ms % HOUR) / MINUTE);
  if (days > 0) return hours ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** "We 21" for a local `YYYY-MM-DD` date. */
export function formatDay(date: string): string {
  const d = parseDate(date);
  return `${WEEKDAYS[d.getDay()]} ${pad2(d.getDate())}`;
}

export function isWeekend(date: string): boolean {
  const day = parseDate(date).getDay();
  return day === 0 || day === 6;
}

function parseDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

// One hue per model family; the newest version gets the vivid shade, older ones a greyed one.
// Both keep the same luminance, picked for at least 3:1 contrast on light and dark backgrounds.
const FAMILIES: [string, string[]][] = [
  ['opus', ['#317fd8', '#6080a5']],
  ['fable', ['#aa8015', '#978555']],
  ['haiku', ['#da641f', '#a87d65']],
  ['sonnet', ['#9e59cf', '#906aab']],
];

export function modelPalette(models: string[]): Map<string, string> {
  const palette = new Map<string, string>();
  const unique = [...new Set(models)];
  for (const [family, shades] of FAMILIES) {
    unique
      .filter((m) => m.toLowerCase().includes(family))
      .sort(newestFirst)
      .forEach((m, i) => palette.set(m, shades[Math.min(i, shades.length - 1)]!));
  }
  for (const m of unique) if (!palette.has(m)) palette.set(m, 'gray');
  return palette;
}

function newestFirst(a: string, b: string): number {
  const va = (a.match(/\d+/g) ?? []).map(Number);
  const vb = (b.match(/\d+/g) ?? []).map(Number);
  for (let i = 0; i < Math.max(va.length, vb.length); i++) {
    const diff = (vb[i] ?? -1) - (va[i] ?? -1);
    if (diff) return diff;
  }
  return a.localeCompare(b);
}

/** A lower block leaves a sliver of background between stacked rows, so bars stay apart. */
export const BLOCK = '▆';

export function meterColor(percent: number): 'green' | 'yellow' | 'red' {
  if (percent < 60) return 'green';
  if (percent < 85) return 'yellow';
  return 'red';
}

/**
 * Splits `length` cells between `parts` in proportion to their values, using
 * largest remainders so the cells always add up to exactly `length`.
 */
export function splitCells(parts: number[], length: number): number[] {
  const total = parts.reduce((a, b) => a + b, 0);
  if (total <= 0 || length <= 0) return parts.map(() => 0);
  const exact = parts.map((p) => (p / total) * length);
  const cells = exact.map(Math.floor);
  let left = length - cells.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => [e - Math.floor(e), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left-- <= 0) break;
    cells[i]!++;
  }
  return cells;
}

/** Cells a value gets on a bar scaled to `max`; anything non-zero shows at least one. */
export function barCells(value: number, max: number, width: number): number {
  if (value <= 0 || max <= 0) return 0;
  return Math.min(width, Math.max(1, Math.round((value / max) * width)));
}

/** Pads or truncates to exactly `width` columns, ending a cut with "…". */
export function fit(text: string, width: number): string {
  if (width <= 0) return '';
  if (text.length <= width) return text.padEnd(width);
  return `${text.slice(0, width - 1)}…`;
}
