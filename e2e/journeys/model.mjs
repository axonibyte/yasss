/**
 * The shadow world, and the invariants it lets us assert.
 *
 * The other drivers in this directory ask "does anything crash". That is a good
 * oracle and it is kept here, but it cannot see the bugs that motivated this
 * one: a listing that returns an event twice answers 200 with a well-formed
 * envelope, and a page that requests it four hundred times answers 200 four
 * hundred times. Catching those needs a second copy of the truth to compare
 * against.
 *
 * So this holds what the platform *should* contain, updated by each action as
 * it is applied, and the checks below read the server back and diff it. The
 * model is deliberately partial: it tracks identity, membership and counts --
 * the things that go wrong when state accumulates -- and not every column. A
 * model that mirrored the schema would be a second implementation to keep
 * correct, and would fail for its own reasons rather than the server's.
 */

/**
 * Slots are identified by their pair, the way `entities.svelte.js` does.
 *
 * The separator is written as an escape rather than as a raw byte. As a
 * literal NUL in the source, git classified this whole file as binary: every
 * diff of it showed `Bin 12199 -> 16585` and nothing else, and grep needed -a
 * to look inside. Same character, same key, reviewable file.
 */
export const slotKey = (activityId, windowId) => `${activityId}\u0000${windowId}`;

export class World {
  /** eventId -> event record. */
  events = new Map();

  /** Actor name -> Set of event ids that actor has been told about. */
  knowledge = new Map();

  /**
   * Facts an action decided but could not verify on the spot, checked later.
   * Used by the typo/correction class: a correction is only interesting if
   * somebody else can still see the corrected value some time afterwards.
   */
  pendingCorrections = [];

  event(id) {
    const e = this.events.get(id);
    if (!e) throw new Error(`the model has no event ${id}`);
    return e;
  }

  addEvent({ id, code, title, owner }) {
    this.events.set(id, {
      id, code, title, owner, activities: [], windows: [], details: [],
      volunteers: new Map(),
    });
    this.learn(owner, id);
    return this.events.get(id);
  }

  /** Record that an actor knows an event exists -- a shared link, or a code. */
  learn(actor, eventId) {
    if (!actor) return;
    if (!this.knowledge.has(actor)) this.knowledge.set(actor, new Set());
    this.knowledge.get(actor).add(eventId);
  }

  /**
   * The occupancy a lowered cap grandfathered, if any. Null when the model has
   * nothing to say, in which case the served cap stands on its own.
   */
  capFloor(event, activityId, windowId) {
    const activity = event.activities.find((a) => a.id === activityId);
    const slot = activity?.slots?.get(windowId);
    return slot?.capFloor ?? null;
  }

  knows(actor) {
    return [...(this.knowledge.get(actor) ?? [])];
  }

  /** Events an actor administers -- what `?admin=<them>` should return. */
  ownedBy(actor) {
    return [...this.events.values()].filter((e) => e.owner === actor);
  }

  /**
   * Events an actor has signed anybody up to -- what `?volunteer=<them>` should
   * return, each exactly once however many volunteers they hold on it.
   */
  volunteeredBy(actor) {
    return [...this.events.values()].filter(
      (e) => [...e.volunteers.values()].some((v) => v.owner === actor),
    );
  }

  /** Everyone this actor put on this event. More than one is normal and legal. */
  volunteersOf(event, actor) {
    return [...event.volunteers.values()].filter((v) => v.owner === actor);
  }

  slot(event, activityId, windowId) {
    const activity = event.activities.find((a) => a.id === activityId);
    return activity?.slots.get(windowId) ?? null;
  }

  /** How many claimants the model believes a slot has. */
  claimCount(event, activityId, windowId) {
    return this.slot(event, activityId, windowId)?.claimants.size ?? 0;
  }

  /** Release every slot a volunteer held, as deleting them server-side does. */
  dropVolunteer(event, volunteerId) {
    const volunteer = event.volunteers.get(volunteerId);
    if (!volunteer) return;
    for (const activity of event.activities) {
      for (const slot of activity.slots.values()) slot.claimants.delete(volunteerId);
    }
    event.volunteers.delete(volunteerId);
  }
}

// --- invariants ------------------------------------------------------------

