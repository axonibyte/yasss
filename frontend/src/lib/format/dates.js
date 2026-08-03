/**
 * Date formatting.
 *
 * The locale and option set are load-bearing: window header cells show these
 * strings, so changing them changes the grid's appearance. They match the
 * legacy exactly (app.js:908-922).
 *
 * What is new is the zone. An instant is unambiguous — windows travel as epoch
 * milliseconds — but *rendering* one is not, and every surface used to pick its
 * own zone: the grid used the viewer's browser, the mail templates used the
 * server. A volunteer in another timezone was told two different times for the
 * same shift. For a physical event the event's own zone is the right one: a
 * bake sale that starts at 9am starts at 9am where the bake sale is.
 *
 * An event with no recorded zone — every event created before the column
 * existed — falls back to the viewer's, which is exactly what it did before.
 */

const OPTS = {
  day: '2-digit',
  year: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
};

/**
 * @param {Date|null} d
 * @param {string|null} [timeZone] IANA zone id; omit for the viewer's own
 */
export const fmtDateTime = (d, timeZone = null) =>
  d == null ? '' : d.toLocaleDateString('en-us', timeZone ? { ...OPTS, timeZone } : OPTS);

/**
 * Window label. The legacy returned an HTML string with a `<br />` and injected
 * it with `.html()`; components render the two halves as separate nodes
 * instead, so nothing user-supplied is ever parsed as markup.
 *
 * @returns {{begin: string, end: string}}
 */
export function fmtDateRangeParts(begin, end, timeZone = null) {
  return { begin: fmtDateTime(begin, timeZone), end: fmtDateTime(end, timeZone) };
}

/**
 * A human label naming the zone times are shown in.
 *
 * Shown once, on the event, rather than appended to every cell: the grid holds
 * five fixed columns at every breakpoint, and a zone abbreviation on each of
 * them costs more than it explains. Returns null when there is nothing worth
 * saying — an event with no recorded zone renders in the viewer's own, which
 * needs no announcement.
 *
 * Resolved against `at` rather than the current moment, because the
 * abbreviation depends on daylight saving: an event in January is CST, not the
 * CDT that today's date would report in August.
 *
 * @param {string|null} timeZone
 * @param {Date|null} [at] the instant to resolve DST against; defaults to now
 * @returns {string|null}
 */
export function fmtZoneLabel(timeZone, at = null) {
  if (!timeZone) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-us', { timeZone, timeZoneName: 'short' })
      .formatToParts(at ?? new Date());
    const abbr = parts.find((p) => p.type === 'timeZoneName')?.value;
    // The abbreviation alone is ambiguous — CST is two different zones — so the
    // IANA name goes alongside it.
    return abbr && abbr !== timeZone ? `${abbr} (${timeZone})` : timeZone;
  } catch {
    // An unrecognized zone must not take the page down; the server validates
    // against its own tz database, but a client can be older than the server.
    return timeZone;
  }
}

/** The viewer's own IANA zone, or null if the browser will not say. */
export function localZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

/** Tomorrow at the given time — the window picker's default bounds. */
export function tomorrowAt(hours, minutes = 0) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hours, minutes, 0, 0);
  return d;
}
