export type Panel = 'skills' | 'tools' | 'models' | 'projects' | 'agents';

export interface Layout {
  tooSmall: boolean;
  /** Content width, inside the 1-column side padding. */
  width: number;
  /** Limits beside the totals, like htop's two-column header. */
  wide: boolean;
  /** Width of the limits; when wide the totals take a fixed width at the right edge. */
  head: number;
  /** One-row totals strip under the limits in the narrow layout. */
  strip: boolean;
  days: number;
  panels: Panel[];
  /** Width of each panel; together with the gaps they fill `width`. */
  panelWidths: number[];
  /** Item rows per panel; 0 when the panels are hidden. */
  panelRows: number;
  meterBar: number;
  dayBar: number;
}

export const MIN_COLUMNS = 60;
export const MIN_ROWS = 15;
/** From here the limits sit beside the totals. */
export const WIDE_COLUMNS = 100;
/** Rows sit indented under their section title. */
export const INDENT = 2;
export const MAX_DAYS = 7;
export const MIN_PANEL_ROWS = 3;
/** Narrowest panel that still shows a plugin:skill name next to its count. */
export const MIN_PANEL = 32;
export const PANEL_GAP = 1;
export const HEAD_GAP = 3;
/** Totals in the wide header: three rows of two label-value pairs. */
export const TOTALS_ROWS = 3;
export const TOTALS_LABEL = 10;
export const TOTALS_VALUE = 6;
export const TOTALS_GAP = 4;
export const TOTALS_WIDTH = INDENT + 2 * (TOTALS_LABEL + TOTALS_VALUE) + TOTALS_GAP;
/** In the order they appear as the terminal gets wider. */
export const PANELS: Panel[] = ['skills', 'tools', 'models', 'projects', 'agents'];

/** Fixed columns of a meter row: label, percent and "reset 6d 23h", with gaps. */
export const meterChrome = (labelWidth: number) => labelWidth + 2 + 5 + 2 + 14;
/** Fixed columns of a day row: "We 21", tokens and "$ 20", with gaps. */
export const DAY_CHROME = 5 + 2 + 2 + 6 + 2 + 4;

/**
 * Splits the terminal so the frame fills it exactly. A frame as tall as the
 * terminal is safe: Ink drops the trailing newline then, so the terminal never scrolls.
 */
export function computeLayout(
  columns: number,
  rows: number,
  meters: { lines: number; labelWidth: number },
): Layout {
  const width = Math.max(0, columns - 2);
  const wide = columns >= WIDE_COLUMNS;
  const head = wide ? width - HEAD_GAP - TOTALS_WIDTH : width;
  const meterBar = Math.max(4, head - INDENT - meterChrome(meters.labelWidth));
  const dayBar = Math.max(4, width - INDENT - DAY_CHROME);
  const base = { width, wide, head, meterBar, dayBar };
  if (columns < MIN_COLUMNS || rows < MIN_ROWS) {
    return { ...base, tooSmall: true, strip: false, days: 0, panels: [], panelWidths: [], panelRows: 0 };
  }

  const headRows = wide ? Math.max(meters.lines, TOTALS_ROWS) : meters.lines;
  // header, limits title, tokens title, legend, footer + 3 blank separators
  const free = rows - 8 - headRows;
  const days = Math.min(MAX_DAYS, Math.max(1, free));
  let rest = free - days;
  // blank separator + panel title
  const showPanels = rest - 2 >= MIN_PANEL_ROWS;
  if (showPanels) rest -= 2;
  // blank separator + the strip, only once the panels have their minimum
  const strip = !wide && rest - (showPanels ? MIN_PANEL_ROWS : 0) >= 2;
  if (strip) rest -= 2;
  const panels = showPanels ? panelsFor(width) : [];
  return {
    ...base,
    tooSmall: false,
    strip,
    days,
    panels,
    panelWidths: split(width, panels.length),
    panelRows: showPanels ? rest : 0,
  };
}

/** As many panels as fit at MIN_PANEL each, at least one. */
function panelsFor(width: number): Panel[] {
  const count = Math.max(1, Math.floor((width + PANEL_GAP) / (MIN_PANEL + PANEL_GAP)));
  return PANELS.slice(0, count);
}

/** Widths of `count` panels that together with the gaps fill `width`, wider ones first. */
export function split(width: number, count: number): number[] {
  if (count === 0) return [];
  const room = width - PANEL_GAP * (count - 1);
  const each = Math.floor(room / count);
  return Array.from({ length: count }, (_, i) => each + (i < room % count ? 1 : 0));
}
