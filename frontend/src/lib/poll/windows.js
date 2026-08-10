/**
 * "Repeat every", and the bound the organiser is held to.
 *
 * The repeat control is an authoring convenience and nothing else. It produces
 * a handful of start times and is then forgotten: nothing about the recurrence
 * is stored, because every read path needs concrete rows anyway -- the grid
 * renders them, squares reference them, votes reference the squares -- and a
 * stored rule would have to be expanded on every read, in two languages, for
 * ever.
 *
 * The bound is the organiser's own: a repeat may not ask for more time than is
 * left between the first window and the end of the day. Two things follow from
 * that, and only one of them is obvious. The obvious one is that generation
 * stops at midnight. The other is that an interval longer than the remainder is
 * refused outright rather than silently producing a single window -- somebody
 * who asks for "every eight hours" starting at 6pm has misunderstood something,
 * and quietly giving them one window at 6pm would hide it.
 *
 * End of day means midnight in the poll's own frame: its zone on a zoned poll,
 * the wall clock otherwise. Since start times are stored in that same frame,
 * the arithmetic is identical either way and there is nothing to convert.
 */

/** Minutes in a day. */
const DAY = 24 * 60;

/**
 * Minutes since midnight, from an `HH:mm` reading.
 *
 * @param {string} hhmm
 * @returns {number|null} null when it is not a reading
 */
export function toMinutes(hhmm) {
  if (typeof hhmm !== 'string') return null;
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * An `HH:mm` reading, from minutes since midnight.
 *
 * @param {number} minutes
 * @returns {string}
 */
export const toClock = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * How much of the day is left after a start time.
 *
 * @param {string} start the first window, as `HH:mm`
 * @returns {number} minutes remaining until midnight
 */
export function remainingAfter(start) {
  const from = toMinutes(start);
  return from === null ? 0 : DAY - from;
}

/**
 * Whether a repeat interval fits in what is left of the day.
 *
 * @param {string} start the first window
 * @param {number} hours
 * @param {number} minutes
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function checkInterval(start, hours, minutes) {
  if (toMinutes(start) === null) return { ok: false, reason: 'That is not a time of day.' };

  const interval = Number(hours) * 60 + Number(minutes);
  if (!Number.isFinite(interval) || interval <= 0) {
    return { ok: false, reason: 'Repeat every how long?' };
  }

  const left = remainingAfter(start);
  if (interval > left) {
    const h = Math.floor(left / 60);
    const m = left % 60;
    return {
      ok: false,
      reason: `Only ${h}h ${m}m is left in the day after ${start}.`,
    };
  }
  return { ok: true };
}

/**
 * The start times a repeat produces.
 *
 * Inclusive of the first, exclusive of midnight. Returns just the first window
 * when there is no repeat, so a caller never has to branch on whether the
 * organiser asked for one.
 *
 * @param {object} args
 * @param {string} args.start the first window, as `HH:mm`
 * @param {boolean} [args.repeat] whether to repeat at all
 * @param {number} [args.hours]
 * @param {number} [args.minutes]
 * @returns {string[]} the readings, earliest first
 */
export function expandRepeat({ start, repeat = false, hours = 0, minutes = 0 }) {
  const from = toMinutes(start);
  if (from === null) return [];
  if (!repeat) return [start];

  const interval = Number(hours) * 60 + Number(minutes);
  if (!Number.isFinite(interval) || interval <= 0) return [start];
  if (interval > remainingAfter(start)) return [start];

  const out = [];
  for (let at = from; at < DAY; at += interval) out.push(toClock(at));
  return out;
}

/**
 * The readings a poll does not already have.
 *
 * Deduplicated here rather than left to the server's unique index: two rows at
 * one time would split a respondent's vote between them, and catching it as a
 * duplicate-key error out of a batch makes it impossible to tell the organiser
 * which of their windows collided.
 *
 * @param {string[]} wanted
 * @param {string[]} existing readings already on the poll
 * @returns {string[]}
 */
export function newOnly(wanted, existing) {
  const have = new Set(existing);
  const out = [];
  for (const reading of wanted) {
    if (have.has(reading)) continue;
    have.add(reading);
    out.push(reading);
  }
  return out;
}
