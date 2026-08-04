/**
 * Specific defects, pinned so they stay fixed.
 *
 * Everything here was found by reading rather than by a failing test, and every
 * one of them needs a real database to demonstrate — a wrong table name, a
 * foreign key that was never declared, an integer that overflows into a
 * negative SQL offset. They are grouped by the bug rather than by the endpoint,
 * because the bug is what a reader will be looking for.
 *
 * Env: YASSS_API, YASSS_ADMIN_EMAIL, YASSS_ADMIN_PASSWORD.
 */
import { isUnhandled, makeApi } from '../lib/api.mjs';
import { check, finish } from '../lib/check.mjs';
import { adminAuth } from '../lib/creds.mjs';
import { addVolunteer, createEvent, readEvent } from '../lib/fixtures.mjs';

const api = makeApi();
const auth = await adminAuth();

/** No response anywhere in this driver may be a 5xx. */
function sane(res, what) {
  if (res.status >= 500 || isUnhandled(res)) {
    return check(false, what, `${res.status}: ${JSON.stringify(res.payload ?? res.text)}`);
  }
  return true;
}

// --- deletion ---------------------------------------------------------------

console.log('\nan event can actually be deleted');

{
  // `Event.delete()` issued `DELETE FROM user WHERE id = ?` -- the wrong table --
  // bound with the event's id, so it matched nothing, deleted nothing, and the
  // endpoint reported success anyway. Event deletion had never worked.
  const event = await createEvent(api, { auth, title: 'Delete Me' });

  const deleted = await api('DELETE', `/v1/events/${event.id}`, { auth });
  sane(deleted, 'deleting an event');
  check(deleted.status === 200, 'the delete is accepted', `got ${deleted.status}`);

  const after = await api('GET', `/v1/events/${event.id}`, { auth });
  check(
    after.status === 404,
    'the event is actually gone afterwards',
    `got ${after.status} -- the row survived, so the delete hit the wrong table again`,
  );
}

console.log('\ndeleting a slot takes its RSVPs with it');

{
  // `rsvp` was foreign-keyed to activity, event_window and volunteer but never
  // to `slot`, so unsetting a slot orphaned every RSVP in it. The orphans still
  // counted toward the caps, and a missing slot row reads as "full" -- so the
  // next volunteer was told the slot was over capacity when it no longer
  // existed at all.
  const event = await createEvent(api, {
    auth,
    title: 'Orphan Check',
    activities: [{ label: 'Setup', slots: [{ window: 0, cap: 1 }] }],
  });
  const activity = event.activities[0].id;
  const window = event.windows[0];

  const signed = await addVolunteer(api, event.id, {
    auth,
    name: 'Claimant',
    rsvps: [{ activity, window }],
  });
  check(signed.status === 201, 'a volunteer claims the seat', `got ${signed.status}`);

  const unset = await api('DELETE', `/v1/events/${event.id}/activities/${activity}/windows/${window}`, { auth });
  sane(unset, 'unsetting the slot');

  // Re-enable the same slot. If the old RSVP survived, it still counts against
  // the cap of one and this signup is refused for a seat nobody holds.
  const reset = await api('PUT', `/v1/events/${event.id}/activities/${activity}/windows/${window}`, {
    auth,
    body: { enabled: true, maxSlotVolunteers: 1 },
  });
  sane(reset, 're-enabling the slot');

  const after = await readEvent(api, event.id, auth);
  const slot = after.activities[0].slots.find((s) => s.window === window);
  check(
    (slot?.rsvpCount ?? 0) === 0,
    'the re-created slot starts empty rather than inheriting orphans',
    `rsvpCount is ${slot?.rsvpCount}`,
  );
}

// --- input bounds -----------------------------------------------------------

console.log('\nclient mistakes are 400s, not 500s');

{
  const oversize = 'x'.repeat(256);

  const activityDesc = await api('POST', '/v1/events', {
    auth,
    body: {
      shortDescription: 'Long Activity Note',
      longDescription: '',
      details: [],
      windows: [],
      activities: [{ shortDescription: 'Setup', longDescription: oversize }],
    },
  });
  check(
    activityDesc.status === 400,
    "an activity's over-long description on create is a 400",
    `got ${activityDesc.status}: ${activityDesc.payload?.info}`,
  );

  const base = await createEvent(api, { auth, title: 'Bounds' });
  const added = await api('POST', `/v1/events/${base.id}/activities`, {
    auth,
    body: { shortDescription: 'Setup', longDescription: oversize },
  });
  check(
    added.status === 400,
    "an activity's over-long description on add is a 400",
    `got ${added.status}: ${added.payload?.info}`,
  );

  // A client-supplied array index, used raw. Out of range threw
  // ArrayIndexOutOfBoundsException, which no handler here catches.
  for (const window of [1, -1, 99]) {
    const badIndex = await api('POST', '/v1/events', {
      auth,
      body: {
        shortDescription: `Bad Window ${window}`,
        longDescription: '',
        details: [],
        windows: [{ beginTime: String(Date.now() + 86_400_000) }],
        activities: [{ shortDescription: 'Setup', slots: [{ enabled: true, window }] }],
      },
    });
    check(
      badIndex.status === 400,
      `a slot naming window index ${window} is a 400`,
      `got ${badIndex.status}: ${badIndex.payload?.info}`,
    );
  }
}