/**
 * Each invariant reads the server and compares it to the model.
 *
 * They return a list of complaints rather than throwing, so one pass reports
 * everything it found instead of only the first thing -- the same reason
 * `harness.js` collects page errors and reports them together.
 */

const idsOf = (list) => list.map((x) => x?.id).filter(Boolean);

/** Duplicates in a list of ids, with their counts. */
function duplicates(ids) {
  const seen = new Map();
  for (const id of ids) seen.set(id, (seen.get(id) ?? 0) + 1);
  return [...seen.entries()].filter(([, n]) => n > 1);
}

/**
 * Page size the listing checks ask for.
 *
 * Comfortably above anything a journey builds, so a page shorter than this is
 * the complete set -- which is what lets the count be compared exactly rather
 * than only as a lower bound.
 */
export const LISTING_LIMIT = 50;

/**
 * A listing returns each event once, and says how many there are.
 *
 * Both halves of this were wrong: the volunteer-scoped query joined the
 * volunteer table without grouping, so an account holding two signups on one
 * event got it back twice, and the count counted the duplicated rows. The
 * frontend keys its dashboard on the event id, so the repeat crashed the render
 * outright rather than merely showing the event twice.
 */
export async function checkListing(api, world, actor, scope) {
  const problems = [];
  if (!actor.account) return problems;

  const query = scope === 'admin'
    ? `?admin=${actor.account}&limit=${LISTING_LIMIT}`
    : `?volunteer=${actor.account}&limit=${LISTING_LIMIT}`;
  const res = await api('GET', '/v1/events', { session: actor.session, query });
  actor.absorb(res);

  if (res.status !== 200) {
    problems.push(`listing ${scope} for ${actor.name}: status ${res.status}`);
    return problems;
  }

  const returned = idsOf(res.payload?.events ?? []);
  const dupes = duplicates(returned);
  if (dupes.length) {
    problems.push(
      `listing ${scope} for ${actor.name} returned an event more than once: `
      + dupes.map(([id, n]) => `${id} x${n}`).join(', '),
    );
  }

  const expected = scope === 'admin' ? world.ownedBy(actor.name) : world.volunteeredBy(actor.name);
  const expectedIds = new Set(expected.map((e) => e.id));
  const distinct = new Set(returned);

  // Only the events this run created are asserted on. The stack is shared with
  // the other stages and may hold events this world never heard of, so a
  // superset is fine and a missing one is not.
  for (const id of expectedIds) {
    if (!distinct.has(id)) {
      problems.push(`listing ${scope} for ${actor.name} omitted ${id}`);
    }
  }

  // The count is the total across every page, so it may legitimately exceed one
  // page -- but only when there *is* another page. These listings ask for fifty
  // and a journey never builds that many, so a short page is the whole set and
  // the count has to match it exactly.
  //
  // Both directions matter and the interesting one is upward: countEvents used
  // COUNT(e.id) over a join that repeated an event per signup, so it reported
  // more events than exist and paged past the end of the list. An earlier
  // version of this check only looked for undercounting and would have watched
  // that defect go by.
  const count = res.payload?.eventCount;
  const pageWasShort = returned.length < LISTING_LIMIT;
  if (typeof count === 'number' && pageWasShort && count !== distinct.size) {
    problems.push(
      `listing ${scope} for ${actor.name} reported ${count} events but returned `
      + `${distinct.size} distinct ones on a page that was not full`,
    );
  }

  return problems;
}

/**
 * The event reads back the way the model says it should.
 *
 * `rsvpCount` is the number an organizer sees and the number capacity is judged
 * against, so it is the one worth asserting -- `e2e/concurrency/verify.mjs`
 * documents three separate defects that all showed up here.
 */
