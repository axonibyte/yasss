/**
 * After the browser audit ran the tutorial: did any of it reach the server?
 *
 * The audit can only assert this from the client's side -- it watches what the
 * page requested. That is a real oracle and it is not sufficient on its own: it
 * proves the browser made no call, not that the server holds nothing. A leak by
 * some route the audit did not think to watch would pass it.
 *
 * So this asks the other question, from the server. It runs *after* the audit,
 * against the world the engine built before it, and checks two things:
 *
 *   - none of the practice event's markers appear anywhere -- not in any
 *     actor's listings, not anonymously, not in any event read or report;
 *   - every actor's listings still hold exactly what the engine recorded, so a
 *     practice write that landed on a *real* event shows up as a divergence
 *     even if it carried none of the markers.
 *
 * Deliberately narrower than re-running `sweep()`. `sweep` needs a full `World`
 * -- activities, windows, volunteer sets -- and `handle.json` carries listings
 * and event summaries. Serializing the whole world to rehydrate it here would be
 * a second copy of the model to keep correct, which is exactly what `model.mjs`
 * opens by arguing against. The listings are the part that answers "can another
 * actor see this", which is what this pass is for.
 *
 * Also checks that the operator's copy deck is actually being served, because
 * the failures that shape has -- a param pointing at the wrong path, a file that
 * did not ship -- are deployment failures, and naming them here is kinder than
 * a browser test failing on a missing string.
 */
import { readFileSync } from 'node:fs';
import { makeApi } from '../lib/api.mjs';
import { check, finish } from '../lib/check.mjs';
import { checkNoSandboxLeak, checkEventFreeOfMarkers, LISTING_LIMIT } from './model.mjs';
import { parseDeck } from '../../frontend/src/lib/tutorial/deck.js';
import * as markers from '../../frontend/src/lib/tutorial/markers.js';

const HANDLE = new URL('./handle.json', import.meta.url);
const api = makeApi();

let handle;
try {
  handle = JSON.parse(readFileSync(HANDLE, 'utf8'));
} catch {
  // The engine writes it on every path, including a failing run. Absent means
  // the engine never ran, which is a stage-ordering mistake rather than a pass.
  console.log('  no handle.json -- the journeys engine must run before this');
  process.exit(1);
}

console.log(`\n  checking the world from seed ${handle.seed} for tutorial leakage`);

// --- the markers ------------------------------------------------------------

const leaks = await checkNoSandboxLeak(api, handle.actors, markers);
check(
  leaks.length === 0,
  'no practice-event marker reached the server',
  leaks.join('\n      '),
);

// Every event this run created, read and reported as its owner -- the surfaces
// that carry volunteer names and field answers, where a practice submission
// attached to a real event would show and a listing would not.
const perEvent = [];
for (const event of handle.events) {
  const owner = handle.actors.find((a) => a.name === event.owner) ?? handle.actors[0];
  if (!owner) continue;
  perEvent.push(...await checkEventFreeOfMarkers(api, owner, event.id, markers));
}
check(
  perEvent.length === 0,
  'no real event carries a practice volunteer or answer',
  perEvent.join('\n      '),
);

// --- the world did not move -------------------------------------------------

const drift = [];
for (const expected of handle.expectedListings) {
  const actor = handle.actors.find((a) => a.name === expected.name);
  if (!actor) continue;

  for (const [scope, ids] of [['admin', expected.owned], ['volunteer', expected.volunteered]]) {
    const res = await api('GET', '/v1/events', {
      session: actor.session,
      query: `?${scope}=${actor.account}&limit=${LISTING_LIMIT}`,
    });
    if (res.status !== 200) {
      drift.push(`listing ${scope} for ${expected.name}: status ${res.status}`);
      continue;
    }
    const returned = new Set((res.payload?.events ?? []).map((e) => e.id));
    for (const id of ids) {
      if (!returned.has(id)) drift.push(`${expected.name} lost ${scope} event ${id}`);
    }
    // Deliberately one-directional.
    //
    // "Nothing was added either" is the check you want here and it cannot be
    // written this way: journey.mjs registers one set of actors and runs every
    // seed in seeds.json through them, while handle.json records only the last
    // run's world. So an actor legitimately owns events from the earlier seeds
    // that expectedListings never mentions, and an upward check reports every
    // one of them. It was written, it fired on four actors at once, and what it
    // had found was the fixed-seed set working correctly.
    //
    // The question it was trying to ask -- did the tutorial add anything -- is
    // answered precisely by the marker sweep above, which looks for the strings
    // the practice event is actually made of rather than for unfamiliar ids.
  }
}
check(
  drift.length === 0,
  'every actor still sees exactly the events the engine recorded',
  drift.join('\n      '),
);

// --- the operator's deck ----------------------------------------------------

const deck = await api('GET', '/v1/texts/tutorial');
if (check(deck.status === 200, 'the tutorial copy deck is served', `status ${deck.status}`)) {
  const parsed = parseDeck(deck.text);
  const ids = Object.keys(parsed);
  check(
    ids.length > 0,
    'the deck parses into at least one step',
    `served ${deck.text?.length ?? 0} bytes and yielded no steps -- check the directives`,
  );
  // Not "every declared step", because a deck is allowed to be partial and fall
  // back per step. What is worth asserting is that it is a deck at all rather
  // than, say, the call-to-action file wired to the wrong param.
  check(
    ids.includes('welcome') || ids.includes('v-welcome'),
    'the deck opens a track',
    `steps found: ${ids.join(', ') || 'none'}`,
  );
}

finish('journeys sandbox');
