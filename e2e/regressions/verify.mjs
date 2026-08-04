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

// --- short codes ------------------------------------------------------------

console.log('\nan event resolves by its short code as well as by its UUID');

{
  const event = await createEvent(api, { auth, title: 'Code Me' });

  const byUuid = await api('GET', `/v1/events/${event.id}`, { auth });
  const code = byUuid.payload?.event?.code;
  check(
    typeof code === 'string' && code.length === 8,
    'a new event is given an eight-character code',
    `got ${JSON.stringify(code)}`,
  );

  // Every spelling a human might produce has to reach the same event. The
  // ambiguity folding is only exercised when the generated code happens to
  // contain a 0 or a 1, so the spellings that are always exercised are the ones
  // that matter most: case, hyphen, spaces, punctuation.
  const spellings = [
    code,
    code.toLowerCase(),
    `${code.slice(0, 4)}-${code.slice(4)}`,
    `${code.slice(0, 4).toLowerCase()}-${code.slice(4).toLowerCase()}`,
    `${code.slice(0, 4)} ${code.slice(4)}`,
    code.split('').join('.'),
    // And the foldings, applied to whichever characters this code happens to
    // have. `0`->`O` and `1`->`I` are the reverse of what a reader does.
    code.replace(/0/g, 'O').replace(/1/g, 'I'),
    code.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'l'),
  ];

  for (const spelling of spellings) {
    const res = await api('GET', `/v1/events/${encodeURIComponent(spelling)}`, { auth });
    sane(res, `resolving by ${JSON.stringify(spelling)}`);
    check(
      res.payload?.event?.id === event.id,
      `the code resolves when spelled ${JSON.stringify(spelling)}`,
      `got ${res.status}: ${res.payload?.event?.id}`,
    );
  }

  // A code nobody holds is a clean 404, not a 500 and not somebody else's event.
  const unknown = await api('GET', '/v1/events/ZZZZ-ZZZZ', { auth });
  sane(unknown, 'resolving an unknown code');
  check(unknown.status === 404, 'an unknown code is a 404', `got ${unknown.status}`);

  // A stray U leaves seven symbols, so it is not a code at all.
  const strayU = await api('GET', '/v1/events/ABCDEFGU', { auth });
  sane(strayU, 'resolving a code with a stray U');
  check(strayU.status === 404, 'a code containing U is a 404', `got ${strayU.status}`);

  // The code works on more than the read endpoint -- resolveEvent is shared, so
  // this is really checking that every :event endpoint went through it.
  const patched = await api('PATCH', `/v1/events/${code.toLowerCase()}`, {
    auth,
    body: { shortDescription: 'Renamed By Code' },
  });
  check(
    patched.status === 200,
    'an event can be edited by its code, not only read',
    `got ${patched.status}: ${patched.payload?.info}`,
  );
}

console.log('\ncodes are unique and stable');

{
  const codes = new Set();
  for (let i = 0; i < 12; i++) {
    const event = await createEvent(api, { auth, title: `Unique ${i}` });
    const read = await api('GET', `/v1/events/${event.id}`, { auth });
    codes.add(read.payload?.event?.code);
  }
  check(codes.size === 12, 'twelve events get twelve distinct codes', `got ${codes.size}`);

  // A code is what people have written down, so editing an event must not
  // reissue it.
  const event = await createEvent(api, { auth, title: 'Stable' });
  const before = (await api('GET', `/v1/events/${event.id}`, { auth })).payload.event.code;
  await api('PATCH', `/v1/events/${event.id}`, { auth, body: { shortDescription: 'Stable II' } });
  const after = (await api('GET', `/v1/events/${event.id}`, { auth })).payload.event.code;
  check(before === after, 'the code survives an edit', `${before} -> ${after}`);
}

console.log('\na nullable field can actually be cleared');

{
  // The timezone select offers "each viewer's own zone" and the reminder lead
  // time offers "use the global one", and neither could be chosen: both columns
  // are nullable, but a JSON null was a 400 -- `JSONDeserializer.has` answers
  // true for `JSONObject.NULL` while every typed getter then fails its cast --
  // so the client omitted the key instead. The select moved, nothing was sent,
  // and a reload put it back.
  const event = await createEvent(api, { auth, title: 'Clearable' });

  const set = await api('PATCH', `/v1/events/${event.id}`, {
    auth,
    body: { timezone: 'America/Chicago', reminderLeadTime: 120 },
  });
  sane(set, 'setting a zone and a lead time');
  check(set.status === 200, 'a zone and lead time can be set', `got ${set.status}`);

  const read = async () => (await api('GET', `/v1/events/${event.id}`, { auth })).payload.event;

  const withValues = await read();
  check(withValues.timezone === 'America/Chicago', 'the zone is stored',
    `got ${withValues.timezone}`);
  check(withValues.reminderLeadTime === 120, 'the lead time is stored',
    `got ${withValues.reminderLeadTime}`);

  const cleared = await api('PATCH', `/v1/events/${event.id}`, {
    auth,
    body: { timezone: null, reminderLeadTime: null },
  });
  sane(cleared, 'clearing a zone and a lead time');
  check(
    cleared.status === 200,
    'an explicit null is accepted rather than a 400',
    `got ${cleared.status}: ${cleared.payload?.info}`,
  );

  // Absent rather than null on the wire: org.json's `put(key, null)` removes
  // the key outright, so every nullable field in this payload simply vanishes
  // when it is unset. `eventSummaryFromApi` already reads it that way with
  // `?? null`. What matters here is that the old value is gone, not which of
  // the two spellings of "nothing" comes back.
  const emptied = await read();
  check(
    (emptied.timezone ?? null) === null,
    'the zone is actually cleared',
    `got ${JSON.stringify(emptied.timezone)} -- still set, so the null was swallowed`,
  );
  check(
    (emptied.reminderLeadTime ?? null) === null,
    'the lead time is actually cleared',
    `got ${JSON.stringify(emptied.reminderLeadTime)}`,
  );

  // Omitting the key must still mean "leave it alone" -- that is the whole
  // distinction, and conflating the two would silently wipe a zone on every
  // unrelated edit.
  await api('PATCH', `/v1/events/${event.id}`, {
    auth,
    body: { timezone: 'Europe/London' },
  });
  await api('PATCH', `/v1/events/${event.id}`, {
    auth,
    body: { shortDescription: 'Clearable II' },
  });
  const untouched = await read();
  check(
    untouched.timezone === 'Europe/London',
    'an absent key leaves the zone alone',
    `got ${untouched.timezone}`,
  );

  // And a bad value is still a 400, so accepting null did not open the gate.
  const nonsense = await api('PATCH', `/v1/events/${event.id}`, {
    auth,
    body: { timezone: 'Mars/Olympus_Mons' },
  });
  check(nonsense.status === 400, 'an unknown zone is still refused', `got ${nonsense.status}`);
}

finish('regressions');
