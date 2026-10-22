export type Panel = 'skills' | 'tools' | 'models';

export interface Layout {
  tooSmall: boolean;
  /** Content width, inside the 1-column side padding. */
  width: number;
  days: number;
  panels: Panel[];
  /** Item rows per top panel; 0 when the panels are hidden. */
  panelRows: number;
  meterBar: number;
  dayBar: number;
}

export const MIN_COLUMNS = 60;
export const MIN_ROWS = 15;
const MAX_DAYS = 7;
/** Rows sit indented under their section title. */
export const INDENT = 2;
const MIN_PANEL_ROWS = 3;
const MAX_PANEL_ROWS = 10;

/** Fixed columns of a meter row: label, percent and "reset 6d 23h", with gaps. */
export const meterChrome = (labelWidth: number) => labelWidth + 2 + 5 + 2 + 14;
/** Fixed columns of a day row: "We 21", tokens and "$ 20", with gaps. */
export const DAY_CHROME = 5 + 2 + 2 + 6 + 2 + 4;

/**
 * Splits the terminal between the sections. The frame stays one row shorter
 * than the terminal: a frame that fills the last row makes the terminal scroll
 * and Ink's in-place redraw cascade copies down the screen.
 */
export function computeLayout(
  columns: number,
  rows: number,
  meters: { lines: number; labelWidth: number },
): Layout {
  const width = Math.max(0, columns - 2);
  const panels = panelsFor(columns);
  const meterBar = Math.max(4, width - INDENT - meterChrome(meters.labelWidth));
  const dayBar = Math.max(4, width - INDENT - DAY_CHROME);
  if (columns < MIN_COLUMNS || rows < MIN_ROWS) {
    return { tooSmall: true, width, days: 0, panels: [], panelRows: 0, meterBar, dayBar };
  }

  // header, limits title, tokens title, legend, footer, headroom + 3 blank separators
  const fixed = 9 + meters.lines;
  const free = rows - fixed;
  const days = Math.min(MAX_DAYS, Math.max(1, free));
  // blank separator + panel header row
  const panelRows = Math.min(MAX_PANEL_ROWS, free - days - 2);
  const showPanels = panelRows >= MIN_PANEL_ROWS;
  return {
    tooSmall: false,
    width,
    days,
    panels: showPanels ? panels : [],
    panelRows: showPanels ? panelRows : 0,
    meterBar,
    dayBar,
  };
}

function panelsFor(columns: number): Panel[] {
  if (columns >= 100) return ['skills', 'tools', 'models'];
  if (columns >= 80) return ['skills', 'tools'];
  return ['skills'];
}
