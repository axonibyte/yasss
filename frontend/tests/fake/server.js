/**
 * A fake YASSS API, faithful enough to catch contract drift.
 *
 * Chosen over request interception because the behaviors most likely to break
 * the frontend are server behaviors, not response bodies: the session token
 * that rotates on every response, the `{status, info}` envelope that decides
 * success independently of the HTTP code, the specific status codes for
 * unpublished/expired/capped, and the begin/end vs beginTime/endTime
 * asymmetry. Those are far easier to get right in a real server.
 *
 * It also serves a static directory, so the same instance can drive either the
 * new build or a checkout of main for structural comparison.
 */
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { serve } from '@hono/node-server';
import { randomUUID } from 'node:crypto';
import {
  createStore, findActivity, findSlot, findVolunteer, findWindow, nextId,
  seedEvent, seedUser, serializeEventRead,
} from './store.js';
import { identityOf, sessionToken } from './auth.js';

import { normalizeCode } from '../../src/lib/eventCode.js';

/**
 * Resolve an `:event` path parameter by id or by short code.
 *
 * Mirrors `APIEndpoint.resolveEvent`: the id first, since that is what every
 * existing link carries, then the code. The normaliser is imported from the app
 * rather than reimplemented, so the fake cannot drift from what the real server
 * will accept.
 */
function resolveEvent(store, raw) {
  const direct = store.events.get(raw);
  if (direct) return direct;
  const code = normalizeCode(raw);
  if (!code) return undefined;
  return [...store.events.values()].find((e) => normalizeCode(e.code) === code);
}


const ok = (info, payload = {}) => ({ status: 'ok', info, ...payload });
const err = (info) => ({ status: 'error', info });

/**
 * Mirrors `APIEndpoint.validTimezone`, which checks against the JVM's tz
 * database via ZoneId.
 *
 * The two sets are close but not identical, so this is deliberately built to
 * agree on the cases that can actually reach it. `Intl.supportedValuesOf` is
 * the obvious choice and is wrong: it lists only canonical names and omits
 * `UTC`, `GMT` and `Etc/UTC`, all of which ZoneId accepts and all of which a
 * containerised browser really does report as its local zone.
 *
 * Construct-and-catch covers the rest, with two tightenings so this never
 * accepts something the server would refuse: bare offsets (wrong for half the
 * year anywhere observing DST), and non-canonical spellings, which Intl folds
 * but ZoneId rejects outright.
 *
 * It errs strict in one direction -- `GMT` canonicalizes to `UTC` and so fails
 * the round-trip here while the server would take it. No browser reports `GMT`
 * as its zone, so nothing reaches this path in practice.
 */
/** Mirrors `APIEndpoint.validLeadTime`: whole minutes, 1 to a year. */
function validLead(v) {
  return Number.isInteger(v) && v >= 1 && v <= 525_600;
}

function knownTimezone(tz) {
  if (typeof tz !== 'string' || tz === '' || /^[+-]/.test(tz)) return false;
  try {
    const canonical = new Intl.DateTimeFormat('en-us', { timeZone: tz })
      .resolvedOptions().timeZone;
    return canonical === tz;
  } catch {
    return false;
  }
}


/** Mirrors the server's `EMAIL` detail pattern, which is case-sensitive. */
const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*$/;

/**
 * Applies the server's reminder consent rules to a volunteer, in place.
 *
 * Shared by create and modify for the same reason `ReminderConsent` is shared
 * server-side: rules that differ between the two are how a platform ends up
 * mailing addresses nobody agreed to.
 *
 * @returns {{error?: string}}
 */
function resolveConsent(volunteer, body, actor) {
  if (!volunteer.remindersEnabled) return {};

  const requested = typeof body.reminderEmail === 'string' ? body.reminderEmail.trim() : '';
  const accountEmail = actor?.email ?? null;
  const email = requested
    ? requested.toLowerCase()
    : (volunteer.reminderEmail ?? accountEmail);

  if (!email) return { error: 'missing argument (reminderEmail)' };
  if (email.length > 255 || !EMAIL_RE.test(email)) {
    return { error: 'malformed argument (reminderEmail)' };
  }

  const isAccountAddress = Boolean(accountEmail) && email === accountEmail.toLowerCase();
  const alreadyConfirmed = volunteer.reminderState === 'CONFIRMED'
    && volunteer.reminderEmail === email;

  volunteer.reminderEmail = email;
  volunteer.reminderState = isAccountAddress || alreadyConfirmed ? 'CONFIRMED' : 'PENDING';

  if (volunteer.reminderState === 'PENDING') volunteer.reminderToken = randomUUID();
  return {};
}


