/**
 * What a simulated user can do, and the ways they can do it badly.
 *
 * Each action decides for itself whether it applies to the actor it is handed,
 * performs one step, and updates the shadow world to match. Weights are rough
 * frequencies, not probabilities -- the engine normalizes across whatever is
 * applicable at the time.
 *
 * The chaos actions at the bottom are not separate machinery. They are ordinary
 * actions that happen to do the wrong thing on purpose, so they interleave with
 * everything else and accumulate history alongside it, which is the whole point:
 * a canceled edit is only interesting once something else has happened on top
 * of it.
 */
import { createEvent, addVolunteer as apiAddVolunteer } from '../lib/fixtures.mjs';
import { slotKey } from './model.mjs';
import { REQUIRED_TEXT, OPTIONAL_TEXT } from '../lib/corpus.mjs';

/** A window an hour long, `hoursAhead` from now. Mirrors lib/fixtures.mjs. */
function windowSpec(hoursAhead) {
  const begin = Date.now() + hoursAhead * 3600_000;
  // Stringified: JSONDeserializer.getTimestamp calls getString first, so a JSON
  // number is a 400 rather than an epoch.
  return { beginTime: String(begin), endTime: String(begin + 3600_000) };
}

const NAMES = [
  'Ada', 'Grace', 'Alan', 'Edsger', 'Barbara', 'Donald', 'Ken', 'Dennis',
  'Radia', 'Leslie', 'Tony', 'Frances',
];

/** A plausible typo: a doubled letter, a dropped one, or a transposition. */
function typo(rnd, text) {
  if (text.length < 4) return `${text}${text.slice(-1)}`;
  const at = 1 + Math.floor(rnd() * (text.length - 2));
  const roll = rnd();
  if (roll < 0.34) return text.slice(0, at) + text[at] + text.slice(at);
  if (roll < 0.67) return text.slice(0, at) + text.slice(at + 1);
  return text.slice(0, at) + text[at + 1] + text[at] + text.slice(at + 2);
}

/**
 * The body fields that attach a write to an account.
 *
 * This API takes identity as an explicit field rather than inferring it from the
 * session -- `POST /v1/events` reads `admin`, `POST .../volunteers` reads `user`
 * -- because both flows are legitimately available anonymously. Omitting the
 * field is therefore not an error: it silently produces an ownerless record,
 * which then correctly fails to appear in any listing scoped to the actor. Both
 * of this engine's first two false failures were that, so it goes through one
 * helper rather than being remembered at each call site.
 *
 * Empty for the anonymous actor, which is exactly right for them.
 */
const owns = (ctx, field) => (ctx.actor.account ? { [field]: ctx.actor.account } : {});

/** An event this actor knows about, if any. */
function knownEvent(ctx) {
  const ids = ctx.world.knows(ctx.actor.name);
  const live = ids.filter((id) => ctx.world.events.has(id));
  return live.length ? ctx.world.event(ctx.pick(live)) : null;
}

/** An event this actor administers, if any. */
function ownedEvent(ctx) {
  const owned = ctx.world.ownedBy(ctx.actor.name);
  return owned.length ? ctx.pick(owned) : null;
}

/** A slot on an event, chosen at random, or null if it has no structure yet. */
function someSlot(ctx, event) {
  const withSlots = event.activities.filter((a) => a.slots.size > 0);
  if (!withSlots.length) return null;
  const activity = ctx.pick(withSlots);
  const windowId = ctx.pick([...activity.slots.keys()]);
  return { activity, windowId, slot: activity.slots.get(windowId) };
}

