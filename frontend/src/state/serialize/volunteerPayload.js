/**
 * Volunteer request bodies.
 *
 * Two server quirks shape this. `rsvps` is declared optional but read
 * unconditionally, so omitting it NPEs into a 500 — it is always sent, even
 * empty. And detail values are matched against fully-anchored patterns, so a
 * blank optional answer must be omitted rather than sent as an empty string.
 *
 * See docs/legacy/03-api-contract.md §2.
 */
import { DETAIL_TYPES } from '../../lib/validation/detailTypes.js';

/**
 * Detail answers in wire form, keyed by server id.
 *
 * @param {Map<string, unknown>} values detailKey -> raw value
 * @param {Array} details the event's details
 */
function serializeDetails(values, details) {
  const out = [];
  for (const detail of details) {
    if (!detail.id) continue; // not yet persisted; nothing to reference
    const spec = DETAIL_TYPES[detail.type];
    if (!spec) continue;

    const raw = values.get(detail.key);
    // isOmittable, not isBlank: the two coincide for text-like types but differ
    // for booleans, where "unticked" is an answer rather than a non-answer.
    const omittable = spec.isOmittable ?? spec.isBlank;
    if (omittable(raw)) continue;

    out.push({ detail: detail.id, value: spec.serialize(raw) });
  }
  return out;
}

/**
 * Which slots a volunteer is claiming, as (activity, window) id pairs.
 * Slots have no id of their own — they are addressed positionally.
 */
function serializeRsvps(volunteer, activities) {
  const out = [];
  for (const activity of activities) {
    if (!activity.id) continue;
    for (const slot of activity.slots.values()) {
      if (!volunteer.rsvps.has(slot.key)) continue;
      const win = slot.windowKey;
      out.push({ activityKey: activity.key, activityId: activity.id, windowKey: win });
    }
  }
  return out;
}

/**
 * Attaches the reminder address, when there is one to attach.
 *
 * Omitted rather than sent blank on two counts. The server validates it against
 * an anchored pattern, so `""` is a 400 rather than "no address given"; and when
 * a signed-in volunteer leaves it empty the server is meant to fall back to
 * their account address, which it can only do if the key is absent.
 *
 * Also lowercased, because the server's email pattern is case-sensitive.
 */
function applyReminderEmail(payload, volunteer) {
  if (!payload.remindersEnabled) return payload;
  const email = (volunteer.reminderEmail ?? '').trim().toLowerCase();
  if (email) payload.reminderEmail = email;
  return payload;
}

/**
 * Body for `POST /events/:event/volunteers`.
 *
 * @param {object} volunteer
 * @param {object} ctx
 * @param {Array}  ctx.details
 * @param {Array}  ctx.activities
 * @param {Array}  ctx.windows
 * @param {string|null} ctx.account link the volunteer to this account, if signed in
 */
export function volunteerCreatePayload(volunteer, { details, activities, windows, account }) {
  const windowIdByKey = new Map(windows.map((w) => [w.key, w.id]));

  const rsvps = serializeRsvps(volunteer, activities)
    .map(({ activityId, windowKey }) => ({
      activity: activityId,
      window: windowIdByKey.get(windowKey),
    }))
    .filter((r) => r.activity && r.window);

  const payload = {
    name: volunteer.name,
    remindersEnabled: Boolean(volunteer.remindersEnabled),
    details: serializeDetails(volunteer.values, details),
    // Always present: the server dereferences this without checking.
    rsvps,
  };
  if (account) payload.user = account;
  applyReminderEmail(payload, volunteer);
  return payload;
}

/**
 * Body for `PATCH /events/:event/volunteers/:volunteer`.
 *
 * Supplying `details` replaces the whole set server-side and re-runs the
 * required-field check, so it is only included when the caller means to.
 * Neither `id` nor `rsvps` belongs here — the legacy leaked both whenever the
 * event happened to have no details, because the statements that deleted them
 * sat inside a loop over those details.
 */
export function volunteerUpdatePayload(volunteer, { details, includeDetails = true } = {}) {
  const payload = {
    name: volunteer.name,
    remindersEnabled: Boolean(volunteer.remindersEnabled),
  };
  if (includeDetails && details) {
    payload.details = serializeDetails(volunteer.values, details);
  }
  applyReminderEmail(payload, volunteer);
  return payload;
}
