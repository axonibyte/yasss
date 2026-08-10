/**
 * The poll graph.
 *
 * A sibling of `entities.svelte.js` rather than an extension of it. The two
 * grids look alike and mean different things: an event's columns are activities
 * and its rows are instants, a poll's columns are days and its rows are times
 * of day with no date at all. Sharing the classes would mean a `begin` that is
 * sometimes a Date and sometimes a clock reading, which is the kind of field
 * nobody can reason about at a call site.
 *
 * Squares are keyed by option and window here, exactly as slots are keyed by
 * activity and window there, and for the same reason: there is no stride and no
 * index arithmetic anywhere, so deleting a column cannot leave the grid
 * pointing at the wrong cells.
 */
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { mintKey } from '../lib/keys.js';

/** The all-day square's stand-in for a window key, in keys and lookups. */
export const ALL_DAY = 'all-day';

/** The key a square is stored under. */
export const cellKey = (optionKey, windowKey) => `${optionKey}|${windowKey ?? ALL_DAY}`;

/**
 * One column: a day of the week, or a specific date.
 *
 * Exactly one of `dayOfWeek` and `date` is ever set, decided by the poll's
 * scope. `date` is the wire's `yyyy-MM-dd` string rather than a Date, because
 * it is a calendar day and not an instant -- turning it into a Date would put
 * it in some zone, and the point of an absolute poll's column is that it is the
 * third of September wherever you are reading it.
 */
export class PollOption {
  key = mintKey('o');
  id = $state(null);
  /** ISO-8601: Monday is 1, Sunday is 7. */
  dayOfWeek = $state(null);
  date = $state(null);
  allDay = $state(false);
  priority = $state(0);

  constructor(init = {}) {
    Object.assign(this, init);
  }
}

/**
 * One row: a start time, as `HH:mm`.
 *
 * A string rather than minutes-since-midnight, because that is what the wire
 * carries and what an `<input type="time">` reads and writes. Converting at
 * both ends would be two places for an off-by-sixty to hide.
 */
export class PollWindow {
  key = mintKey('t');
  id = $state(null);
  startTime = $state('09:00');
  /** The standing "apply to future days/dates" rule. */
  appliesToNewOptions = $state(false);

  constructor(init = {}) {
    Object.assign(this, init);
  }
}

/**
 * One votable square.
 *
 * `windowKey` is null on the all-day square, matching the null `poll_window`
 * the server stores. Unlike a slot, this carries a server id of its own: a vote
 * names the square rather than the pair, which is what stops an all-day vote
 * being castable more than once.
 */
export class PollCell {
  key;
  id = $state(null);
  optionKey;
  windowKey;

  constructor(optionKey, windowKey, init = {}) {
    this.optionKey = optionKey;
    this.windowKey = windowKey ?? null;
    this.key = cellKey(optionKey, windowKey);
    Object.assign(this, init);
  }

  get isAllDay() {
    return this.windowKey === null;
  }
}

/** One person's answer, as the organiser sees it listed. */
export class PollResponse {
  key = mintKey('r');
  id = $state(null);
  name = $state('');
  submitted = $state(null);
  /** Server ids of the squares they chose. */
  votes = new SvelteSet();
  /** detailKey -> string | boolean */
  values = new SvelteMap();

  constructor(init = {}) {
    const { votes, values, ...rest } = init;
    Object.assign(this, rest);
    for (const id of votes ?? []) this.votes.add(id);
    if (values) for (const [k, v] of values) this.values.set(k, v);
  }
}