export const ACTIONS = [
  // --- building -----------------------------------------------------------

  {
    name: 'create-event',
    weight: 4,
    applicable: (ctx) => Boolean(ctx.actor.account) && ctx.world.events.size < 12,
    async run(ctx) {
      // Tagged with the run and the seed so that two events built by the same
      // step of two different runs are still tellable apart on screen.
      const title = `Journey ${ctx.runTag}.${ctx.seed}.${ctx.i} ${ctx.pick(NAMES)}`;
      const created = await createEvent(ctx.api, {
        title,
        auth: ctx.actor.session,
        ...owns(ctx, 'admin'),
        windowCount: 1 + Math.floor(ctx.rnd() * 2),
        // One to six, drawn from the seeded stream so a run stays a replay.
        //
        // It used to be exactly one, always, and `add-activity` at weight 3 was
        // the only way an event ever got wider. So whether any event in a run
        // exceeded the grid's four visible columns -- the thing that puts the
        // paging slider on screen -- was luck, and the browser audit had nothing
        // dependable to page through. Six is one past the cap on purpose.
        activities: Array.from(
          { length: 1 + Math.floor(ctx.rnd() * 6) },
          (_, i) => ({ label: i === 0 ? 'Setup' : `${NAMES[i % NAMES.length]}'s shift` }),
        ),
        allowMultiUserSignups: true,
      });

      const event = ctx.world.addEvent({ id: created.id, title, owner: ctx.actor.name });
      event.windows = [...created.windows];
      for (const a of created.activities) {
        const slots = new Map();
        for (const s of a.slots) {
          slots.set(s.window, { enabled: true, cap: s.cap ?? 0, claimants: new Set() });
        }
        event.activities.push({ id: a.id, label: a.label, cap: 0, slots });
      }

      // The code is what one user gives another out of band, so it has to be
      // known before sharing can be simulated.
      const read = await ctx.api('GET', `/v1/events/${created.id}`, { session: ctx.actor.session });
      ctx.actor.absorb(read);
      event.code = read.payload?.event?.code ?? null;

      return `created ${created.id} "${title}"`;
    },
  },

  {
    name: 'add-activity',
    weight: 3,
    applicable: (ctx) => Boolean(ownedEvent(ctx)),
    async run(ctx) {
      const event = ownedEvent(ctx);
      const label = `${ctx.pick(NAMES)}'s shift`;
      const res = await ctx.api('POST', `/v1/events/${event.id}/activities`, {
        session: ctx.actor.session,
        body: { shortDescription: label, priority: event.activities.length, slots: [] },
      });
      ctx.actor.absorb(res);
      const id = res.payload?.activity?.id;
      if (!id) return `add-activity refused (${res.status})`;

      event.activities.push({ id, label, cap: 0, slots: new Map() });
      return `added activity ${id} to ${event.id}`;
    },
  },

  {
    name: 'add-window',
    weight: 2,
    applicable: (ctx) => Boolean(ownedEvent(ctx)),
    async run(ctx) {
      const event = ownedEvent(ctx);
      const res = await ctx.api('POST', `/v1/events/${event.id}/windows`, {
        session: ctx.actor.session,
        body: windowSpec(24 + event.windows.length),
      });
      ctx.actor.absorb(res);
      const id = res.payload?.window?.id;
      if (!id) return `add-window refused (${res.status})`;

      event.windows.push(id);
      return `added window ${id} to ${event.id}`;
    },
  },

  {
    name: 'enable-slot',
    weight: 4,
    applicable: (ctx) => {
      const event = ownedEvent(ctx);
      return Boolean(event && event.activities.length && event.windows.length);
    },
    async run(ctx) {
      const event = ownedEvent(ctx);
      const activity = ctx.pick(event.activities);
      const windowId = ctx.pick(event.windows);
      const cap = ctx.chance(0.3) ? 1 + Math.floor(ctx.rnd() * 3) : 0;

      const res = await ctx.api(
        'PUT',
        `/v1/events/${event.id}/activities/${activity.id}/windows/${windowId}`,
        { session: ctx.actor.session, body: { maxSlotVolunteers: cap } },
      );
      ctx.actor.absorb(res);
      if (res.status >= 400) return `enable-slot refused (${res.status})`;

      const existing = activity.slots.get(windowId);
      const claimants = existing?.claimants ?? new Set();
      activity.slots.set(windowId, {
        enabled: true,
        cap,
        claimants,
        // Lowering a cap beneath the people already in the slot does not evict
        // them -- `edit-mode.spec.js` has a case named "slot cells show a count
        // over cap", so the product renders that state on purpose. The floor is
        // what the cap invariant may hold the server to from here: those
        // claimants are grandfathered, and one more would still be a defect.
        capFloor: cap === 0 ? 0 : Math.max(cap, claimants.size),
      });
      return `enabled ${activity.id}/${windowId} cap=${cap}`;
    },
  },

  {
    name: 'add-detail',
    weight: 2,
    applicable: (ctx) => Boolean(ownedEvent(ctx)),
    async run(ctx) {
      const event = ownedEvent(ctx);
      const label = `Field ${event.details.length + 1}`;
      const res = await ctx.api('POST', `/v1/events/${event.id}/details`, {
        session: ctx.actor.session,
        body: {
          type: 'STRING', label, hint: '', required: false, priority: event.details.length,
        },
      });
      ctx.actor.absorb(res);
      const id = res.payload?.detail?.id;
      if (!id) return `add-detail refused (${res.status})`;

      event.details.push({ id, label, type: 'STRING', required: false });
      return `added detail ${id} to ${event.id}`;
    },
  },

  // --- signing up ---------------------------------------------------------

  /**
   * The action that produced the duplicate-listing crash.
   *
   * One account holding several volunteers on one event is ordinary -- it is
   * what allowMultiUserSignups is for -- and it is exactly the state that made
   * `?volunteer=` return the event once per signup. So this deliberately does
   * not check whether the actor already has one here.
   */
  {
    name: 'add-volunteer',
    weight: 6,
    applicable: (ctx) => {
      const event = knownEvent(ctx);
      return Boolean(event && someSlot(ctx, event));
    },
    async run(ctx) {
      const event = knownEvent(ctx);
      const chosen = someSlot(ctx, event);
      if (!chosen) return 'no slot to claim';

      const name = `${ctx.pick(NAMES)} ${ctx.i}`;
      const wanted = ctx.chance(0.8)
        ? [{ activity: chosen.activity.id, window: chosen.windowId }]
        : [];

      const res = await apiAddVolunteer(ctx.api, event.id, {
        name,
        auth: ctx.actor.session,
        ...owns(ctx, 'user'),
        rsvps: wanted,
        details: [],
      });
      ctx.actor.absorb(res);

      const id = res.payload?.volunteer?.id;
      if (!id) {
        // A refusal is a legitimate answer -- a full slot, or the per-identity
        // cap. The model must not record a signup that did not happen.
        return `add-volunteer refused (${res.status}: ${res.payload?.info ?? ''})`;
      }

      event.volunteers.set(id, {
        id, name, owner: ctx.actor.name, answers: new Map(), rsvps: new Set(),
      });
      for (const r of wanted) {
        const slot = event.activities.find((a) => a.id === r.activity)?.slots.get(r.window);
        if (slot) {
          slot.claimants.add(id);
          event.volunteers.get(id).rsvps.add(slotKey(r.activity, r.window));
        }
      }
      return `signed up ${id} "${name}" on ${event.id}`;
    },
  },

  {
    name: 'claim-slot',
    weight: 5,
    applicable: (ctx) => {
      const event = knownEvent(ctx);
      if (!event) return false;
      return ctx.world.volunteersOf(event, ctx.actor.name).length > 0;
    },
    async run(ctx) {
      const event = knownEvent(ctx);
      const mine = ctx.world.volunteersOf(event, ctx.actor.name);
      if (!mine.length) return 'nothing of mine here';
      const volunteer = ctx.pick(mine);
      const chosen = someSlot(ctx, event);
      if (!chosen) return 'no slot to claim';

      const key = slotKey(chosen.activity.id, chosen.windowId);
      const held = volunteer.rsvps.has(key);
      const method = held ? 'DELETE' : 'PUT';

      const res = await ctx.api(
        method,
        `/v1/events/${event.id}/activities/${chosen.activity.id}`
        + `/windows/${chosen.windowId}/volunteers/${volunteer.id}`,
        { session: ctx.actor.session, body: method === 'PUT' ? {} : undefined },
      );
      ctx.actor.absorb(res);
      if (res.status >= 400) return `${method} rsvp refused (${res.status})`;

      if (held) {
        volunteer.rsvps.delete(key);
        chosen.slot.claimants.delete(volunteer.id);
      } else {
        volunteer.rsvps.add(key);
        chosen.slot.claimants.add(volunteer.id);
      }
      return `${held ? 'released' : 'claimed'} ${key} for ${volunteer.id}`;
    },
  },

  {
    name: 'remove-volunteer',
    weight: 2,
    applicable: (ctx) => {
      const event = knownEvent(ctx);
      return Boolean(event && ctx.world.volunteersOf(event, ctx.actor.name).length);
    },
    async run(ctx) {
      const event = knownEvent(ctx);
      const mine = ctx.world.volunteersOf(event, ctx.actor.name);
      if (!mine.length) return 'nothing of mine here';
      const volunteer = ctx.pick(mine);

      const res = await ctx.api('DELETE', `/v1/events/${event.id}/volunteers/${volunteer.id}`, {
        session: ctx.actor.session,
      });
      ctx.actor.absorb(res);
      if (res.status >= 400) return `remove-volunteer refused (${res.status})`;

      // Removing a volunteer releases their slots and decrements the counts.
      ctx.world.dropVolunteer(event, volunteer.id);
      return `removed volunteer ${volunteer.id} from ${event.id}`;
    },
  },

  // --- out-of-band ---------------------------------------------------------

  /**
   * One user tells another about an event.
   *
   * A shared link or a spoken code -- there is no API for it, which is the
   * point: the recipient reaches the event knowing only its code, exactly as
   * somebody arriving from a text message does.
   */
  {
    name: 'share-event',
    weight: 3,
    applicable: (ctx) => Boolean(knownEvent(ctx)) && ctx.actors.length > 1,
    async run(ctx) {
      const event = knownEvent(ctx);
      const other = ctx.pick(ctx.actors.filter((a) => a.name !== ctx.actor.name));
      ctx.world.learn(other.name, event.id);

      // The recipient looks it up the way the code entry box does: the code is
      // the identifier, so this is a plain read with the code in place of the id.
      const identifier = event.code && ctx.chance(0.5) ? event.code : event.id;
      const res = await ctx.api('GET', `/v1/events/${identifier}`, { session: other.session });
      other.absorb(res);

      if (res.status === 200 && res.payload?.event?.id !== event.id) {
        throw new Error(
          `${identifier} resolved to ${res.payload.event.id}, expected ${event.id}`,
        );
      }
      return `${ctx.actor.name} shared ${event.id} with ${other.name} via ${identifier}`;
    },
  },

  {
    name: 'view-dashboard',
    weight: 4,
    applicable: (ctx) => Boolean(ctx.actor.account),
    async run(ctx) {
      // Both listings, because they are scoped differently and only one of them
      // joined the volunteer table.
      for (const scope of ['admin', 'volunteer']) {
        const query = `?${scope}=${ctx.actor.account}&limit=50`;
        const res = await ctx.api('GET', '/v1/events', { session: ctx.actor.session, query });
        ctx.actor.absorb(res);
      }
      return `${ctx.actor.name} viewed their dashboard`;
    },
  },

  {
    name: 'view-report',
    weight: 1,
    applicable: (ctx) => Boolean(ownedEvent(ctx)),
    async run(ctx) {
      const event = ownedEvent(ctx);
      const res = await ctx.api('GET', `/v1/events/${event.id}/report`, {
        session: ctx.actor.session,
      });
      ctx.actor.absorb(res);
      return `read the report for ${event.id} (${res.status})`;
    },
  },

  // --- chaos: typos, corrected later --------------------------------------

  /**
   * Write a wrong value, then correct it -- sometimes as somebody else.
   *
   * The correction is queued rather than checked here. A value that is right
   * immediately and stale two hundred actions later is the failure this class
   * exists to find, and checking on the spot would miss precisely that.
   */
  {
    name: 'typo-then-correct',
    weight: 3,
    applicable: (ctx) => Boolean(ownedEvent(ctx)),
    async run(ctx) {
      const event = ownedEvent(ctx);
      const intended = `Corrected ${ctx.i} ${ctx.pick(NAMES)}`;
      const wrong = typo(ctx.rnd, intended);

      const bad = await ctx.api('PATCH', `/v1/events/${event.id}`, {
        session: ctx.actor.session,
        body: { shortDescription: wrong },
      });
      ctx.actor.absorb(bad);
      if (bad.status < 400) event.title = wrong;

      // Sometimes the organizer fixes their own typo; sometimes a platform
      // administrator does it for them, which exercises authority over another
      // account's data.
      const fixer = ctx.chance(0.3)
        ? (ctx.actors.find((a) => a.isPlatformAdmin) ?? ctx.actor)
        : ctx.actor;

      const good = await ctx.api('PATCH', `/v1/events/${event.id}`, {
        session: fixer.session,
        body: { shortDescription: intended },
      });
      fixer.absorb(good);
      if (good.status >= 400) return `correction refused (${good.status})`;

      event.title = intended;
      ctx.world.pendingCorrections.push({
        kind: 'event-title',
        eventId: event.id,
        subjectId: null,
        corrected: intended,
        observer: ctx.pick(ctx.actors.filter((a) => a.account)).name,
        at: ctx.i,
      });
      return `${ctx.actor.name} typed "${wrong}", ${fixer.name} corrected to "${intended}"`;
    },
  },

  // --- chaos: abandoned work ----------------------------------------------

  /**
   * Start something and walk away.
   *
   * At this tier that is an entity created and immediately dropped, or one
   * created and never referred to again. The browser audit covers the other
   * half -- a modal opened and canceled -- because that is where it exists.
   */
  {
    name: 'abandon-activity',
    weight: 2,
    applicable: (ctx) => Boolean(ownedEvent(ctx)),
    async run(ctx) {
      const event = ownedEvent(ctx);
      const res = await ctx.api('POST', `/v1/events/${event.id}/activities`, {
        session: ctx.actor.session,
        body: { shortDescription: 'Abandoned', priority: 99, slots: [] },
      });
      ctx.actor.absorb(res);
      const id = res.payload?.activity?.id;
      if (!id) return `abandon-activity: create refused (${res.status})`;

      const gone = await ctx.api('DELETE', `/v1/events/${event.id}/activities/${id}`, {
        session: ctx.actor.session,
      });
      ctx.actor.absorb(gone);
      return `created and dropped activity ${id} (${gone.status})`;
    },
  },

  // --- chaos: stale and concurrent sessions --------------------------------

  /**
   * Use a ticket that has already been rotated away.
   *
   * Every authenticated response carries a new one, so the previous ticket is
   * dead the moment it is used. A second tab holds exactly that. It must be
   * refused as an authentication failure and not a crash, and it must not
   * disturb the session the actor is really using.
   */
  {
    name: 'stale-session',
    weight: 2,
    applicable: (ctx) => Boolean(ctx.actor.previousSession && ctx.actor.account),
    async run(ctx) {
      const live = ctx.actor.session;
      const res = await ctx.api('GET', '/v1/events', {
        session: ctx.actor.previousSession,
        query: `?admin=${ctx.actor.account}&limit=5`,
      });
      // Deliberately not absorbed: whatever this answers must not become the
      // actor's session, or the fault would be this driver's.
      if (res.status >= 500) {
        throw new Error(`a stale ticket produced ${res.status}, which should be a refusal`);
      }
      if (ctx.actor.session !== live) {
        throw new Error('using a stale ticket disturbed the live session');
      }
      return `stale ticket answered ${res.status}`;
    },
  },

  /**
   * Act on something that is no longer there.
   *
   * The other half of the stale-tab case: a page that was rendered before
   * somebody else deleted the thing it is showing.
   */
  {
    name: 'act-on-deleted',
    weight: 2,
    applicable: (ctx) => Boolean(ctx.actor.account),
    async run(ctx) {
      const missing = '00000000-0000-4000-8000-000000000000';
      const res = await ctx.api('GET', `/v1/events/${missing}`, { session: ctx.actor.session });
      ctx.actor.absorb(res);
      if (res.status >= 500) {
        throw new Error(`reading a missing event produced ${res.status}`);
      }
      return `missing event answered ${res.status}`;
    },
  },

  // --- chaos: invalid input ------------------------------------------------

  /**
   * Feed the shared corpus at a write endpoint.
   *
   * The corpus's `expect` is what the *client* should do, so it is not asserted
   * here -- a value the browser refuses may well be one the server accepts. What
   * is asserted is that the server answers something coherent either way.
   */
  {
    name: 'hostile-input',
    weight: 3,
    applicable: (ctx) => Boolean(ownedEvent(ctx)),
    async run(ctx) {
      const event = ownedEvent(ctx);
      const c = ctx.pick([...REQUIRED_TEXT, ...OPTIONAL_TEXT]);
      const res = await ctx.api('POST', `/v1/events/${event.id}/activities`, {
        session: ctx.actor.session,
        body: { shortDescription: c.value, priority: 0, slots: [] },
      });
      ctx.actor.absorb(res);

      const id = res.payload?.activity?.id;
      if (id) {
        event.activities.push({ id, label: c.value, cap: 0, slots: new Map() });
      }
      return `activity label ${c.name}: ${res.status}`;
    },
  },

  // --- chaos: double submits ----------------------------------------------

  /**
   * Press save twice before the first answer arrives.
   *
   * Two identical signups in flight at once. Both may legitimately succeed --
   * an account is allowed several volunteers on an event -- so what is asserted
   * is that the model and the server agree afterwards about how many there are,
   * not that one of them lost.
   */
  {
    name: 'double-submit',
    weight: 2,
    applicable: (ctx) => {
      const event = knownEvent(ctx);
      return Boolean(event && someSlot(ctx, event));
    },
    async run(ctx) {
      const event = knownEvent(ctx);
      const chosen = someSlot(ctx, event);
      if (!chosen) return 'no slot to claim';
      const name = `Twice ${ctx.i}`;

      const body = {
        name,
        ...owns(ctx, 'user'),
        rsvps: [{ activity: chosen.activity.id, window: chosen.windowId }],
        details: [],
      };
      const [a, b] = await Promise.all([
        apiAddVolunteer(ctx.api, event.id, { ...body, auth: ctx.actor.session }),
        apiAddVolunteer(ctx.api, event.id, { ...body, auth: ctx.actor.session }),
      ]);
      // Only one absorb: two concurrent responses each carry a rotated ticket,
      // and the loser's is already dead. Taking the first that has one is what a
      // browser with two requests in flight ends up doing anyway.
      ctx.actor.absorb(a.session ? a : b);

      for (const res of [a, b]) {
        const id = res.payload?.volunteer?.id;
        if (!id) continue;
        event.volunteers.set(id, {
          id, name, owner: ctx.actor.name, answers: new Map(), rsvps: new Set(),
        });
        const slot = event.activities
          .find((x) => x.id === chosen.activity.id)?.slots.get(chosen.windowId);
        if (slot) {
          slot.claimants.add(id);
          event.volunteers.get(id).rsvps.add(slotKey(chosen.activity.id, chosen.windowId));
        }
      }
      return `double signup answered ${a.status}/${b.status}`;
    },
  },
];
