/**
 * Simulated users, over a long run.
 *
 * The other drivers here each take one question and answer it thoroughly. This
 * one exists because of the questions none of them can reach: the defects that
 * only appear once state has piled up. Both of the bugs that prompted it were
 * of that kind -- a listing that returned an event twice, but only for an
 * account holding two signups on it, and a dashboard that stormed the server
 * with requests, but only when it loaded with a session already in hand.
 * Neither is reachable by a script that sets up, asserts once, and tears down.
 *
 * So: several actors, each with their own account and their own session, taking
 * turns at whatever they are currently able to do, for as long as the run
 * lasts. A shadow world (model.mjs) records what should be true and is diffed
 * against the server as it goes.
 *
 * Deterministic, on the same terms as fuzz.mjs: the seed is printed on every run
 * and replayed with JOURNEY_SEED. A failure prints the whole action trace, then
 * shrinks it -- because a seed alone tells you a bug exists and a trace tells
 * you what it is.
 *
 *   JOURNEY_SEED        replay a previous run
 *   JOURNEY_ITERATIONS  actions per run (default 200)
 *   JOURNEY_ACTORS      how many accounts to simulate (default 4)
 *   JOURNEY_CHECK_EVERY actions between invariant passes (default 10)
 *   JOURNEY_NO_SHRINK   set to skip shrinking a failure
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { makeApi, isUnhandled } from '../lib/api.mjs';
import { check, finish } from '../lib/check.mjs';
import { credentialFor } from '../lib/creds.mjs';
import { linkParams, messageBody, waitForMail } from '../lib/mailpit.mjs';
import { genCreds } from '../../frontend/src/lib/crypto/creds.js';
import {
  World, checkListing, checkEvent, checkVisibility, checkCorrections,
} from './model.mjs';
import { ACTIONS } from './actions.mjs';

const HANDLE = new URL('./handle.json', import.meta.url);
const SEEDS = new URL('./seeds.json', import.meta.url);

const ITERATIONS = Number(process.env.JOURNEY_ITERATIONS ?? 200);
const ACTOR_COUNT = Number(process.env.JOURNEY_ACTORS ?? 4);
const CHECK_EVERY = Number(process.env.JOURNEY_CHECK_EVERY ?? 10);
const SEED = Number(process.env.JOURNEY_SEED ?? (Date.now() % 2 ** 31));

/**
 * Distinguishes this process's events from an earlier run's.
 *
 * The stack accumulates: replaying a seed builds a second set of events with
 * the same shape, so titles derived from the seed and the step alone collide
 * with the previous run's and anything reading the UI by title cannot tell them
 * apart. Deliberately outside the seeded stream, so it changes nothing about
 * which actions are chosen -- the action sequence stays identical on a replay,
 * which is what reproducibility here means.
 */
const RUN_TAG = Date.now().toString(36).slice(-5);

/**
 * Which pass through `runJourney` this is, counted for the whole process.
 *
 * Event titles carry it, and that is not cosmetic. Titles are otherwise
 * deterministic in (tag, seed, action index) -- the point being that two runs of
 * one seed name their events identically -- and `shrinkFailure` re-runs the same
 * seed dozens of times in the same process. So a *failing* run left the database
 * holding many genuinely distinct events sharing a title, and the browser audit,
 * which counts duplicates by title because the listing markup carries no ids,
 * reported a duplicate that was not one.
 *
 * A failing run producing a second, spurious failure is the worst possible time
 * for it: it lands exactly when somebody is trying to read the first.
 */
let attempt = 0;

const rawApi = makeApi();

/** xorshift32, the same generator fuzz.mjs uses. Small, seedable, replayable. */
function makeRng(seed) {
  let state = seed || 1;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    return state / 2 ** 32;
  };
}

// --- the health oracle, on every single response ---------------------------

/**
 * Wraps the API so that no call can escape the cheap checks.
 *
 * Carried over from fuzz.mjs, which established that the failure mode worth
 * catching in this codebase is an unguarded dereference surfacing as a 500.
 * `isUnhandled` distinguishes the library's generic catch from an
 * endpoint-authored error, and only the former is definitely a bug.
 */
