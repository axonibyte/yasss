/**
 * Does the oracle actually fire?
 *
 * The journeys stage needs the whole containerised pod, which makes it an
 * awkward thing to iterate on and an impossible one to run anywhere a stack is
 * not already up. But the part most likely to be quietly wrong is not the
 * plumbing -- it is the invariants. An invariant that never fails is
 * indistinguishable from a passing suite, and it is exactly the kind of mistake
 * that leaves everyone believing they are covered.
 *
 * So this feeds the checks in model.mjs the responses a *broken* server would
 * send, and asserts each one complains. The responses are modeled on the two
 * defects that prompted this whole stage:
 *
 *   - `?volunteer=` returning an event once per signup, because the query
 *     inner-joined the volunteer table without grouping and Event had no
 *     equality for the Set to use;
 *   - `countEvents` counting those same duplicated rows.
 *
 * Needs nothing running. `node e2e/journeys/selftest.mjs`.
 */
import { check, finish } from '../lib/check.mjs';
import {
  World, checkListing, checkEvent, checkVisibility, checkNoSandboxLeak,
  checkEventFreeOfMarkers, slotKey,
} from './model.mjs';
import * as markers from '../../frontend/src/lib/tutorial/markers.js';

/** An actor that records rotations but talks to nothing. */
const actorNamed = (name, account) => ({
  name, account, session: 'ticket', isPlatformAdmin: false, absorb() {},
});

/** An `api` that answers one canned response, whatever it is asked. */
const answering = (payload, status = 200) => async () => ({
  status, payload, text: JSON.stringify(payload), contentType: 'application/json',
});

// --- a world with one event, two signups by one account --------------------

function worldWithTwoSignups() {
  const world = new World();
  const event = world.addEvent({ id: 'E1', code: 'ABCDEFGH', title: 'Bake Sale', owner: 'owner' });
  event.windows = ['W1'];
  event.activities = [{
    id: 'A1',
    label: 'Setup',
    cap: 0,
    slots: new Map([['W1', { enabled: true, cap: 0, claimants: new Set(['V1', 'V2']) }]]),
  }];
  // One account, two volunteers on the one event. Ordinary, and the state that
  // made the listing return it twice.
  event.volunteers.set('V1', {
    id: 'V1', name: 'Ada', owner: 'helper', answers: new Map(), rsvps: new Set([slotKey('A1', 'W1')]),
  });
  event.volunteers.set('V2', {
    id: 'V2', name: 'Ada again', owner: 'helper', answers: new Map(), rsvps: new Set([slotKey('A1', 'W1')]),
  });
  world.learn('helper', 'E1');
  return world;
}

const world = worldWithTwoSignups();
const helper = actorNamed('helper', 'ACC-HELPER');
const owner = actorNamed('owner', 'ACC-OWNER');
const stranger = actorNamed('stranger', 'ACC-STRANGER');

console.log('\nthe listing oracle');

{
  // What the server sent before the fix: the event once per volunteer row.
  const api = answering({ status: 'ok', events: [{ id: 'E1' }, { id: 'E1' }], eventCount: 2 });
  const problems = await checkListing(api, world, helper, 'volunteer');
  check(
    problems.some((p) => p.includes('more than once')),
    'a listing that repeats an event is caught',
    `got: ${JSON.stringify(problems)}`,
  );
}

{
  // The count half of the same defect: three rows for two events.
  const api = answering({ status: 'ok', events: [{ id: 'E1' }], eventCount: 3 });
  const problems = await checkListing(api, world, helper, 'volunteer');
  check(
    problems.some((p) => p.includes('reported 3 events')),
    'a listing that over-counts is caught',
    `got: ${JSON.stringify(problems)}`,
  );
}

{
  const api = answering({ status: 'ok', events: [{ id: 'E1' }], eventCount: 1 });
  const problems = await checkListing(api, world, helper, 'volunteer');
  check(problems.length === 0, 'a correct listing is not complained about', JSON.stringify(problems));
}

{
  // An event the actor signed up to, missing from their own listing.
  const api = answering({ status: 'ok', events: [], eventCount: 0 });
  const problems = await checkListing(api, world, helper, 'volunteer');
  check(
    problems.some((p) => p.includes('omitted E1')),
    'a listing that drops an event is caught',
    `got: ${JSON.stringify(problems)}`,
  );
}

