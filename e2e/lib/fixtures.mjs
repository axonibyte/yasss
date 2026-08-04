/**
 * Building events to test against.
 *
 * Every driver needs an event with a known shape, and building one through
 * `POST /v1/events` then reading it back through `GET /v1/events/:id` is
 * fiddly enough -- the write payload indexes windows positionally while the
 * read returns ids, and the two use different key names for the same field --
 * that three copies of it had already started to diverge.
 */

/** A window that begins `hoursAhead` from now and runs for an hour. */
function windowSpec(hoursAhead) {
  const begin = Date.now() + hoursAhead * 60 * 60 * 1000;
  // Stringified deliberately: `JSONDeserializer.getTimestamp` calls `getString`
  // first, so a JSON number is a 400 rather than an epoch.
  return { beginTime: String(begin), endTime: String(begin + 3600_000) };
}

/**
 * Creates an event and returns its resolved ids.
 *
 * `activities` entries take `{ label, maxActivityVolunteers, slots }`, where
 * `slots` is a list of `{ window, cap }` naming windows by *index*. Omitting
 * `slots` enables the activity in every window with no cap.
 *
 * Returns `{ id, windows: [id], activities: [{ id, label, slots: [{ window, cap }] }] }`,
 * with every window referred to by id, because that is what every endpoint
 * downstream of creation wants.
 */
export async function createEvent(api, {
  title,
  auth,
  windowCount = 1,
  hoursAhead = 24,
  activities = [{ label: 'Setup' }],
  details = [],
  allowMultiUserSignups = true,
  ...rest
} = {}) {
  const windows = Array.from({ length: windowCount }, (_, i) => windowSpec(hoursAhead + i));

  const created = await api('POST', '/v1/events', {
    auth,
    body: {
      shortDescription: title,
      longDescription: '',
      allowMultiUserSignups,
      details,
      windows,
      activities: activities.map((a) => ({
        shortDescription: a.label,
        ...(a.maxActivityVolunteers === undefined
          ? {}
          : { maxActivityVolunteers: a.maxActivityVolunteers }),
        slots: (a.slots ?? windows.map((_, w) => ({ window: w }))).map((s) => ({
          enabled: true,
          window: s.window,
          ...(s.cap === undefined ? {} : { maxSlotVolunteers: s.cap }),
        })),
      })),
      ...rest,
    },
  });

  const id = created.payload?.event?.id;
  if (!id) {
    throw new Error(
      `could not create the fixture event (${created.status}): ${JSON.stringify(created.payload)}`,
    );
  }

  return { id, ...(await readEvent(api, id, auth)) };
}

/** Re-reads an event into the same shape `createEvent` returns. */
export async function readEvent(api, id, auth) {
  const res = await api('GET', `/v1/events/${id}`, { auth });
  const event = res.payload?.event;
  if (!event) {
    throw new Error(`could not read event ${id} (${res.status}): ${JSON.stringify(res.payload)}`);
  }

  return {
    windows: event.windows.map((w) => w.id),
    activities: event.activities.map((a) => ({
      id: a.id,
      label: a.shortDescription,
      maxActivityVolunteers: a.maxActivityVolunteers,
      slots: a.slots.map((s) => ({
        window: s.window,
        cap: s.maxSlotVolunteers,
        rsvpCount: s.rsvpCount,
      })),
    })),
    volunteers: event.volunteers ?? [],
  };
}

/**
 * Signs one volunteer up, optionally claiming slots in the same request.
 *
 * `rsvps` entries are `{ activity, window }` ids -- the shape
 * `AddVolunteerEndpoint` expects.
 */
export function addVolunteer(api, eventId, { name, auth, rsvps = [], details = [], ...rest }) {
  return api('POST', `/v1/events/${eventId}/volunteers`, {
    auth,
    body: { name, details, rsvps, ...rest },
  });
}
