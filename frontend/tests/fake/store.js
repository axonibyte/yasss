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
    users: new Map(), // id -> {id, email, pendingEmail, pubkey, accessLevel, verifyToken}
    events: new Map(), // id -> event
    /** Deterministic ids make failures readable. */
    seq: 0,
    /** Addresses that unsubscribed, platform-wide. */
    suppressed: new Set(),
    /** Everything the fake would have mailed, newest last. */
    mail: [],
  };
}

/** Finds a volunteer across the store, or null. */
export function findVolunteer(store, eventId, volunteerId) {
  const event = store.events.get(eventId);
  return event?.volunteers.find((v) => v.id === volunteerId) ?? null;
}

export const nextId = (store, prefix) => `${prefix}-${String(++store.seq).padStart(4, '0')}`;

/**
 * Seed a user.
 *
 * The default email is derived from the allocated id rather than being a fixed
 * literal, and that is load-bearing rather than tidy: identity is now resolved
 * by email, so two specs seeding a default user under parallel workers would
 * otherwise create two accounts sharing an address and `find` would return
 * whichever came first — reintroducing exactly the cross-worker ambiguity the
 * per-request decoding removes.
 */
export function seedUser(store, {
  email, accessLevel = 'STANDARD', pubkey = 'PUBKEY', pendingEmail = null, verifyToken = null,
} = {}) {
  const id = nextId(store, 'user');
  store.users.set(id, {
    id,
    // An UNVERIFIED account has no verified address yet -- the one it
    // registered with is pending until the emailed link is clicked.
    email: accessLevel === 'UNVERIFIED' ? null : (email ?? `${id}@example.com`),
    pendingEmail: accessLevel === 'UNVERIFIED'
      ? (pendingEmail ?? email ?? `${id}@example.com`)
      : pendingEmail,
    pubkey,
    accessLevel,
    // An account that registered is always waiting on a link, so seeding one
    // UNVERIFIED without a token would model a state the server never produces.
    verifyToken: verifyToken ?? (accessLevel === 'UNVERIFIED' ? randomUUID() : null),
    /**
     * Bumped by /__test__/rotate-signer so this user's next minted session
     * token differs. Models the real ticket engine rolling its signing key.
     *
     * Per user for the same reason the default email is: as one number on the
     * store, one worker rolling the key changed the token every other worker
     * was about to be handed. That is the shape of the global `pendingLogin`
     * this fake was rebuilt to remove -- see the header of auth.js -- and it
     * only went unnoticed because a single spec touches it.
     */
    signerEpoch: 0,
  });
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
  /** IANA zone; null means each viewer renders in their own. */
  timezone = null,
  /** Explicit window instants, for specs that assert on rendered times. */
  windowTimes = null,
  /** Minutes of notice for reminders; null uses the platform default. */
  reminderLeadTime = null,
  /** Short, human-copyable identifier; the real server assigns one on save. */
  code = null,
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
    begin: windowTimes?.[i]?.begin ?? Date.UTC(2030, 0, 1 + i, 14),
    end: windowTimes?.[i]?.end ?? Date.UTC(2030, 0, 1 + i, 22),
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
    code,
    timezone,
    reminderLeadTime,
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
      reminderEmail: null,
      reminderState: 'NONE',
      reminderToken: null,
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
/** Ascending `priority`, ties broken by insertion order to stay deterministic. */
const byPriority = (list) => list
  .map((item, i) => ({ item, i }))
  .sort((a, b) => (a.item.priority ?? 0) - (b.item.priority ?? 0) || a.i - b.i)
  .map(({ item }) => item);

/**
 * The volunteer shape the server actually emits.
 *
 * `reminderEmail` and `reminderToken` are deliberately withheld: the real server
 * emits only whether a confirmed address exists, so an organiser reading their
 * own event cannot harvest volunteers' contact details. Spreading the stored
 * record here would hand the frontend a field it must never learn to rely on.
 */
function serializeVolunteer(v) {
  const { reminderEmail, reminderState, reminderToken, ...rest } = v;
  return { ...rest, reminderConfirmed: reminderState === 'CONFIRMED' };
}

export function serializeEventRead(event, { actor = null } = {}) {
  const owns = actor !== null && actor === event.admin;

  return {
    id: event.id,
    admin: event.admin,
    timezone: event.timezone ?? null,
    code: event.code ?? null,
    reminderLeadTime: event.reminderLeadTime ?? null,
    shortDescription: event.shortDescription,
    longDescription: event.longDescription,
    emailOnSubmission: event.emailOnSubmission,
    allowMultiUserSignups: event.allowMultiUserSignups,
    isPublished: event.isPublished,
    // Sorted by priority, as the real server does (Event.java:656, 759). The
    // fake used to return insertion order, which hid the fact that reordering
    // has to push `priority` to survive a reload -- a purely local reorder
    // looked correct here and reverted against the real server.
    activities: byPriority(event.activities)
      .map((a) => ({ ...a, slots: a.slots.map((s) => ({ ...s })) })),
    // Windows have no priority column and are ordered by begin_time.
    windows: [...event.windows]
      .sort((a, b) => a.begin - b.begin)
      .map((w) => ({ id: w.id, begin: w.begin, end: w.end })),
    details: byPriority(event.details).map((d) => ({ ...d })),
    // The server filters volunteers the caller may not see. A guest gets an
    // empty list but still sees the per-slot rsvp id lists, so the grid has to
    // render counts rather than names.
    volunteers: owns
      ? event.volunteers.map(serializeVolunteer)
      : event.volunteers
          .filter((v) => v.user !== null && v.user === actor)
          .map(serializeVolunteer),
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
