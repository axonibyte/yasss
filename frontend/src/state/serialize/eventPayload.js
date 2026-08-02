/**
 * The `POST /v1/events` body: an entire event graph in one request.
 *
 * The slot rules here are the single most dangerous part of the contract.
 * `CreateEventEndpoint` commits a slot for every (activity, window) pair unless
 * an explicit `{enabled: false}` says otherwise — omission *enables*. The
 * legacy walked its flat slot array with a stride of `windows.length` where the
 * array was laid out with a stride of `activities.length`, so for any event
 * where those differed it emitted the wrong slots, and every pair it skipped
 * was then silently switched on by the server.
 *
 * So: one explicit entry per pair, always. Windows are referenced by array
 * index rather than id, since nothing has an id yet.
 *
 * See docs/legacy/01-behavior.md §5.1 and 03-api-contract.md §2.
 */

/**
 * @param {object} event
 * @param {string|null} account set as the event's admin when signed in
 */
export function eventCreatePayload(event, { account = null } = {}) {
  const windowIndex = new Map(event.windows.map((w, i) => [w.key, i]));

  const payload = {
    shortDescription: event.title,
    longDescription: event.description ?? '',
    emailOnSubmission: Boolean(event.notifyOnSignup),
    allowMultiUserSignups: Boolean(event.allowMultiuserSignups),

    activities: event.activities.map((activity, i) => {
      const out = {
        shortDescription: activity.label,
        // Array position is the display order; the server sorts on it and
        // falls back to alphabetical when priorities collide.
        priority: i,
      };
      if (activity.description) out.longDescription = activity.description;
      if (activity.volunteerCap) out.maxActivityVolunteers = activity.volunteerCap;
      if (activity.slotCapDefault) out.maxSlotVolunteersDefault = activity.slotCapDefault;

      // One entry per window, every time. Never rely on omission.
      out.slots = event.windows.map((win) => {
        const slot = activity.slots.get(win.key);
        const entry = {
          enabled: Boolean(slot?.enabled),
          window: windowIndex.get(win.key),
        };
        // Only send a per-slot cap when it differs from the activity default;
        // the server falls back to that default on its own.
        if (slot?.enabled && slot.cap && slot.cap !== activity.slotCapDefault) {
          entry.maxSlotVolunteers = slot.cap;
        }
        return entry;
      });

      return out;
    }),

    windows: event.windows.map((win) => ({
      // Stringified epoch millis, which the server's timestamp parser accepts.
      beginTime: String(win.begin.getTime()),
      endTime: String(win.end.getTime()),
    })),

    details: event.details.map((detail, i) => {
      const out = {
        type: detail.type,
        label: detail.label,
        priority: i,
      };
      if (detail.hint) out.hint = detail.hint;
      if (detail.required) out.required = true;
      return out;
    }),
  };

  if (account) payload.admin = account;
  return payload;
}
