/**
 * Reading a poll's times in somebody else's clock.
 *
 * A poll states its times one of two ways, and the difference is the organizer's
 * choice rather than a rendering detail:
 *
 * - WALL_CLOCK: nine o'clock means nine o'clock wherever you are. Nothing is
 *   converted, so nothing can be converted wrongly. This is the default and the
 *   right answer for a group who are all in one place.
 * - ZONED: the poll fixes a zone, and a reader elsewhere sees the same instant
 *   in theirs.
 *
 * The awkward case is real and is shown rather than hidden: converting a time
 * can cross midnight, which on a relative poll means the square lands on a
 * different weekday for that reader than the column it sits in claims. A grid
 * that quietly renders "23:00" as "05:00" under a Monday heading is telling
 * somebody they are free on the wrong day.
 *
 * No date library. `Intl` already knows every zone rule, and the two functions
 * below are the whole of what is needed.
 */

/**
 * The offset of a zone at an instant, in milliseconds.
 *
 * Derived by asking `Intl` what the wall clock reads there and subtracting.
 * There is no API that answers this directly.
 *
 * @param {number} utcMillis
 * @param {string} zone an IANA identifier
 * @returns {number} milliseconds to add to UTC to get local time
 */
function offsetAt(utcMillis, zone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMillis));

  const at = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(at.year),
    Number(at.month) - 1,
    Number(at.day),
    Number(at.hour) % 24,
    Number(at.minute),
    Number(at.second),
  );
  return asUtc - utcMillis;
}

/**
 * The instant at which a wall-clock reading occurs in a given zone.
 *
 * Two passes, not one. The first guess assumes the zone's offset at the naive
 * UTC instant, which is wrong for any reading within an offset's width of a
 * daylight-saving transition; applying the offset found at the corrected
 * instant fixes it. A third pass would change nothing -- transitions are hours
 * apart, and offsets are minutes wide.
 *
 * @param {{year: number, month: number, day: number}} date calendar day, month 1-12
 * @param {string} hhmm the clock reading, as `HH:mm`
 * @param {string} zone an IANA identifier
 * @returns {number} epoch milliseconds
 */
export function instantOf(date, hhmm, zone) {
  const [hh, mm] = hhmm.split(':').map(Number);
  const naive = Date.UTC(date.year, date.month - 1, date.day, hh, mm);
  const once = naive - offsetAt(naive, zone);
  return naive - offsetAt(once, zone);
}

/** The viewer's own zone, or UTC if the browser will not say. */
export function localZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * A clock reading, as this app writes times everywhere else.
 *
 * @param {string} hhmm the reading, as `HH:mm`
 * @returns {string} e.g. `9:00 AM`
 */
export function fmtClock(hhmm) {
  const [hh, mm] = hhmm.split(':').map(Number);
  const suffix = hh < 12 ? 'AM' : 'PM';
  const hour = hh % 12 === 0 ? 12 : hh % 12;
  return `${hour}:${String(mm).padStart(2, '0')} ${suffix}`;
}

/** The calendar day parts of a Date, in the viewer's own zone. */
const partsOf = (d) => ({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() });

/**
 * A calendar day to resolve a relative column against.
 *
 * A weekday has no date, and a conversion needs one -- daylight saving means
 * "Monday 9am in Chicago" is a different offset in January than in July. The
 * next occurrence of that weekday is the honest choice: it is the one a
 * respondent is thinking about.
 *
 * @param {number} isoDay Monday is 1, Sunday is 7
 * @param {Date} [now] injectable, for tests
 */
export function nextOccurrence(isoDay, now = new Date()) {
  const d = new Date(now);
  const today = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() + ((isoDay - today + 7) % 7));
  return partsOf(d);
}

/**
 * The calendar day a column refers to.
 *
 * @param {object} poll the poll model
 * @param {object} option the column
 * @param {Date} [now] injectable, for tests
 */
export function referenceDate(poll, option, now = new Date()) {
  if (poll.scope === 'ABSOLUTE' && option?.date) {
    const [year, month, day] = option.date.split('-').map(Number);
    return { year, month, day };
  }
  return nextOccurrence(option?.dayOfWeek ?? 1, now);
}

/**
 * How a row header reads.
 *
 * The first line is always the poll's own time, exactly as the organizer typed
 * it -- it is the canonical reading and it is never wrong. The second appears
 * only when it would say something different, and carries a day marker when the
 * conversion crosses midnight, because on a relative poll that means a
 * different weekday entirely.
 *
 * @param {string} hhmm the row's start time
 * @param {object} poll the poll model
 * @param {object|null} option the column to resolve daylight saving against
 * @param {Date} [now] injectable, for tests
 * @returns {{primary: string, secondary: string|null}}
 */
export function windowLabel(hhmm, poll, option, now = new Date()) {
  const primary = fmtClock(hhmm);
  if (poll.timeMode !== 'ZONED' || !poll.timezone) return { primary, secondary: null };

  const zone = poll.displayZone || localZone();
  if (zone === poll.timezone) return { primary, secondary: null };

  const date = referenceDate(poll, option, now);
  const instant = instantOf(date, hhmm, poll.timezone);

  const there = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(instant));

  // Which calendar day the instant lands on in each zone. A number rather than
  // a string comparison so the marker can say which way it moved.
  const dayIn = (z) =>
    Number(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: z,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .format(new Date(instant))
        .replaceAll('-', ''),
    );

  const shift = Math.sign(dayIn(zone) - dayIn(poll.timezone));
  const marker = shift > 0 ? ' (+1d)' : shift < 0 ? ' (−1d)' : '';

  return { primary, secondary: `${there}${marker}` };
}

/**
 * The note shown above a grid whose times are being converted.
 *
 * @param {object} poll the poll model
 * @returns {string|null}
 */
export function zoneNote(poll) {
  if (poll.timeMode !== 'ZONED' || !poll.timezone) return null;
  const zone = poll.displayZone || localZone();
  if (zone === poll.timezone) return `All times are in ${poll.timezone}.`;
  return `Times shown in ${zone}. This poll was set in ${poll.timezone}.`;
}