console.log('\npagination cannot overflow into a negative offset');

for (const query of ['?limit=2000000000', '?page=2000000000&limit=100', '?limit=201', '?limit=0']) {
  const res = await api('GET', `/v1/events${query}`, { auth });
  sane(res, `listing events with ${query}`);
  check(
    res.status === 400,
    `${query} is refused with a 400`,
    `got ${res.status}: ${res.payload?.info}`,
  );
}

check(
  (await api('GET', '/v1/events?limit=200&page=1', { auth })).status === 200,
  'the largest permitted page size is still served',
);

// --- accounts ---------------------------------------------------------------

console.log('\naddresses are accepted whatever their case');

{
  // Detail.Type.EMAIL's pattern is lowercase-only, and these paths validated the
  // raw input -- so registering as anything with a capital letter in it was a
  // flat 400.
  const mixed = `Mixed.Case.${Date.now()}@Example.COM`;
  const created = await api('POST', '/v1/users', {
    auth,
    body: { email: mixed, pubkey: Buffer.alloc(32).toString('base64') },
  });
  check(
    created.status === 201,
    'a mixed-case address registers',
    `got ${created.status}: ${created.payload?.info}`,
  );
  check(
    created.payload?.user?.email === mixed.toLowerCase()
      || created.payload?.user?.pendingEmail === mixed.toLowerCase(),
    'and is stored lowercased',
    JSON.stringify(created.payload?.user),
  );
}

{
  // Well-formed base64 of the wrong length overflowed BINARY(32) and came back
  // a 500. This was the one credential path missing validPubkey.
  const res = await api('POST', `/v1/users/${process.env.YASSS_ADMIN_ID}`, {
    body: { token: '00000000-0000-0000-0000-000000000000', pubkey: Buffer.alloc(40).toString('base64') },
  });
  sane(res, 'resetting with an over-long pubkey');
  check(
    res.status === 400 || res.status === 403,
    'an over-long reset pubkey is a 400 or 403, never a 500',
    `got ${res.status}: ${res.payload?.info}`,
  );
}

// --- ownership --------------------------------------------------------------

console.log('\nan event cannot be handed to an account that does not exist');

{
  const event = await createEvent(api, { auth, title: 'Reassign' });

  const ghost = await api('PATCH', `/v1/events/${event.id}`, {
    auth,
    body: { admin: '00000000-0000-0000-0000-000000000000' },
  });
  sane(ghost, 'reassigning to a nonexistent account');
  check(
    ghost.status === 404,
    'reassigning to an unknown account is a 404, not a foreign-key 500',
    `got ${ghost.status}: ${ghost.payload?.info}`,
  );

  const still = await readEvent(api, event.id, auth);
  check(still.activities.length >= 0, 'and the event still reads back');
}

console.log('\nan anonymous viewer sees how full a slot is, but not who is in it');

{
  const event = await createEvent(api, {
    auth,
    title: 'Privacy And Counts',
    activities: [{ label: 'Setup', slots: [{ window: 0 }] }],
  });
  const activity = event.activities[0].id;
  const window = event.windows[0];

  await addVolunteer(api, event.id, {
    auth,
    name: 'Ada',
    rsvps: [{ activity, window }],
  });

  // Anonymous: no auth header at all.
  const seen = await api('GET', `/v1/events/${event.id}`);
  sane(seen, 'reading the event anonymously');
  const slot = seen.payload?.event?.activities?.[0]?.slots?.[0];

  // The count is what a volunteer needs to decide whether to sign up, and it
  // was briefly broken by deriving it from the very array being filtered.
  check(
    slot?.rsvpCount === 1,
    'the headcount is visible anonymously',
    `rsvpCount is ${slot?.rsvpCount}`,
  );
  check(
    (slot?.rsvps ?? []).length === 0,
    'but the volunteer ids are not',
    `got ${JSON.stringify(slot?.rsvps)}`,
  );
  check(
    (seen.payload?.event?.volunteers ?? []).length === 0,
    'and neither is the volunteer list, as before',
    `got ${(seen.payload?.event?.volunteers ?? []).length} volunteers`,
  );

  // The organiser still sees everything.
  const owned = await api('GET', `/v1/events/${event.id}`, { auth });
  const ownedSlot = owned.payload?.event?.activities?.[0]?.slots?.[0];
  check(
    (ownedSlot?.rsvps ?? []).length === 1,
    'the organiser still sees the ids',
    `got ${JSON.stringify(ownedSlot?.rsvps)}`,
  );
}

finish('regressions');