/**
 * @param {object} opts
 * @param {string} [opts.staticDir] directory to serve the app from
 * @param {string|null} [opts.captchaSiteKey] null disables the CAPTCHA path
 */
export function createFakeApi({ staticDir = null, captchaSiteKey = null } = {}) {
  const store = createStore();
  const app = new Hono();

  /**
   * Resolve the caller from the request alone — no server-side state.
   *
   * Both a session token and a freshly signed credential payload decode through
   * the same path, exactly as `AuthToken.process` does. Because nothing is
   * remembered between requests, parallel workers cannot interfere with one
   * another.
   */
  function actorOf(c) {
    const header = c.req.header('authorization');
    if (!header) return null;
    const [scheme, token] = header.split(/\s+/);
    if (scheme?.toUpperCase() !== 'AXB-SIG-REQ' || !token) return null;

    const identity = identityOf(token);
    if (!identity) return null;
    if (identity.account) return store.users.get(identity.account) ?? null;
    return [...store.users.values()].find((u) => u.email === identity.email) ?? null;
  }

  /** Attach the three auth headers the client absorbs from every response. */
  function withAuth(c, actor) {
    if (!actor) return;
    c.header('AXB-ACCOUNT', actor.id);
    c.header('AXB-ACCESS-LEVEL', actor.accessLevel);
    c.header('AXB-SESSION', sessionToken(store, actor.id));
  }

  app.use('*', async (c, next) => {
    c.set('actor', actorOf(c));
    await next();
    withAuth(c, c.get('actor'));
  });

  // --- meta ---------------------------------------------------------------

  app.get('/v1', (c) => {
    // sigAudience and serverTime are what the client signs a v2 credential against; it
    // fetches them anonymously before signing, so their absence would send it down the
    // legacy path and quietly stop exercising v2 at all.
    const payload = {
      uptime: 1,
      version: 1,
      debug: false,
      sigAudience: 'fake.yasss.test',
      sigMaxSkew: 300000,
      acceptLegacySig: true,
      serverTime: Date.now(),
    };
    // Present only when CAPTCHAs are enabled; the client uses its absence as
    // the "no challenge needed" switch.
    if (captchaSiteKey) payload.captcha = captchaSiteKey;
    return c.json(ok('pong', payload));
  });

  app.get('/v1/texts/:id', (c) => c.text(
    `# ${c.req.param('id')}\n\nSome [text](https://example.com).`,
    200,
    { 'Content-Type': 'text/markdown' },
  ));

  // --- users --------------------------------------------------------------

  app.post('/v1/users', async (c) => {
    const body = await c.req.json();
    if (!body.email) return c.json(err('malformed argument (email)'), 400);
    if ([...store.users.values()].some((u) => u.email === body.email)) {
      return c.json(err('conflicting email address found'), 409);
    }
    // Registration lands UNVERIFIED, so the address is pending rather than
    // verified -- which is why a brand-new account cannot yet authenticate.
    const user = seedUser(store, {
      email: body.email,
      pubkey: body.pubkey,
      accessLevel: 'UNVERIFIED',
      verifyToken: randomUUID(),
    });
    return c.json(ok('successfully created user', { user }), 201);
  });

  app.get('/v1/users/:id', (c) => {
    const user = store.users.get(c.req.param('id'));
    if (!user) return c.json(err('user not found'), 404);
    return c.json(ok('successfully retrieved user', {
      user: { id: user.id, email: user.email, accessLevel: user.accessLevel },
    }));
  });

  app.patch('/v1/users/:id', async (c) => {
    const user = store.users.get(c.req.param('id'));
    if (!user) return c.json(err('user not found'), 404);
    const body = await c.req.json();
    if (body.email) user.email = body.email;
    if (body.pubkey) user.pubkey = body.pubkey;
    return c.json(ok('successfully modified user', { user }));
  });

  app.post('/v1/users/:id', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    if (!body.token) return c.json(ok('credential reset request initiated'), 202);
    if (body.token === 'bad-token') return c.json(err('access denied'), 403);
    return c.json(ok('credentials successfully reset'));
  });

  app.put('/v1/users/:id', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const user = store.users.get(c.req.param('id'));
    if (!user) return c.json(err('user not found'), 404);

    // No token: this is a resend. A fresh one each time, so an older email
    // cannot verify an address the user has since corrected.
    if (!body.token) {
      if (!user.pendingEmail) return c.json(err('user has no pending email'), 409);
      user.verifyToken = randomUUID();
      return c.json(ok('resent verification request'), 202);
    }

    // A cleared token matches nothing, which is what makes the link single-use.
    if (!user.verifyToken || user.verifyToken !== body.token) {
      return c.json(err('access denied'), 403);
    }

    if (user.accessLevel === 'UNVERIFIED') {
      user.email = user.pendingEmail;
      user.pendingEmail = null;
      user.accessLevel = 'STANDARD';
      user.verifyToken = null;
      return c.json(ok('user successfully verified'));
    }
    return c.json(ok('user already verified'));
  });

  // --- events -------------------------------------------------------------

  app.get('/v1/events', (c) => {
    const actor = c.get('actor');
    const adminId = c.req.query('admin');
    const volunteerId = c.req.query('volunteer');

    // Mirrors the widened authorization: an admin sees everything, anyone else
    // only what they scope to themselves.
    const scopedToSelf = actor && (adminId === actor.id || volunteerId === actor.id);
    if (!scopedToSelf && actor?.accessLevel !== 'ADMIN') {
      return c.json(err('access denied'), 403);
    }

    const events = [...store.events.values()]
      .filter((e) => {
        if (adminId) return e.admin === adminId;
        if (volunteerId) return e.volunteers.some((v) => v.user === volunteerId);
        return true;
      })
      .map((e) => ({
        id: e.id, shortDescription: e.shortDescription, isPublished: e.isPublished,
      }));

    return c.json(ok('successfully retrieved events', { events }));
  });

  app.get('/v1/events/:id', (c) => {
    const event = resolveEvent(store, c.req.param('id'));
    if (!event) return c.json(err('event not found'), 404);

    const actor = c.get('actor');
    if (!event.isPublished && actor?.accessLevel !== 'ADMIN') {
      return c.json(err('event not published'), 402);
    }
    return c.json(ok('successfully retrieved event', {
      event: serializeEventRead(event, { actor: actor?.id ?? null }),
    }));
  });

  app.post('/v1/events', async (c) => {
    const body = await c.req.json();
    if (!body.shortDescription?.trim()) {
      return c.json(err('malformed argument (string: shortDescription)'), 400);
    }

    const windows = (body.windows ?? []).map((w) => ({
      id: nextId(store, 'window'),
      begin: Number(w.beginTime),
      end: w.endTime == null ? null : Number(w.endTime),
    }));

    const activities = (body.activities ?? []).map((a) => {
      const slots = [];
      windows.forEach((win, i) => {
        const spec = (a.slots ?? []).find((s) => s.window === i);
        // The rule that matters: an unspecified slot is CREATED. Only an
        // explicit enabled:false suppresses it.
        const shouldExist = spec === undefined ? true : spec.enabled !== false;
        if (!shouldExist) return;
        slots.push({
          window: win.id,
          maxSlotVolunteers: spec?.maxSlotVolunteers ?? a.maxSlotVolunteersDefault ?? 0,
          rsvps: [],
          rsvpCount: 0,
        });
      });

      return {
        id: nextId(store, 'activity'),
        shortDescription: a.shortDescription,
        longDescription: a.longDescription ?? '',
        maxActivityVolunteers: a.maxActivityVolunteers ?? 0,
        maxSlotVolunteersDefault: a.maxSlotVolunteersDefault ?? 0,
        priority: a.priority ?? 0,
        slots,
      };
    });

    const id = nextId(store, 'event');
    if (body.timezone !== undefined && !knownTimezone(body.timezone)) {
      return c.json(err('malformed argument (timezone)'), 400);
    }

    if (body.reminderLeadTime !== undefined && !validLead(body.reminderLeadTime)) {
      return c.json(err('malformed argument (reminderLeadTime)'), 400);
    }

    const event = {
      id,
      admin: body.admin ?? null,
      timezone: body.timezone ?? null,
      reminderLeadTime: body.reminderLeadTime ?? null,
      shortDescription: body.shortDescription,
      longDescription: body.longDescription ?? '',
      emailOnSubmission: Boolean(body.emailOnSubmission),
      allowMultiUserSignups: Boolean(body.allowMultiUserSignups),
      isPublished: true,
      expired: false,
      activities,
      windows,
      details: (body.details ?? []).map((d, i) => ({
        id: nextId(store, 'detail'),
        type: d.type,
        label: d.label,
        hint: d.hint ?? '',
        priority: d.priority ?? i,
        required: Boolean(d.required),
      })),
      volunteers: [],
    };
    store.events.set(id, event);

    return c.json(ok('successfully created event', {
      event: serializeEventRead(event, { actor: event.admin }),
    }), 201);
  });

  app.patch('/v1/events/:id', async (c) => {
    const event = resolveEvent(store, c.req.param('id'));
    if (!event) return c.json(err('event not found'), 404);
    const body = await c.req.json();
    if ('shortDescription' in body) event.shortDescription = body.shortDescription;
    if ('longDescription' in body) event.longDescription = body.longDescription;
    if ('emailOnSubmission' in body) event.emailOnSubmission = body.emailOnSubmission;
    if ('allowMultiUserSignups' in body) event.allowMultiUserSignups = body.allowMultiUserSignups;
    if ('reminderLeadTime' in body) {
      if (!validLead(body.reminderLeadTime)) {
        return c.json(err('malformed argument (reminderLeadTime)'), 400);
      }
      event.reminderLeadTime = body.reminderLeadTime;
    }
    if ('timezone' in body) {
      if (!knownTimezone(body.timezone)) return c.json(err('malformed argument (timezone)'), 400);
      event.timezone = body.timezone;
    }
    return c.json(ok('successfully modified event', { event }));
  });

  app.get('/v1/events/:id/report', (c) => {
    const event = resolveEvent(store, c.req.param('id'));
    if (!event) return c.json(err('event not found'), 404);
    return c.html(`<html><body><h1>${event.shortDescription}</h1></body></html>`);
  });

  // --- structure ----------------------------------------------------------

  app.post('/v1/events/:id/activities', async (c) => {
    const event = resolveEvent(store, c.req.param('id'));
    if (!event) return c.json(err('event not found'), 404);
    const body = await c.req.json();

    for (const field of ['maxActivityVolunteers', 'maxSlotVolunteersDefault', 'priority']) {
      const v = body[field];
      if (v !== undefined && (v < 0 || v > 255)) {
        return c.json(err(`malformed argument (int: ${field})`), 400);
      }
    }

    const activity = {
      id: nextId(store, 'activity'),
      shortDescription: body.shortDescription,
      longDescription: body.longDescription ?? '',
      maxActivityVolunteers: body.maxActivityVolunteers ?? 0,
      maxSlotVolunteersDefault: body.maxSlotVolunteersDefault ?? 0,
      priority: body.priority ?? 0,
      slots: [],
    };
    event.activities.push(activity);
    return c.json(ok('successfully added activity', { activity }), 201);
  });

  app.patch('/v1/events/:id/activities/:activity', async (c) => {
    const event = resolveEvent(store, c.req.param('id'));
    const activity = findActivity(event ?? { activities: [] }, c.req.param('activity'));
    if (!activity) return c.json(err('activity not found'), 404);
    Object.assign(activity, await c.req.json());
    return c.json(ok('successfully modified activity', { activity }));
  });

  app.delete('/v1/events/:id/activities/:activity', (c) => {
    const event = resolveEvent(store, c.req.param('id'));
    if (!event) return c.json(err('event not found'), 404);
    event.activities = event.activities.filter((a) => a.id !== c.req.param('activity'));
    return c.json(ok('successfully deleted activity'));
  });

  app.post('/v1/events/:id/windows', async (c) => {
    const event = resolveEvent(store, c.req.param('id'));
    if (!event) return c.json(err('event not found'), 404);
    const body = await c.req.json();
    const win = {
      id: nextId(store, 'window'),
      begin: Number(body.beginTime),
      end: body.endTime == null ? null : Number(body.endTime),
    };
    event.windows.push(win);
    // Responses use beginTime/endTime, unlike the read shape.
    return c.json(ok('successfully added window', {
      window: { id: win.id, beginTime: win.begin, endTime: win.end },
    }), 201);
  });

  app.patch('/v1/events/:id/windows/:window', async (c) => {
    const event = resolveEvent(store, c.req.param('id'));
    const win = findWindow(event ?? { windows: [] }, c.req.param('window'));
    if (!win) return c.json(err('window not found'), 404);
    const body = await c.req.json();
    if ('beginTime' in body) win.begin = Number(body.beginTime);
    if ('endTime' in body) win.end = body.endTime == null ? null : Number(body.endTime);
    return c.json(ok('successfully modified window', {
      window: { id: win.id, beginTime: win.begin, endTime: win.end },
    }));
  });

  app.delete('/v1/events/:id/windows/:window', (c) => {
    const event = resolveEvent(store, c.req.param('id'));
    if (!event) return c.json(err('event not found'), 404);
    const windowId = c.req.param('window');
    event.windows = event.windows.filter((w) => w.id !== windowId);
    for (const a of event.activities) a.slots = a.slots.filter((s) => s.window !== windowId);
    return c.json(ok('successfully deleted window'));
  });

  app.post('/v1/events/:id/details', async (c) => {
    const event = resolveEvent(store, c.req.param('id'));
    if (!event) return c.json(err('event not found'), 404);
    const body = await c.req.json();
    const detail = {
      id: nextId(store, 'detail'),
      type: body.type,
      label: body.label,
      hint: body.hint ?? '',
      priority: body.priority ?? 0,
      required: Boolean(body.required),
    };
    event.details.push(detail);
    return c.json(ok('successfully added detail', { detail }), 201);
  });

  app.patch('/v1/events/:id/details/:detail', async (c) => {
    const event = resolveEvent(store, c.req.param('id'));
    const detail = event?.details.find((d) => d.id === c.req.param('detail'));
    if (!detail) return c.json(err('detail not found'), 404);
    Object.assign(detail, await c.req.json());
    return c.json(ok('successfully modified detail', { detail }));
  });

  app.delete('/v1/events/:id/details/:detail', (c) => {
    const event = resolveEvent(store, c.req.param('id'));
    if (!event) return c.json(err('event not found'), 404);
    event.details = event.details.filter((d) => d.id !== c.req.param('detail'));
    return c.json(ok('successfully deleted detail'));
  });

  // --- slots --------------------------------------------------------------

  app.put('/v1/events/:id/activities/:activity/windows/:window', async (c) => {
    const event = resolveEvent(store, c.req.param('id'));
    const activity = findActivity(event ?? { activities: [] }, c.req.param('activity'));
    if (!activity) return c.json(err('activity not found'), 404);

    const windowId = c.req.param('window');
    const body = await c.req.json().catch(() => ({}));
    let slot = findSlot(activity, windowId);
    if (!slot) {
      slot = { window: windowId, maxSlotVolunteers: 0, rsvps: [], rsvpCount: 0 };
      activity.slots.push(slot);
    }
    slot.maxSlotVolunteers = body.maxSlotVolunteers ?? activity.maxSlotVolunteersDefault ?? 0;
    return c.json(ok('successfully set slot', {
      slot: { activity: activity.id, window: windowId, maxSlotVolunteers: slot.maxSlotVolunteers },
    }), 201);
  });

  app.delete('/v1/events/:id/activities/:activity/windows/:window', (c) => {
    const event = resolveEvent(store, c.req.param('id'));
    const activity = findActivity(event ?? { activities: [] }, c.req.param('activity'));
    if (!activity) return c.json(err('activity not found'), 404);
    activity.slots = activity.slots.filter((s) => s.window !== c.req.param('window'));
    return c.json(ok('successfully unset slot'));
  });

  // --- volunteers ---------------------------------------------------------

  app.post('/v1/events/:id/volunteers', async (c) => {
    const event = resolveEvent(store, c.req.param('id'));
    if (!event) return c.json(err('event not found'), 404);

    const body = await c.req.json();
    if (!body.name?.trim()) return c.json(err('malformed argument (name)'), 400);

    // `rsvps` is read unconditionally by the real server: omitting it is a 500,
    // not a validation error. Reproduced so the client can never regress.
    if (body.rsvps === undefined) return c.json(err('Internal server error.'), 500);

    for (const detail of event.details) {
      if (!detail.required) continue;
      const answered = (body.details ?? []).some((d) => d.detail === detail.id);
      if (!answered) return c.json(err('missing required detail'), 400);
    }

    if (event.expired) return c.json(err('event expired'), 412);

    const volunteer = {
      id: nextId(store, 'volunteer'),
      name: body.name,
      user: body.user ?? null,
      remindersEnabled: Boolean(body.remindersEnabled),
      reminderEmail: null,
      reminderState: 'NONE',
      reminderToken: null,
      details: body.details ?? [],
    };

    const consent = resolveConsent(volunteer, body, c.get('actor'));
    if (consent.error) return c.json(err(consent.error), 400);
    event.volunteers.push(volunteer);

    for (const rsvp of body.rsvps) {
      const activity = findActivity(event, rsvp.activity);
      const slot = findSlot(activity, rsvp.window);
      if (!slot) return c.json(err('window/slot not found'), 404);
      slot.rsvps.push(volunteer.id);
      slot.rsvpCount = slot.rsvps.length;
    }

    return c.json(ok('successfully added volunteer', { volunteer }), 201);
  });

  // Both halves answer 200 whatever the token is, exactly as the server does:
  // telling an anonymous caller whether a token is live would let anyone with a
  // volunteer id probe for active subscriptions.
  app.put('/v1/events/:id/volunteers/:volunteer/reminders', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const volunteer = findVolunteer(store, c.req.param('id'), c.req.param('volunteer'));

    if (volunteer
        && volunteer.reminderToken
        && volunteer.reminderToken === body.token
        && volunteer.reminderState !== 'UNSUBSCRIBED') {
      volunteer.reminderState = 'CONFIRMED';
      store.suppressed.delete(volunteer.reminderEmail);
    }
    return c.json(ok('reminder subscription confirmed'));
  });

  app.delete('/v1/events/:id/volunteers/:volunteer/reminders', (c) => {
    const token = c.req.query('token');
    const volunteer = findVolunteer(store, c.req.param('id'), c.req.param('volunteer'));

    if (volunteer && volunteer.reminderToken && volunteer.reminderToken === token) {
      volunteer.reminderState = 'UNSUBSCRIBED';
      volunteer.remindersEnabled = false;
      // Platform-wide, not per row -- per-row-only unsubscribe is how sending
      // domains get blocklisted.
      if (volunteer.reminderEmail) store.suppressed.add(volunteer.reminderEmail);
    }
    return c.json(ok('reminder subscription cancelled'));
  });

  app.patch('/v1/events/:id/volunteers/:volunteer', async (c) => {
    const event = resolveEvent(store, c.req.param('id'));
    const volunteer = event?.volunteers.find((v) => v.id === c.req.param('volunteer'));
    if (!volunteer) return c.json(err('volunteer not found'), 404);
    const body = await c.req.json();
    if ('name' in body) volunteer.name = body.name;
    if ('details' in body) volunteer.details = body.details;
    if ('remindersEnabled' in body) volunteer.remindersEnabled = Boolean(body.remindersEnabled);

    const consent = resolveConsent(volunteer, body, c.get('actor'));
    if (consent.error) return c.json(err(consent.error), 400);

    return c.json(ok('successfully modified volunteer', { volunteer }));
  });

  app.delete('/v1/events/:id/volunteers/:volunteer', (c) => {
    const event = resolveEvent(store, c.req.param('id'));
    if (!event) return c.json(err('event not found'), 404);
    const volunteerId = c.req.param('volunteer');
    event.volunteers = event.volunteers.filter((v) => v.id !== volunteerId);
    for (const a of event.activities) {
      for (const s of a.slots) {
        s.rsvps = s.rsvps.filter((id) => id !== volunteerId);
        s.rsvpCount = s.rsvps.length;
      }
    }
    return c.json(ok('successfully deleted volunteer'));
  });

  // --- rsvps --------------------------------------------------------------

  const rsvpRoute = '/v1/events/:id/activities/:activity/windows/:window/volunteers/:volunteer';

  app.put(rsvpRoute, (c) => {
    const event = resolveEvent(store, c.req.param('id'));
    const activity = findActivity(event ?? { activities: [] }, c.req.param('activity'));
    const slot = findSlot(activity, c.req.param('window'));
    if (!slot) return c.json(err('slot not found'), 404);

    const capped = slot.maxSlotVolunteers !== 0 && slot.rsvpCount >= slot.maxSlotVolunteers;
    if (capped) return c.json(err('volunteer cap exceeded'), 409);

    const volunteerId = c.req.param('volunteer');
    if (!slot.rsvps.includes(volunteerId)) slot.rsvps.push(volunteerId);
    slot.rsvpCount = slot.rsvps.length;
    return c.json(ok('successfully set rsvp', {
      rsvp: { activity: activity.id, window: slot.window, volunteer: volunteerId },
    }), 201);
  });

  app.delete(rsvpRoute, (c) => {
    const event = resolveEvent(store, c.req.param('id'));
    const activity = findActivity(event ?? { activities: [] }, c.req.param('activity'));
    const slot = findSlot(activity, c.req.param('window'));
    if (!slot) return c.json(err('rsvp not found'), 404);
    slot.rsvps = slot.rsvps.filter((id) => id !== c.req.param('volunteer'));
    slot.rsvpCount = slot.rsvps.length;
    return c.json(ok('successfully unset rsvp'));
  });

  // --- test control -------------------------------------------------------

  /**
   * Seeding and login hooks. Not part of the real API — prefixed so it is
   * obvious in a trace that these are the harness talking, not the app.
   */
  app.post('/__test__/seed', async (c) => {
    const spec = await c.req.json();
    const user = spec.user ? seedUser(store, spec.user) : null;
    const event = spec.event
      ? seedEvent(store, { ...spec.event, admin: spec.event.admin === 'self' ? user?.id : null })
      : null;
    return c.json({
      user,
      eventId: event?.id ?? null,
      // Everything a spec needs to install a signed-in cookie without paying
      // for scrypt. Not a credential: the fake verifies nothing.
      session: user ? sessionToken(store, user.id) : null,
    });
  });

  /**
   * Roll the signing key so the next response carries a different session
   * token. Global, but harmless in parallel — decoding ignores the signature.
   */
  /**
   * Reads back the state the server never sends to a client.
   *
   * A reminder link is only reachable from an email, and the fake sends no
   * mail, so without this a spec could not follow one. Kept read-only, and
   * under `/__test__` so it is unmistakably not part of the API surface.
   */
  /**
   * Lists an event's volunteer ids regardless of who is asking.
   *
   * The API itself filters volunteers by who may see them -- an anonymous
   * reader gets an empty list, which is correct and is asserted elsewhere. That
   * leaves a spec no way to name the volunteer it just created, so this exists
   * purely to close that gap.
   */
  /** The verification token, which the API deliberately never returns. */
  app.get('/__test__/user/:user/verify-token', (c) => {
    const user = store.users.get(c.req.param('user'));
    if (!user) return c.json(err('user not found'), 404);
    return c.json(ok('ok', { token: user.verifyToken ?? null }));
  });

  app.get('/__test__/volunteers/:event', (c) => {
    const event = store.events.get(c.req.param('event'));
    if (!event) return c.json(err('event not found'), 404);
    return c.json(ok('ok', { volunteers: event.volunteers.map((v) => v.id) }));
  });

  app.get('/__test__/volunteer/:event/:volunteer/reminders', (c) => {
    const volunteer = findVolunteer(store, c.req.param('event'), c.req.param('volunteer'));
    if (!volunteer) return c.json(err('volunteer not found'), 404);
    return c.json(ok('ok', {
      reminder: {
        email: volunteer.reminderEmail,
        state: volunteer.reminderState,
        token: volunteer.reminderToken,
        suppressed: store.suppressed.has(volunteer.reminderEmail),
      },
    }));
  });

  app.post('/__test__/rotate-signer', (c) => {
    store.signerEpoch += 1;
    return c.json({ ok: true });
  });

  if (staticDir) {
    app.use('/*', serveStatic({ root: staticDir }));
    // No SPA fallback, exactly like Spark — a deep path must 404, and the app
    // is expected to route on query parameters instead.
    app.get('/', serveStatic({ path: `${staticDir}/index.html` }));
  }

  return { app, store };
}

/** Boot for Playwright's webServer. */
export function startFakeApi({ port = 4173, staticDir = null, captchaSiteKey = null } = {}) {
  const { app, store } = createFakeApi({ staticDir, captchaSiteKey });
  const server = serve({ fetch: app.fetch, port });
  return { server, store };
}