console.log('\nthe event oracle');

/** The event as a correct server would return it: two claimants on the slot. */
const goodEvent = (over = {}) => ({
  status: 'ok',
  event: {
    id: 'E1',
    shortDescription: 'Bake Sale',
    windows: [{ id: 'W1' }],
    details: [],
    volunteers: [{ id: 'V1' }, { id: 'V2' }],
    activities: [{
      id: 'A1',
      shortDescription: 'Setup',
      slots: [{ window: 'W1', rsvpCount: 2, maxSlotVolunteers: 0 }],
    }],
    ...over,
  },
});

{
  const problems = await checkEvent(answering(goodEvent()), world, owner, 'E1');
  check(problems.length === 0, 'a correct event is not complained about', JSON.stringify(problems));
}

{
  const wrong = goodEvent();
  wrong.event.activities[0].slots[0].rsvpCount = 1;
  const problems = await checkEvent(answering(wrong), world, owner, 'E1');
  check(
    problems.some((p) => p.includes('reports 1 RSVPs, model says 2')),
    'an rsvpCount that disagrees with the model is caught',
    `got: ${JSON.stringify(problems)}`,
  );
}

{
  const over = goodEvent();
  over.event.activities[0].slots[0].maxSlotVolunteers = 1;
  const problems = await checkEvent(answering(over), world, owner, 'E1');
  check(
    problems.some((p) => p.includes('over a cap')),
    'a slot holding more than its cap is caught',
    `got: ${JSON.stringify(problems)}`,
  );
}

{
  const dupe = goodEvent();
  dupe.event.volunteers = [{ id: 'V1' }, { id: 'V1' }];
  const problems = await checkEvent(answering(dupe), world, owner, 'E1');
  check(
    problems.some((p) => p.includes('volunteer more than once')),
    'an event repeating a volunteer is caught',
    `got: ${JSON.stringify(problems)}`,
  );
}

{
  const renamed = goodEvent({ shortDescription: 'Stale Title' });
  const problems = await checkEvent(answering(renamed), world, owner, 'E1');
  check(
    problems.some((p) => p.includes('model says "Bake Sale"')),
    'a title that did not take is caught',
    `got: ${JSON.stringify(problems)}`,
  );
}

console.log('\nthe visibility oracle');

{
  // A stranger shown somebody else's volunteer on an event they do not run.
  const problems = await checkVisibility(answering(goodEvent()), world, stranger, 'E1');
  check(
    problems.some((p) => p.includes('belongs to helper')),
    "one actor being shown another's volunteer is caught",
    `got: ${JSON.stringify(problems)}`,
  );
}

{
  // The organizer is shown everybody, by design.
  const problems = await checkVisibility(answering(goodEvent()), world, owner, 'E1');
  check(problems.length === 0, 'the organizer seeing everyone is not a complaint', JSON.stringify(problems));
}

console.log('\ndeterminism');

{
  const makeRng = (seed) => {
    let state = seed || 1;
    return () => {
      state ^= state << 13; state >>>= 0;
      state ^= state >> 17;
      state ^= state << 5; state >>>= 0;
      return state / 2 ** 32;
    };
  };
  const a = makeRng(20260807);
  const b = makeRng(20260807);
  const c = makeRng(811);
  const draw = (r) => Array.from({ length: 24 }, () => r());

  const first = draw(a);
  check(
    JSON.stringify(first) === JSON.stringify(draw(b)),
    'the same seed draws the same sequence -- which is what makes a replay a replay',
  );
  check(
    JSON.stringify(first) !== JSON.stringify(draw(c)),
    'a different seed draws a different sequence',
  );
}

// --- a lowered cap grandfathers, but only what was already there ------------

