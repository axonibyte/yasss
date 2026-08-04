/**
 * Volunteer capacity under concurrent claims.
 *
 * Three defects live here, and only two of them need concurrency to see:
 *
 *   - `SetRSVPEndpoint` checked capacity with `Slot.countRSVPs()` and
 *     `Activity.countRSVPs()` -- each on its own pooled connection -- and then
 *     committed the RSVP on a third. Nothing held a lock or a transaction
 *     across the three, so two claimants for the last seat both read the same
 *     count, both passed the guard, and both inserted.
 *
 *   - `AddVolunteerEndpoint`, which is the endpoint the signup form actually
 *     uses, never checked capacity at all. A single ordinary request naming a
 *     full slot overfilled it. No race required; scenario C is that one, and it
 *     is the more serious of the two.
 *
 *   - the per-identity cap, with `allowMultiUserSignups` off, read
 *     `countVolunteers` and then committed with nothing holding the gap, so
 *     several simultaneous signups from one address all counted zero. Scenario
 *     H; 2 to 8 of 16 used to get through.
 *
 * All three are now one transaction per signup, locking the event row (when
 * the identity cap applies) and then activity rows in id order.
 *
 * The oracle throughout is the event's own `rsvpCount`, read back through
 * `GET /v1/events/:id`. That is the number the organiser sees and the number
 * the cap is about, so it is the one worth asserting on -- counting 201s alone
 * would miss a fix that answers correctly and stores wrongly.
 *
 * ROUNDS
 *
 * Every scenario runs `ROUNDS` times against a freshly built event. A race that
 * passes once has proved nothing: the failure mode is a timing window, and a
 * single green run is as likely to mean the requests happened to serialise as
 * it is to mean they cannot overlap.
 *
 * Env: YASSS_API, YASSS_ADMIN_EMAIL, YASSS_ADMIN_PASSWORD.
 */
import { isUnhandled, makeApi } from '../lib/api.mjs';
import { check, finish } from '../lib/check.mjs';
import { adminAuth } from '../lib/creds.mjs';
import { addVolunteer, createEvent, readEvent } from '../lib/fixtures.mjs';

const api = makeApi();
const auth = await adminAuth();

const N = Number(process.env.CONCURRENCY_N ?? 16);
const ROUNDS = Number(process.env.CONCURRENCY_ROUNDS ?? 5);

/**
 * The two cap failures differ by one word and by 32 in status:
 * `409 volunteer cap exceeded` is a full slot, `412 volunteer cap reached` is
 * the per-identity multi-signup limit. Asserting on only one of the two fields
 * would let a test pass for entirely the wrong reason.
 */
const isCapExceeded = (r) => r.status === 409 && r.payload?.info === 'volunteer cap exceeded';

/** No response, in any scenario, may be a 5xx or an unhandled exception. */
function noneCrashed(results, what) {
  const bad = results.filter((r) => r.status >= 500 || isUnhandled(r));
  return check(
    bad.length === 0,
    what,
    bad.map((r) => `${r.status}: ${r.payload?.info ?? r.text?.slice(0, 120)}`).join('\n      '),
  );
}

/** Fires `n` requests built by `make` as simultaneously as one process can. */
function stampede(n, make) {
  // Built in one synchronous loop so every request is in flight before any
  // `await` yields; awaiting inside the loop would serialise them and the
  // whole stage would prove nothing.
  return Promise.all(Array.from({ length: n }, (_, i) => make(i)));
}

const tally = (results) => ({
  created: results.filter((r) => r.status === 201).length,
  capped: results.filter(isCapExceeded).length,
  other: results.filter((r) => r.status !== 201 && !isCapExceeded(r)),
});

/** A fresh event: one single-seat slot, one two-seat activity, one uncapped. */
function fixture(round) {
  return createEvent(api, {
    auth,
    title: `Concurrency ${round}`,
    windowCount: 2,
    activities: [
      { label: 'One Seat', slots: [{ window: 0, cap: 1 }] },
      { label: 'Two Per Activity', maxActivityVolunteers: 2, slots: [{ window: 0 }, { window: 1 }] },
      { label: 'Uncapped', slots: [{ window: 0 }] },
    ],
  });
}

const seat = (event, activity, window = 0) => ({
  activity: event.activities[activity].id,
  window: event.windows[window],
});

// --- A: concurrent SetRSVP for the last seat --------------------------------

console.log(`\nA: ${N} simultaneous RSVPs for a one-seat slot, x${ROUNDS}`);