export async function checkEvent(api, world, actor, eventId) {
  const problems = [];
  const res = await api('GET', `/v1/events/${eventId}`, { session: actor.session });
  actor.absorb(res);

  if (res.status !== 200) {
    problems.push(`reading ${eventId} as ${actor.name}: status ${res.status}`);
    return problems;
  }

  const event = world.event(eventId);
  const payload = res.payload.event;

  for (const [what, ids] of [
    ['windows', idsOf(payload.windows ?? [])],
    ['activities', idsOf(payload.activities ?? [])],
    ['details', idsOf(payload.details ?? [])],
    ['volunteers', idsOf(payload.volunteers ?? [])],
  ]) {
    const dupes = duplicates(ids);
    if (dupes.length) {
      problems.push(
        `event ${eventId} returned a ${what.slice(0, -1)} more than once: `
        + dupes.map(([id, n]) => `${id} x${n}`).join(', '),
      );
    }
  }

  if (payload.shortDescription !== event.title) {
    problems.push(
      `event ${eventId} title is "${payload.shortDescription}", model says "${event.title}"`,
    );
  }

  for (const activity of payload.activities ?? []) {
    for (const slot of activity.slots ?? []) {
      const expected = world.claimCount(event, activity.id, slot.window);
      const actual = slot.rsvpCount ?? 0;
      if (actual !== expected) {
        problems.push(
          `slot ${activity.id}/${slot.window} reports ${actual} RSVPs, model says ${expected}`,
        );
      }
      // A cap the organizer lowered underneath people who had already signed up
      // is not a violation: nobody is evicted, and the grid renders the
      // over-subscription rather than hiding it. What would be a violation is
      // one *more* person getting in, so the bar is the floor the model recorded
      // when the cap moved -- which equals the occupancy at that moment, and so
      // still catches the next claim.
      //
      // Stated as `cap` alone, this invariant called correct behavior a defect
      // the first time a seeded run happened to lower a cap onto a full slot.
      const cap = slot.maxSlotVolunteers ?? 0;
      const floor = world.capFloor(event, activity.id, slot.window) ?? cap;
      if (cap !== 0 && actual > Math.max(cap, floor)) {
        problems.push(
          `slot ${activity.id}/${slot.window} holds ${actual} over a cap of ${cap}`
          + (floor > cap ? ` (grandfathered floor ${floor})` : ''),
        );
      }
    }
    const activityCap = activity.maxActivityVolunteers ?? 0;
    const held = (activity.slots ?? []).reduce((n, s) => n + (s.rsvpCount ?? 0), 0);
    if (activityCap !== 0 && held > activityCap) {
      problems.push(`activity ${activity.id} holds ${held} over a cap of ${activityCap}`);
    }
  }

  return problems;
}

/**
 * A volunteer's answers are shown to them and to the organizer, and to nobody
 * else.
 *
 * `RetrieveEventEndpoint` filters the volunteer list per caller, so this is the
 * client of that rule: whatever an actor is shown must be their own unless they
 * administer the event.
 */
export async function checkVisibility(api, world, actor, eventId) {
  const problems = [];
  const res = await api('GET', `/v1/events/${eventId}`, { session: actor.session });
  actor.absorb(res);
  if (res.status !== 200) return problems;

  const event = world.event(eventId);
  const isOwner = event.owner === actor.name || actor.isPlatformAdmin;
  if (isOwner) return problems;

  for (const shown of res.payload.event.volunteers ?? []) {
    const known = event.volunteers.get(shown.id);
    // A volunteer this world did not create belongs to another stage; ignore it.
    if (!known) continue;
    if (known.owner && known.owner !== actor.name) {
      problems.push(
        `${actor.name} was shown volunteer ${shown.id}, which belongs to ${known.owner}, `
        + `on an event they do not administer`,
      );
    }
  }
  return problems;
}

/**
 * A value corrected earlier still reads as corrected.
 *
 * The typo class writes a wrong value, corrects it -- sometimes as a different
 * actor with authority over it -- and queues the claim here. Checking it later
 * rather than immediately is the point: a correction that is visible at once
 * and stale a hundred actions later is exactly the kind of thing a one-pass
 * test cannot see.
 */
export async function checkCorrections(api, world, actors) {
  const problems = [];
  const still = [];

  for (const correction of world.pendingCorrections) {
    const actor = actors.find((a) => a.name === correction.observer) ?? actors[0];
    const res = await api('GET', `/v1/events/${correction.eventId}`, { session: actor.session });
    actor.absorb(res);
    if (res.status !== 200) { still.push(correction); continue; }

    const payload = res.payload.event;
    const actual = correction.kind === 'event-title'
      ? payload.shortDescription
      : payload.activities?.find((a) => a.id === correction.subjectId)?.shortDescription;

    if (actual !== undefined && actual !== correction.corrected) {
      problems.push(
        `${correction.kind} ${correction.subjectId ?? correction.eventId} still reads `
        + `"${actual}" for ${actor.name}; it was corrected to "${correction.corrected}" `
        + `at action ${correction.at}`,
      );
    }
  }

  world.pendingCorrections = still;
  return problems;
}