/**
 * The narrowest kind of correction, and the one most likely to be made wrongly.
 *
 * The cap check used to read `actual > cap`, which called a real product
 * behavior a defect: an organizer may lower a slot's cap beneath the people
 * already in it, nobody is evicted, and `edit-mode.spec.js` has a case named
 * "slot cells show a count over cap" because the grid renders that on purpose.
 * A seeded run reached it and the invariant cried wolf.
 *
 * Loosening it is easy to do too far. These two cases are the difference: the
 * grandfathered occupancy passes, and one more than it does not.
 */
{
  const world = new World();
  const event = world.addEvent({ id: 'E9', code: 'CAPFLOOR', title: 'Cap', owner: 'owner' });
  event.windows = ['W1'];
  const slots = new Map([['W1', {
    enabled: true, cap: 1, capFloor: 2, claimants: new Set(['v1', 'v2']),
  }]]);
  event.activities = [{ id: 'A1', label: 'Setup', cap: 0, slots }];

  const served = (rsvpCount) => answering({
    event: {
      id: 'E9',
      activities: [{
        id: 'A1',
        maxActivityVolunteers: 0,
        slots: [{ window: 'W1', maxSlotVolunteers: 1, rsvpCount }],
      }],
      volunteers: [],
    },
  });

  const owner = actorNamed('owner', 'U1');
  const grandfathered = await checkEvent(served(2), world, owner, 'E9');
  check(
    !grandfathered.some((p) => p.includes('over a cap')),
    'a cap lowered onto people already in the slot is not a violation',
    grandfathered.join(' | '),
  );

  const oneMore = await checkEvent(served(3), world, owner, 'E9');
  check(
    oneMore.some((p) => p.includes('over a cap')),
    'but one more person than the floor still is',
    oneMore.join(' | ') || '(nothing reported)',
  );
}

// --- the sandbox leak check -------------------------------------------------

/**
 * Written from the negative side, which is where polarity gets inverted.
 *
 * `checkNoSandboxLeak` reports when it *finds* something, so an implementation
 * that never found anything -- a typo in a marker, a query that always 404s, a
 * filter the wrong way round -- would look exactly like a platform with no
 * leaks. This is the difference between the two.
 *
 * The same mistake has already been made once here: an earlier `checkListing`
 * tested for undercounting when the defect it was written for overcounted, and
 * this file is what caught it.
 */
{
  const actors = [{ name: 'ada', account: 'U1', session: 'ticket' }];

  // A server that has never heard of any of it: 404 for the direct read, empty
  // listings everywhere else.
  const clean = async (method, path) => (path.includes(markers.PRACTICE_EVENT_ID)
    ? { status: 404, payload: null, text: '' }
    : { status: 200, payload: { events: [], eventCount: 0 }, text: '{"events":[]}' });

  check(
    (await checkNoSandboxLeak(clean, actors, markers)).length === 0,
    'the leak check is quiet when the practice event never reached the server',
  );

  // Now each way it can arrive, one at a time, so a check that only notices one
  // of them cannot pass by covering for the others.
  const leaked = {
    'the event id being readable': async (method, path) => (
      path.includes(markers.PRACTICE_EVENT_ID)
        ? { status: 200, payload: { event: {} }, text: '{}' }
        : { status: 200, payload: { events: [] }, text: '{"events":[]}' }),

    'the practice code resolving': async (method, path, opts = {}) => (
      (opts.query ?? '').includes(markers.PRACTICE_CODE)
        ? { status: 200, payload: { events: [{ id: 'X' }] }, text: '{"events":[{"id":"X"}]}' }
        : { status: 404, payload: null, text: '' }),

    'the practice title in a listing': async (method, path) => (
      path.includes(markers.PRACTICE_EVENT_ID)
        ? { status: 404, payload: null, text: '' }
        : {
          status: 200,
          payload: { events: [{ id: 'X', title: markers.PRACTICE_TITLE }] },
          text: JSON.stringify({ events: [{ id: 'X', title: markers.PRACTICE_TITLE }] }),
        }),
  };

  for (const [what, api] of Object.entries(leaked)) {
    const problems = await checkNoSandboxLeak(api, actors, markers);
    check(problems.length > 0, `the leak check notices ${what}`, JSON.stringify(problems));
  }

  // And the per-event sweep, which is the one that would catch a practice
  // volunteer attached to somebody's real event.
  const withVolunteer = answering({
    volunteers: [{ name: markers.PRACTICE_VOLUNTEER }],
  });
  check(
    (await checkEventFreeOfMarkers(withVolunteer, actors[0], 'E1', markers)).length > 0,
    'the per-event sweep notices a practice volunteer on a real event',
  );
  check(
    (await checkEventFreeOfMarkers(
      answering({ volunteers: [{ name: 'A Real Person' }] }), actors[0], 'E1', markers,
    )).length === 0,
    'and is quiet about a real one',
  );
}

finish('journeys selftest');