for (let round = 0; round < ROUNDS; round++) {
  const event = await fixture(`A${round}`);
  const target = seat(event, 0);

  // Volunteers created up front and with no RSVPs, so the stampede below is
  // purely the claim and nothing else.
  const volunteers = await Promise.all(
    Array.from({ length: N }, (_, i) =>
      addVolunteer(api, event.id, { auth, name: `A${round}-${i}` })
        .then((r) => r.payload?.volunteer?.id)),
  );

  const results = await stampede(N, (i) => api(
    'PUT',
    `/v1/events/${event.id}/activities/${target.activity}/windows/${target.window}/volunteers/${volunteers[i]}`,
    { auth },
  ));

  noneCrashed(results, `A${round}: no request crashed`);
  const t = tally(results);
  check(t.created === 1, `A${round}: exactly one claim wins`, `${t.created} succeeded of ${N}`);
  check(
    t.other.length === 0,
    `A${round}: every loser is a 409 cap-exceeded`,
    t.other.map((r) => `${r.status} ${r.payload?.info}`).join(', '),
  );

  const after = await readEvent(api, event.id, auth);
  check(
    after.activities[0].slots[0].rsvpCount === 1,
    `A${round}: the slot holds exactly one RSVP`,
    `rsvpCount is ${after.activities[0].slots[0].rsvpCount}`,
  );
}

// --- B: concurrent signups that claim the seat in the same request ----------

console.log(`\nB: ${N} simultaneous signups claiming a one-seat slot, x${ROUNDS}`);

for (let round = 0; round < ROUNDS; round++) {
  const event = await fixture(`B${round}`);
  const target = seat(event, 0);

  const results = await stampede(N, (i) => addVolunteer(api, event.id, {
    auth,
    name: `B${round}-${i}`,
    rsvps: [target],
  }));

  noneCrashed(results, `B${round}: no request crashed`);
  const t = tally(results);
  check(t.created === 1, `B${round}: exactly one signup wins`, `${t.created} succeeded of ${N}`);
  check(
    t.other.length === 0,
    `B${round}: every loser is a 409 cap-exceeded`,
    t.other.map((r) => `${r.status} ${r.payload?.info}`).join(', '),
  );

  const after = await readEvent(api, event.id, auth);
  check(
    after.activities[0].slots[0].rsvpCount === 1,
    `B${round}: the slot holds exactly one RSVP`,
    `rsvpCount is ${after.activities[0].slots[0].rsvpCount}`,
  );
  // The volunteer row is committed before its RSVPs can be, because the RSVP
  // table is foreign-keyed to it. A rejected signup therefore has to be
  // compensated, and a leftover row here is how you would know it was not.
  check(
    after.volunteers.length === 1,
    `B${round}: rejected signups leave no volunteer behind`,
    `${after.volunteers.length} volunteers exist, expected 1`,
  );
}

// --- C: a full slot rejects an ordinary, sequential signup ------------------

console.log('\nC: a full slot refuses the next signup, with no concurrency at all');

{
  const event = await fixture('C');
  const target = seat(event, 0);

  const first = await addVolunteer(api, event.id, { auth, name: 'C-first', rsvps: [target] });
  check(first.status === 201, 'C: the first signup takes the seat', `got ${first.status}`);

  const second = await addVolunteer(api, event.id, { auth, name: 'C-second', rsvps: [target] });
  check(
    isCapExceeded(second),
    'C: the second signup is refused with 409 cap-exceeded',
    `got ${second.status}: ${second.payload?.info}`,
  );

  const after = await readEvent(api, event.id, auth);
  check(
    after.activities[0].slots[0].rsvpCount === 1,
    'C: the slot still holds exactly one RSVP',
    `rsvpCount is ${after.activities[0].slots[0].rsvpCount}`,
  );
  check(
    after.volunteers.length === 1,
    'C: the refused volunteer was not left behind',
    `${after.volunteers.length} volunteers exist, expected 1`,
  );
}

// --- D: the activity-wide cap, spread across two windows --------------------

console.log(`\nD: ${N} simultaneous signups against a two-seat activity, x${ROUNDS}`);

for (let round = 0; round < ROUNDS; round++) {
  const event = await fixture(`D${round}`);

  // Split across both windows on purpose: a fix that locks the slot rather
  // than the activity serialises each window independently and lets this
  // through at two per window rather than two per activity.
  const results = await stampede(N, (i) => addVolunteer(api, event.id, {
    auth,
    name: `D${round}-${i}`,
    rsvps: [seat(event, 1, i % 2)],
  }));

  noneCrashed(results, `D${round}: no request crashed`);
  const t = tally(results);
  check(t.created === 2, `D${round}: exactly two claims win`, `${t.created} succeeded of ${N}`);

  const after = await readEvent(api, event.id, auth);
  const total = after.activities[1].slots.reduce((sum, s) => sum + s.rsvpCount, 0);
  check(total === 2, `D${round}: the activity holds exactly two RSVPs`, `holds ${total}`);
}