function makeCheckedApi(problems) {
  return async function api(method, path, opts = {}) {
    const res = await rawApi(method, path, opts);

    if (res.status >= 500) {
      problems.push(
        `${method} ${path} answered ${res.status}`
        + `${isUnhandled(res) ? ' (unhandled exception)' : ''}: ${res.text.slice(0, 300)}`,
      );
    } else if (res.contentType?.includes('application/json')) {
      if (res.payload === null) {
        problems.push(`${method} ${path} claimed JSON and sent ${res.text.slice(0, 200)}`);
      } else if (typeof res.payload.status !== 'string') {
        problems.push(`${method} ${path} answered without a status field`);
      }
    }
    return res;
  };
}

// --- actors ----------------------------------------------------------------

class Actor {
  constructor({ name, email, password, account, session, isPlatformAdmin = false }) {
    this.name = name;
    this.email = email;
    this.password = password;
    this.account = account;
    this.session = session;
    /** The ticket before the current one -- what a second tab would still hold. */
    this.previousSession = null;
    this.isPlatformAdmin = isPlatformAdmin;
  }

  /**
   * Take the rotated ticket off a response.
   *
   * Every authenticated response carries a new one and retires the old, so an
   * actor that does not do this is holding a dead ticket by its second call.
   * Keeping the retired one is what makes the stale-session action possible.
   */
  absorb(res) {
    if (!res?.session || res.session === this.session) return;
    this.previousSession = this.session;
    this.session = res.session;
  }
}

/**
 * Register, verify and sign in one account.
 *
 * Verification goes through the real mail path because there is no backdoor on
 * the real stack -- the same reason `tests/live` builds its state through the
 * UI. Scrypt is memoised inside creds.mjs, so the cost here is one derivation
 * per distinct password; every actor shares one for that reason.
 */
async function registerActor(api, name, password) {
  const email = `journey-${name.toLowerCase()}-${Date.now().toString(36)}@example.com`;
  const { pubkey } = await genCreds(email, password);

  const created = await api('POST', '/v1/users', { body: { email, pubkey, generateMFA: false } });
  if (created.status !== 201) {
    throw new Error(`could not register ${email}: ${created.status} ${created.text.slice(0, 200)}`);
  }
  const account = created.payload.user.id;

  // waitForMail answers the message, not its body -- and the link's separators
  // arrive HTML-escaped, so linkParams is what turns it into parameters. Doing
  // either by hand reads `amp;token` as a parameter name.
  const message = await waitForMail(email);
  if (!message) throw new Error(`no welcome email arrived for ${email}`);
  const link = linkParams(await messageBody(message.ID), 'verify-user');
  if (!link) throw new Error(`the welcome email for ${email} carried no verification link`);

  const verified = await api('PUT', `/v1/users/${link.user}`, { body: { token: link.token } });
  if (verified.status !== 200) {
    throw new Error(`could not verify ${email}: ${verified.status}`);
  }

  const signedIn = await api('GET', '/v1', { auth: await credentialFor(email, password) });
  if (!signedIn.session) throw new Error(`could not sign in as ${email}`);

  return new Actor({ name, email, password, account, session: signedIn.session });
}

// --- the run ---------------------------------------------------------------

/**
 * One journey.
 *
 * Actors are passed in rather than created here so that shrinking can re-run
 * without paying for registration again; the world is rebuilt every time, since
 * a run's whole point is the history it accumulates.
 *
 * @returns {Promise<{problems: string[], trace: object[], failedAt: number|null}>}
 */
