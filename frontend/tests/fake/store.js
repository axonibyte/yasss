/**
 * In-memory state for the fake API server.
 *
 * Modelled on the real schema rather than on whatever the tests happen to need,
 * because the point of the fake is to catch places where the frontend and the
 * Java server disagree. Where the server's shape is surprising, that surprise
 * is reproduced here — see `serializeEventRead`.
 */
import { randomUUID } from 'node:crypto';

export function createStore() {
  return {
    users: new Map(), // id -> {id, email, pubkey, accessLevel}
    events: new Map(), // id -> event
    sessions: new Map(), // token -> userId
    /** Deterministic ids make failures readable. */
    seq: 0,
  };
}

export const nextId = (store, prefix) => `${prefix}-${String(++store.seq).padStart(4, '0')}`;

export function seedUser(store, { email = 'ada@example.com', accessLevel = 'STANDARD', pubkey = 'PUBKEY' } = {}) {
  const id = nextId(store, 'user');
  store.users.set(id, { id, email, pubkey, accessLevel });
  return store.users.get(id);
}

/**
 * Build an event with a full activity x window grid.
 *
 * @param {object} opts
 * @param {number} opts.activities
 * @param {number} opts.windows
 * @param {(a: number, w: number) => boolean} [opts.enabled] which slots exist
 */
export function seedEvent(store, {
  activities = 2,
  windows = 2,
  enabled = () => true,
  /** Serializable alternative to `enabled`, for seeding over HTTP. */
  disabledSlots = null,
  admin = null,
  title = 'Bake Sale',
  description = 'Cakes and things',
  allowMultiUserSignups = false,
  isPublished = true,
  expired = false,
  details = [],
  volunteers = [],
} = {}) {
  const id = nextId(store, 'event');

  const windowList = Array.from({ length: windows }, (_, i) => ({
    id: nextId(store, 'window'),
    begin: Date.UTC(2030, 0, 1 + i, 14),
    end: Date.UTC(2030, 0, 1 + i, 22),
  }));

  // `disabledSlots` arrives as [[activity, window], ...] from the test harness,
  // since a predicate cannot cross the wire.
  const isEnabled = disabledSlots
    ? (a, w) => !disabledSlots.some(([da, dw]) => da === a && dw === w)
    : enabled;

  const activityList = Array.from({ length: activities }, (_, a) => ({
    id: nextId(store, 'activity'),
    shortDescription: `Activity ${a}`,
    longDescription: `Description ${a}`,
    maxActivityVolunteers: 0,
    maxSlotVolunteersDefault: 0,
    priority: a,
    // A slot row exists iff it is enabled — there is no `enabled` column.
    slots: windowList
      .map((w, i) => (isEnabled(a, i)
        ? { window: w.id, maxSlotVolunteers: 0, rsvps: [], rsvpCount: 0 }
        : null))
      .filter(Boolean),
  }));

  const detailList = details.map((d, i) => ({
    id: nextId(store, 'detail'),
    type: d.type ?? 'STRING',
    label: d.label,
    hint: d.hint ?? '',
    priority: i,
    required: Boolean(d.required),
  }));

  const event = {
    id,
    admin,
    shortDescription: title,
    longDescription: description,
    emailOnSubmission: false,
    allowMultiUserSignups,
    isPublished,
    expired,
    activities: activityList,
    windows: windowList,
    details: detailList,
    volunteers: volunteers.map((v) => ({
      id: nextId(store, 'volunteer'),
      name: v.name,
      user: v.user ?? null,
      remindersEnabled: false,
      details: v.details ?? [],
    })),
  };

  store.events.set(id, event);
  return event;
}

/**
 * The `GET /events/:id` shape.
 *
 * Note windows go out as `begin`/`end` here while every write uses
 * `beginTime`/`endTime`. That asymmetry is real server behavior and the whole
 * reason the frontend has a DTO layer, so the fake must reproduce it rather
 * than quietly normalize it.
 */
export function serializeEventRead(event, { actor = null } = {}) {
  const owns = actor !== null && actor === event.admin;

  return {
    id: event.id,
    admin: event.admin,
    shortDescription: event.shortDescription,
    longDescription: event.longDescription,
    emailOnSubmission: event.emailOnSubmission,
    allowMultiUserSignups: event.allowMultiUserSignups,
    isPublished: event.isPublished,
    activities: event.activities.map((a) => ({ ...a, slots: a.slots.map((s) => ({ ...s })) })),
    windows: event.windows.map((w) => ({ id: w.id, begin: w.begin, end: w.end })),
    details: event.details.map((d) => ({ ...d })),
    // The server filters volunteers the caller may not see. A guest gets an
    // empty list but still sees the per-slot rsvp id lists, so the grid has to
    // render counts rather than names.
    volunteers: owns
      ? event.volunteers.map((v) => ({ ...v }))
      : event.volunteers.filter((v) => v.user !== null && v.user === actor).map((v) => ({ ...v })),
    volunteersMaxed: event.allowMultiUserSignups || owns
      ? false
      : event.volunteers.length >= 1,
    expired: event.expired,
  };
}

export const findWindow = (event, windowId) => event.windows.find((w) => w.id === windowId);
export const findActivity = (event, activityId) => event.activities.find((a) => a.id === activityId);
export const findSlot = (activity, windowId) => activity?.slots.find((s) => s.window === windowId);

export { randomUUID };