// --- E: an uncapped activity must not be serialised into false rejections ---

console.log(`\nE: ${N} simultaneous signups against an uncapped activity, x${ROUNDS}`);

for (let round = 0; round < ROUNDS; round++) {
  const event = await fixture(`E${round}`);

  const results = await stampede(N, (i) => addVolunteer(api, event.id, {
    auth,
    name: `E${round}-${i}`,
    rsvps: [seat(event, 2)],
  }));

  noneCrashed(results, `E${round}: no request crashed`);
  const t = tally(results);
  check(
    t.created === N,
    `E${round}: all ${N} uncapped claims succeed`,
    `only ${t.created} succeeded; a lock-wait timeout or an over-eager guard would look like this`,
  );

  const after = await readEvent(api, event.id, auth);
  check(
    after.activities[2].slots[0].rsvpCount === N,
    `E${round}: the uncapped slot holds all ${N}`,
    `rsvpCount is ${after.activities[2].slots[0].rsvpCount}`,
  );
}

// --- F: a request naming one full slot and one free one -----------------

console.log('\nF: a signup naming a full slot and a free one is all-or-nothing');

{
  const event = await fixture('F');
  const full = seat(event, 0);
  const free = seat(event, 2);

  await addVolunteer(api, event.id, { auth, name: 'F-filler', rsvps: [full] });

  const both = await addVolunteer(api, event.id, { auth, name: 'F-both', rsvps: [full, free] });
  check(
    isCapExceeded(both),
    'F: the whole request is refused',
    `got ${both.status}: ${both.payload?.info}`,
  );

  const after = await readEvent(api, event.id, auth);
  check(
    after.activities[2].slots[0].rsvpCount === 0,
    'F: the free slot gained nothing',
    `rsvpCount is ${after.activities[2].slots[0].rsvpCount}`,
  );
  check(
    after.volunteers.length === 1,
    'F: no volunteer row was left behind',
    `${after.volunteers.length} volunteers exist, expected 1`,
  );
}

// --- G: opposing lock orders must not deadlock ------------------------------

console.log(`\nG: ${N} signups naming two activities in opposing orders, x${ROUNDS}`);

for (let round = 0; round < ROUNDS; round++) {
  const event = await fixture(`G${round}`);
  const one = seat(event, 1);
  const two = seat(event, 2);

  // Half name [one, two] and half [two, one]. If locks were taken in the order
  // the caller happened to list them, these two halves would form a cycle and
  // InnoDB would break it with a 1213 -- which surfaces as a 500.
  const results = await stampede(N, (i) => addVolunteer(api, event.id, {
    auth,
    name: `G${round}-${i}`,
    rsvps: i % 2 === 0 ? [one, two] : [two, one],
  }));

  noneCrashed(results, `G${round}: no deadlock surfaced as a 5xx`);
}

// --- H: the per-identity cap under concurrency ------------------------------

console.log(`\nH: ${N} simultaneous anonymous signups when only one is allowed, x${ROUNDS}`);

for (let round = 0; round < ROUNDS; round++) {
  const event = await createEvent(api, {
    auth,
    title: `Single Signup ${round}`,
    allowMultiUserSignups: false,
    activities: [{ label: 'Uncapped' }],
  });

  // Anonymous, so the per-IP identity cap applies -- everything in this pod
  // shares one address, which is exactly the condition the cap is written for.
  const results = await stampede(N, (i) => addVolunteer(api, event.id, {
    name: `H${round}-${i}`,
    rsvps: [seat(event, 0)],
  }));

  noneCrashed(results, `H${round}: no request crashed`);
  const created = results.filter((r) => r.status === 201).length;

  // Structurally the same race as A, and closed the same way: the identity
  // count and the volunteer insert now share one transaction, with the event
  // row locked before the count is taken. Before that, 2 to 8 of 16 got
  // through.
  check(
    created === 1,
    `H${round}: exactly one anonymous signup is accepted`,
    `${created} of ${N} succeeded, cap is 1`,
  );

  const after = await readEvent(api, event.id, auth);
  check(
    after.volunteers.length === 1,
    `H${round}: exactly one volunteer row exists`,
    `${after.volunteers.length} volunteers exist, expected 1`,
  );
}

console.log(`\n(${N} concurrent requests, ${ROUNDS} rounds per scenario)`);
finish('concurrency');
