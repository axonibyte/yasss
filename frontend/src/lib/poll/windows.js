/**
 * "Repeat every", and the bounds the organiser is held to.
 *
 * The repeat control is an authoring convenience and nothing else. It produces
 * a handful of start times and is then forgotten: nothing about the recurrence
 * is stored, because every read path needs concrete rows anyway -- the grid
 * renders them, squares reference them, votes reference the squares -- and a
 * stored rule would have to be expanded on every read, in two languages, for
 * ever.
 *
 * ## Where a repeat stops
 *
 * Either at an "until" the organiser named, or at the end of the day if they
 * did not. The unnamed case came first and is unchanged: a repeat may not ask
 * for more time than is left between the first window and midnight, generation
 * stops before midnight, and an interval longer than the remainder is refused
 * outright rather than silently producing a single window -- somebody who asks
 * for "every eight hours" starting at 6pm has misunderstood something, and
 * quietly giving them one window at 6pm would hide it.
 *
 * ## "Until" is INCLUSIVE, and that is a decision
 *
 * A time landing exactly on the cadence is offered. "From 09:00 every hour
 * until 17:00" produces a 17:00 window.
 *
 * The familiar analogue -- Doodle, When2meet, a calendar's working hours -- is
 * exclusive, but for a reason that does not hold here: there, a slot has a
 * duration, so the last one *starts* at 16:30 and *ends* at the 17:00 boundary.
 * A poll window has no end (`poll_window` stores `start_time` and nothing
 * else); it is an instant, and the question it asks is "can you make 5?". An
 * exclusive reading would mean the organiser types the exact time they want
 * offered and is then not offered it, with the last window an interval short of
 * the number on screen. That reads as an off-by-one however it is documented.
 *
 * It also matters which way the surprise falls. Inclusive, an organiser who
 * wanted to stop before 17:00 sees one window too many and deletes it.
 * Exclusive, the window they explicitly named is missing, and nothing on the
 * form says why. Silently dropping a time somebody typed is the worse failure,
 * so the boundary belongs to them.
 *
 * RFC 5545's `UNTIL` and Google Calendar's "ends on" are both inclusive too,
 * which is the other half of the argument: recurrences that end on a named
 * instant conventionally include it.
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

/** Whether an "until" was actually given. Blank means "to the end of the day". */
const named = (until) => typeof until === 'string' && until !== '';

/**
 * The span a repeat has to work within, and the last minute it may land on.
 *
 * The two cases are not quite symmetrical, deliberately. Without an "until" the
 * span runs to midnight -- 24:00, an instant no window can occupy but the one
 * the organiser is measuring to -- while the last window may be no later than
 * 23:59. With an "until" the span runs to a time that *is* offerable, so the
 * ceiling and the end of the span are the same minute.
 *
 * @param {string} start
 * @param {string|null} [until]
 * @returns {{ok: true, span: number, last: number, bounded: boolean}
 *          | {ok: false, reason: string}}
 */
function spanFor(start, until = null) {
  const from = toMinutes(start);
  if (from === null) return { ok: false, reason: 'That is not a time of day.', field: 'start' };

  if (!named(until)) return { ok: true, span: DAY - from, last: DAY - 1, bounded: false };

  const last = toMinutes(until);
  if (last === null) return { ok: false, reason: 'That is not a time of day.', field: 'until' };
  // The requirement, and the reason the field carries a `min`: an "until"
  // before the start describes a repeat that is over before it begins.
  if (last < from) {
    return {
      ok: false,
      reason: `That is before ${start}, when the repeat starts.`,
      field: 'until',
    };
  }
  // Equal is refused for the same reason an oversized interval is: it produces
  // exactly one window, which is what turning the repeat off already does, and
  // accepting it quietly would hide the mistake.
  if (last === from) {
    return { ok: false, reason: 'The repeat has to end after it starts.', field: 'until' };
  }

  return { ok: true, span: last - from, last, bounded: true };
}

/**
 * Whether a repeat interval fits in the span it was given.
 *
 * @param {string} start the first window
 * @param {number} hours
 * @param {number} minutes
 * @param {string|null} [until] the last time to offer, inclusive
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function checkInterval(start, hours, minutes, until = null) {
  const bound = spanFor(start, until);
  if (!bound.ok) return bound;

  const interval = Number(hours) * 60 + Number(minutes);
  if (!Number.isFinite(interval) || interval <= 0) {
    return { ok: false, reason: 'Repeat every how long?', field: 'interval' };
  }

  if (interval > bound.span) {
    const h = Math.floor(bound.span / 60);
    const m = bound.span % 60;
    return {
      ok: false,
      field: 'interval',
      reason: bound.bounded
        ? `Only ${h}h ${m}m separates ${start} and ${until}.`
        : `Only ${h}h ${m}m is left in the day after ${start}.`,
    };
  }
  return { ok: true };
}

/**
 * The start times a repeat produces.
 *
 * Inclusive of the first and of any "until"; exclusive of midnight. Returns
 * just the first window when there is no repeat, so a caller never has to
 * branch on whether the organiser asked for one.
 *
 * @param {object} args
 * @param {string} args.start the first window, as `HH:mm`
 * @param {boolean} [args.repeat] whether to repeat at all
 * @param {number} [args.hours]
 * @param {number} [args.minutes]
 * @param {string|null} [args.until] the last time to offer, inclusive
 * @returns {string[]} the readings, earliest first
 */
export function expandRepeat({ start, repeat = false, hours = 0, minutes = 0, until = null }) {
  const from = toMinutes(start);
  if (from === null) return [];
  if (!repeat) return [start];

  // Agrees with the form rather than producing something it just refused.
  const bound = spanFor(start, until);
  if (!bound.ok) return [start];

  const interval = Number(hours) * 60 + Number(minutes);
  if (!Number.isFinite(interval) || interval <= 0) return [start];
  if (interval > bound.span) return [start];

  const out = [];
  for (let at = from; at <= bound.last; at += interval) out.push(toClock(at));
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