async function runJourney({ seed, iterations, actors, skip = new Set() }) {
  attempt += 1;
  const runTag = `${RUN_TAG}x${attempt}`;
  const problems = [];
  const api = makeCheckedApi(problems);
  const rnd = makeRng(seed);
  const world = new World();
  const trace = [];

  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const chance = (p) => rnd() < p;

  for (let i = 1; i <= iterations; i += 1) {
    const actor = pick(actors);
    const ctx = { api, world, actor, actors, rnd, pick, chance, i, seed, runTag };

    const available = ACTIONS.filter((a) => !skip.has(a.name) && a.applicable(ctx));
    if (!available.length) continue;

    // Weighted choice across whatever applies right now.
    const total = available.reduce((n, a) => n + a.weight, 0);
    let roll = rnd() * total;
    const action = available.find((a) => (roll -= a.weight) <= 0) ?? available[0];

    let note;
    try {
      note = await action.run(ctx);
    } catch (e) {
      problems.push(`action ${action.name} threw at step ${i}: ${e.message}`);
      trace.push({ i, actor: actor.name, action: action.name, note: `THREW ${e.message}` });
      return { problems, trace, failedAt: i, world };
    }
    trace.push({ i, actor: actor.name, action: action.name, note });

    if (problems.length) return { problems, trace, failedAt: i, world };

    if (i % CHECK_EVERY === 0) {
      const found = await sweep(api, world, actors);
      if (found.length) {
        problems.push(...found);
        return { problems, trace, failedAt: i, world };
      }
    }
  }

  problems.push(...(await sweep(api, world, actors)));
  return { problems, trace, failedAt: problems.length ? iterations : null, world };
}

/** One full pass of every invariant, over every actor and every live event. */
async function sweep(api, world, actors) {
  const problems = [];
  for (const actor of actors) {
    if (!actor.account) continue;
    problems.push(...await checkListing(api, world, actor, 'admin'));
    problems.push(...await checkListing(api, world, actor, 'volunteer'));
  }
  for (const event of world.events.values()) {
    const owner = actors.find((a) => a.name === event.owner) ?? actors[0];
    problems.push(...await checkEvent(api, world, owner, event.id));
    for (const actor of actors) {
      if (actor.name !== event.owner && actor.account) {
        problems.push(...await checkVisibility(api, world, actor, event.id));
      }
    }
  }
  problems.push(...await checkCorrections(api, world, actors));
  return problems;
}

// --- shrinking -------------------------------------------------------------

/**
 * Cut a failing run down to something a person can read.
 *
 * Two passes. First bisect the length: the shortest prefix of the same seed that
 * still fails. Then try removing whole action *kinds*, keeping each removal that
 * still fails -- which answers "is the volunteer action actually involved, or
 * just present".
 *
 * Both re-run against a stack that already holds the first run's data, so a
 * shrunk reproduction is a strong signal and a failure to reproduce is a weak
 * one. Said plainly in the output rather than papered over.
 */
async function shrinkFailure({ seed, failedAt, actors }) {
  let bound = failedAt;
  let low = 1;

  while (low < bound) {
    const mid = Math.floor((low + bound) / 2);
    const attempt = await runJourney({ seed, iterations: mid, actors });
    if (attempt.problems.length) bound = mid;
    else low = mid + 1;
  }

  const skip = new Set();
  for (const action of ACTIONS) {
    const candidate = new Set([...skip, action.name]);
    const attempt = await runJourney({ seed, iterations: bound, actors, skip: candidate });
    if (attempt.problems.length) skip.add(action.name);
  }

  const final = await runJourney({ seed, iterations: bound, actors, skip });
  return { iterations: bound, skip: [...skip], trace: final.trace, problems: final.problems };
}

// --- entry -----------------------------------------------------------------

function printTrace(trace) {
  for (const step of trace) {
    console.log(`    ${String(step.i).padStart(4)}  ${step.actor.padEnd(8)} ${step.action.padEnd(18)} ${step.note ?? ''}`);
  }
}

/**
 * What to run.
 *
 * An explicit JOURNEY_SEED is always one run of exactly that -- replaying a
 * failure must never turn into something else. JOURNEY_FIXED is the CI shape:
 * the seeds in seeds.json, including every one promoted from a past failure.
 * Neither, and it is one fresh random run, which is the hunting mode.
 */
function decidePlans() {
  if (process.env.JOURNEY_SEED) {
    return [{ seed: SEED, iterations: ITERATIONS, note: 'replay' }];
  }
  if (process.env.JOURNEY_FIXED) {
    const { fixed = [], regressions = [] } = JSON.parse(readFileSync(SEEDS, 'utf8'));
    const plans = [...regressions, ...fixed];
    if (plans.length) return plans;
    console.log('  seeds.json holds no seeds; falling back to one random run');
  }
  return [{ seed: SEED, iterations: ITERATIONS, note: 'random' }];
}