/**
 * Nothing the tutorial did reached the server, and nobody else can see it.
 *
 * The other invariants here compare the server against a model of what should
 * be there. This one asserts an absence, which is a different shape of claim
 * and needs a different oracle: the tutorial's practice event is supposed to
 * make *no* server state at all, so the question is whether any of its
 * distinctive strings ever arrived.
 *
 * Checked for every actor, and anonymously, because the specific worry is
 * cross-actor: one person running the tutorial must not put a practice
 * volunteer into somebody else's view of an event. The platform admin is
 * included deliberately -- they legitimately see every volunteer on every event
 * they administer, so if a practice submission is visible anywhere it is
 * visible to them first.
 *
 * The markers come from `frontend/src/lib/tutorial/markers.js`, which is the
 * module production actually builds the practice event from. Restating the
 * literals here would leave this check passing while hunting for a string
 * nobody writes any more, from the first time somebody renames the bake sale.
 */
export async function checkNoSandboxLeak(api, actors, markers) {
  const problems = [];
  const found = (where, marker) => problems.push(
    `${where} contains the tutorial marker ${JSON.stringify(marker)} -- `
    + 'a practice event reached the server',
  );

  // Anonymous as well as authenticated: an unowned leak would not appear in
  // anybody's `?admin=` listing, and looking only through actors' eyes is how
  // it would be missed.
  const lookers = [
    { name: 'anonymous', session: null, account: null },
    ...actors.map((a) => ({ name: a.name, session: a.session, account: a.account })),
  ];

  for (const looker of lookers) {
    const opts = looker.session ? { session: looker.session } : {};

    // 1. The event id itself. Not a UUID, so a 200 here is unambiguous -- the
    //    server either holds it or it does not.
    const direct = await api('GET', `/v1/events/${markers.PRACTICE_EVENT_ID}`, opts);
    if (direct.status === 200) found(`GET /v1/events/${markers.PRACTICE_EVENT_ID}`, 'the id');

    // 2. Its short code, which is the other way an event can be reached.
    const byCode = await api('GET', '/v1/events', {
      ...opts, query: `?code=${markers.PRACTICE_CODE}&limit=${LISTING_LIMIT}`,
    });
    if ((byCode.payload?.events ?? []).length > 0) {
      found(`GET /v1/events?code=${markers.PRACTICE_CODE} for ${looker.name}`, markers.PRACTICE_CODE);
    }

    // 3. Every listing this looker can see, swept for any marker at all.
    //
    //    The raw body rather than the parsed fields, on purpose: a leak that
    //    landed in a column nobody thought to check still shows up in the bytes,
    //    and this check is worth more the less it assumes about where a leak
    //    would surface.
    const scopes = ['', ...(looker.account
      ? [`admin=${looker.account}`, `volunteer=${looker.account}`]
      : [])];
    for (const scope of scopes) {
      const query = `?${scope ? `${scope}&` : ''}limit=${LISTING_LIMIT}`;
      const listing = await api('GET', '/v1/events', { ...opts, query });
      for (const marker of markers.PRACTICE_MARKERS) {
        if ((listing.text ?? '').includes(marker)) {
          found(`GET /v1/events${query} for ${looker.name}`, marker);
        }
      }
    }
  }

  return problems;
}

/**
 * Every marker, swept across one event's full read and its report.
 *
 * Separate from the listing sweep because these are the surfaces that carry
 * volunteer names and custom-field answers -- a practice volunteer attached to
 * a real event would be invisible in a listing and plain here.
 */
export async function checkEventFreeOfMarkers(api, actor, eventId, markers) {
  const problems = [];
  for (const [what, path] of [
    ['read', `/v1/events/${eventId}`],
    ['report', `/v1/events/${eventId}/report`],
  ]) {
    const res = await api('GET', path, { session: actor.session });
    if (res.status !== 200) continue;
    for (const marker of markers.PRACTICE_MARKERS) {
      if ((res.text ?? '').includes(marker)) {
        problems.push(
          `the ${what} of ${eventId} as ${actor.name} contains `
          + `${JSON.stringify(marker)} -- a practice submission reached a real event`,
        );
      }
    }
  }
  return problems;
}
