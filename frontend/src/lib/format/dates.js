/**
 * Date formatting, matching the legacy exactly (app.js:908-922).
 *
 * The locale and option set are load-bearing: window header cells show these
 * strings, so changing them changes the grid's appearance.
 */

const OPTS = {
  day: '2-digit',
  year: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
};

/** @param {Date|null} d */
export const fmtDateTime = (d) =>
  d == null ? '' : d.toLocaleDateString('en-us', OPTS);

/**
 * Window label. The legacy returned an HTML string with a `<br />` and injected
 * it with `.html()`; components render the two halves as separate nodes
 * instead, so nothing user-supplied is ever parsed as markup.
 *
 * @returns {{begin: string, end: string}}
 */
export function fmtDateRangeParts(begin, end) {
  return { begin: fmtDateTime(begin), end: fmtDateTime(end) };
}

/** Single-line variant, used where a `<br />` would not fit. */
export const fmtDateRange = (begin, end) =>
  `${fmtDateTime(begin)} - ${fmtDateTime(end)}`;

/** Tomorrow at the given time — the window picker's default bounds. */
export function tomorrowAt(hours, minutes = 0) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hours, minutes, 0, 0);
  return d;
}