const plans = decidePlans();
console.log(`journeys: ${ACTOR_COUNT} actors, ${plans.length} run(s)`);
for (const plan of plans) {
  console.log(`  seed ${plan.seed}, ${plan.iterations} actions`
    + `${plan.note ? ` -- ${plan.note}` : ''}`);
}
console.log('');

const setupProblems = [];
const setupApi = makeCheckedApi(setupProblems);

// One password for every actor: scrypt at N=16384 is memoised per password in
// creds.mjs, so sharing one turns N derivations into one.
const PASSWORD = 'journey-password-1';
const actors = [];
for (let i = 0; i < ACTOR_COUNT; i += 1) {
  actors.push(await registerActor(setupApi, `user${i + 1}`, PASSWORD));
}
// An anonymous visitor, who can read a shared event and sign up but owns nothing.
actors.push(new Actor({ name: 'nobody', email: null, password: null, account: null, session: null }));

check(setupProblems.length === 0, 'registering the actors is clean', setupProblems.join('\n      '));
check(actors.length === ACTOR_COUNT + 1, `${ACTOR_COUNT} accounts and an anonymous visitor`);

let result = null;
for (const plan of plans) {
  const run = await runJourney({ seed: plan.seed, iterations: plan.iterations, actors });
  // Keep the last world that completed, so the browser audit has something to
  // look at even when an earlier seed failed.
  if (run.world) result = run;

  if (!run.problems.length) {
    check(true, `seed ${plan.seed}: ${plan.iterations} actions, every invariant held`);
    continue;
  }

  check(
    false,
    `seed ${plan.seed} failed at action ${run.failedAt}`,
    run.problems.join('\n      '),
  );
  console.log('\n  trace:');
  printTrace(run.trace);

  if (!process.env.JOURNEY_NO_SHRINK) {
    console.log('\n  shrinking...');
    const small = await shrinkFailure({ seed: plan.seed, failedAt: run.failedAt, actors });
    if (small.problems.length) {
      console.log(`\n  reproduced in ${small.iterations} actions`
        + `${small.skip.length ? ` without: ${small.skip.join(', ')}` : ''}`);
      printTrace(small.trace);
      console.log(`\n  replay: JOURNEY_SEED=${plan.seed} JOURNEY_ITERATIONS=${small.iterations}`);
      console.log('  promote it: add {"seed": ' + plan.seed + ', "iterations": '
        + small.iterations + ', "note": "..."} to seeds.json regressions');
    } else {
      // Worth saying rather than hiding: the shrink re-runs against a stack that
      // already holds the first run's data, so a failure that depends on
      // starting clean will not reproduce here.
      console.log('\n  could not reproduce while shrinking -- the failure likely depends on');
      console.log('  state this run had already created. Use the full trace above.');
    }
  }
}

// Left for the browser audit, which runs in a different image and so cannot
// share memory with this. Mirrors sessions/handle.json.
if (result?.world) {
  writeFileSync(HANDLE, `${JSON.stringify({
    seed: SEED,
    actors: actors.filter((a) => a.account).map((a) => ({
      name: a.name, account: a.account, session: a.session,
    })),
    events: [...result.world.events.values()].map((e) => ({
      id: e.id,
      code: e.code,
      title: e.title,
      owner: e.owner,
      volunteerCount: e.volunteers.size,
      // The audit needs an event wider than the grid's four visible columns to
      // exercise the paging slider, and cannot tell from a title which one that
      // is.
      activityCount: e.activities.length,
    })),
    expectedListings: actors.filter((a) => a.account).map((a) => ({
      name: a.name,
      owned: result.world.ownedBy(a.name).map((e) => e.id),
      volunteered: result.world.volunteeredBy(a.name).map((e) => e.id),
    })),
  }, null, 2)}\n`);
  console.log(`\n  wrote ${new URL(HANDLE).pathname} for the browser audit`);
}

finish('journeys');
