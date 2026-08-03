/**
 * The event graph.
 *
 * The legacy kept slots in a flat, window-major array indexed
 * `slots[w * activities.length + a]`, which was the root of four separate
 * confirmed bugs: a wrong stride when publishing, stale RSVP counts after a
 * volunteer was removed, stale cell indices once the grid was scrolled, and the
 * whole reindexing dance in the (dead) reorder helpers.
 *
 * Here a slot belongs to its activity, keyed by window. There is no stride and
 * no index arithmetic anywhere. Deleting an activity drops its slots with it;
 * deleting a window is one `delete` per activity. That mirrors the wire format
 * too — `GET /events/:id` nests slots inside activities, keyed by window id.
 *
 * See docs/legacy/01-behavior.md §2.2 and 03-api-contract.md §2.
 */
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { mintKey } from '../lib/keys.js';
import { fmtDateRangeParts } from '../lib/format/dates.js';

/**
 * One grid cell: an activity offered during a window.
 *
 * The server has no slot id and no `enabled` column — a slot row exists iff it
 * is enabled — so `enabled` here is a client-side notion that maps to the
 * presence or absence of that row.
 */
export class Slot {
  key;
  activityKey;
  windowKey;
  enabled = $state(false);
  /** 0 means unlimited. */
  cap = $state(0);
  rsvpCount = $state(0);
  /** Server ids of volunteers holding this slot; anonymous ones have none. */
  rsvps = new SvelteSet();

  constructor(activityKey, windowKey, init = {}) {
    this.activityKey = activityKey;
    this.windowKey = windowKey;
    this.key = `${activityKey}\u0000${windowKey}`;
    this.enabled = init.enabled ?? false;
    this.cap = init.cap ?? 0;
    this.rsvpCount = init.rsvpCount ?? 0;
    for (const id of init.rsvps ?? []) this.rsvps.add(id);
  }

  get full() {
    return this.cap !== 0 && this.rsvpCount >= this.cap;
  }
}

export class Activity {
  key = mintKey('a');
  id = $state(null);
  label = $state('');
  description = $state('');
  /** 0 means unlimited. */
  volunteerCap = $state(0);
  slotCapDefault = $state(0);
  priority = $state(0);
  /** windowKey -> Slot */
  slots = new SvelteMap();

  constructor(init = {}) {
    Object.assign(this, init);
  }

  rsvpTotal = $derived.by(() => {
    let n = 0;
    for (const s of this.slots.values()) n += s.rsvpCount;
    return n;
  });

  /** An activity-wide cap applies across all of its slots. */
  atCapacity = $derived(this.volunteerCap !== 0 && this.rsvpTotal >= this.volunteerCap);

  /** Get the slot for a window, creating a disabled one if absent. */
  slotFor(win) {
    let slot = this.slots.get(win.key);
    if (!slot) {
      slot = new Slot(this.key, win.key, { cap: this.slotCapDefault });
      this.slots.set(win.key, slot);
    }
    return slot;
  }
}

export class EventWindow {
  key = mintKey('w');
  id = $state(null);
  begin = $state(null);
  end = $state(null);
  /**
   * The event's IANA zone, copied down so the label can be a plain derived.
   * Null renders in the viewer's own zone, which is what every event created
   * before zones existed does.
   */
  timezone = $state(null);

  constructor(init = {}) {
    Object.assign(this, init);
  }

  /**
   * Rendered as two lines. The legacy built an HTML string with a `<br />` and
   * injected it with `.html()`; components render the parts separately so
   * nothing reaches the DOM as markup.
   */
  labelParts = $derived(fmtDateRangeParts(this.begin, this.end, this.timezone));
}

export class Detail {
  key = mintKey('d');
  id = $state(null);
  type = $state('STRING');
  label = $state('');
  hint = $state('');
  required = $state(false);
  priority = $state(0);

  constructor(init = {}) {
    Object.assign(this, init);
  }
}

export class Volunteer {
  key = mintKey('v');
  id = $state(null);
  name = $state('');
  remindersEnabled = $state(false);
  /** Where reminders go. Never returned by the server -- only ever sent. */
  reminderEmail = $state('');
  /** Read-only: whether the server holds a confirmed address for them. */
  reminderConfirmed = $state(false);
  user = $state(null);
  /** detailKey -> string | boolean */
  values = new SvelteMap();
  /** slot keys */
  rsvps = new SvelteSet();

  constructor(init = {}) {
    const { values, ...rest } = init;
    Object.assign(this, rest);
    if (values) for (const [k, v] of values) this.values.set(k, v);
  }

  /** True once the server has assigned this volunteer an id. */
  get persisted() {
    return this.id !== null;
  }
}
