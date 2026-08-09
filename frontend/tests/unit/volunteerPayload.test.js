/**
 * Volunteer request bodies — the twin of `eventPayload.test.js`.
 *
 * Two server quirks shape this file, and both are the kind that produce a 500
 * rather than a validation message: `rsvps` is declared optional but read
 * unconditionally, and detail values are matched against fully-anchored
 * patterns so a blank string is a rejection rather than an absence.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  volunteerCreatePayload, volunteerUpdatePayload,
} from '../../src/state/serialize/volunteerPayload.js';
import { Activity, Detail, EventWindow, Slot, Volunteer } from '../../src/state/entities.svelte.js';
import { resetKeys } from '../../src/lib/keys.js';

beforeEach(() => resetKeys());

/** A volunteer holding one slot of a one-by-one grid. */
function fixture({ values = new Map(), details = [], claim = false } = {}) {
  const win = new EventWindow({ id: 'w1', begin: new Date(), end: new Date() });
  const activity = new Activity({ id: 'a1', label: 'Setup' });
  const slot = new Slot(activity.key, win.key, { enabled: true });
  activity.slots.set(win.key, slot);

  const volunteer = new Volunteer({ name: 'Ada', values });
  if (claim) volunteer.rsvps.add(slot.key);

  return { volunteer, details, activities: [activity], windows: [win] };
}

describe('create payload', () => {
  it('always sends rsvps, even when empty', () => {
    const { volunteer, ...ctx } = fixture();
    const payload = volunteerCreatePayload(volunteer, { ...ctx, account: null });

    // Omitting it is a 500 from the real server, not a 400 — it is declared
    // optional and then read unconditionally.
    expect(payload.rsvps).toEqual([]);
    expect(payload).toHaveProperty('rsvps');
  });

  it('maps claimed slots to activity and window ids', () => {
    const { volunteer, ...ctx } = fixture({ claim: true });
    const payload = volunteerCreatePayload(volunteer, { ...ctx, account: null });

    expect(payload.rsvps).toEqual([{ activity: 'a1', window: 'w1' }]);
  });

  it('drops RSVPs referencing entities the server has never seen', () => {
    const { volunteer, ...ctx } = fixture({ claim: true });
    ctx.activities[0].id = null; // unpersisted

    expect(volunteerCreatePayload(volunteer, { ...ctx, account: null }).rsvps).toEqual([]);
  });

  it('attaches the account only when signed in', () => {
    const { volunteer, ...ctx } = fixture();

    expect(volunteerCreatePayload(volunteer, { ...ctx, account: null }))
      .not.toHaveProperty('user');
    expect(volunteerCreatePayload(volunteer, { ...ctx, account: 'acct-1' }).user)
      .toBe('acct-1');
  });
});

describe('detail answers', () => {
  it('omits a blank optional answer rather than sending an empty string', () => {
    const notes = new Detail({ id: 'd1', type: 'STRING', label: 'Notes' });
    const { volunteer, ...ctx } = fixture({
      details: [notes], values: new Map([[notes.key, '  ']]),
    });

    // '' fails the anchored server pattern, so sending it is a 400 rather than
    // an "unset".
    expect(volunteerCreatePayload(volunteer, { ...ctx, account: null }).details).toEqual([]);
  });

  it('trims and lowercases an email answer', () => {
    const email = new Detail({ id: 'd1', type: 'EMAIL', label: 'Email' });
    const { volunteer, ...ctx } = fixture({
      details: [email], values: new Map([[email.key, '  Foo@Bar.CO  ']]),
    });

    expect(volunteerCreatePayload(volunteer, { ...ctx, account: null }).details)
      .toEqual([{ detail: 'd1', value: 'foo@bar.co' }]);
  });

  it('sends a boolean answered false, rather than dropping it', () => {
    // The regression this file exists for. `isBlank` means "not ticked", which
    // is right for the required check but wrong for serialization: an optional
    // checkbox answered *no* is an answer, and dropping it makes "no"
    // indistinguishable from "never asked" in the organizer's data.
    const agree = new Detail({ id: 'd1', type: 'BOOLEAN', label: 'Parking?' });
    const { volunteer, ...ctx } = fixture({
      details: [agree], values: new Map([[agree.key, false]]),
    });

    expect(volunteerCreatePayload(volunteer, { ...ctx, account: null }).details)
      .toEqual([{ detail: 'd1', value: 'false' }]);
  });

  it('sends a boolean answered true', () => {
    const agree = new Detail({ id: 'd1', type: 'BOOLEAN', label: 'Parking?' });
    const { volunteer, ...ctx } = fixture({
      details: [agree], values: new Map([[agree.key, true]]),
    });

    expect(volunteerCreatePayload(volunteer, { ...ctx, account: null }).details)
      .toEqual([{ detail: 'd1', value: 'true' }]);
  });

  it('skips details the server has not assigned an id to', () => {
    const unsaved = new Detail({ type: 'STRING', label: 'Local only' });
    const { volunteer, ...ctx } = fixture({
      details: [unsaved], values: new Map([[unsaved.key, 'something']]),
    });

    expect(volunteerCreatePayload(volunteer, { ...ctx, account: null }).details).toEqual([]);
  });

  it('skips a detail of an unrecognized type instead of throwing', () => {
    const odd = new Detail({ id: 'd1', type: 'MYSTERY', label: 'Odd' });
    const { volunteer, ...ctx } = fixture({
      details: [odd], values: new Map([[odd.key, 'x']]),
    });

    expect(volunteerCreatePayload(volunteer, { ...ctx, account: null }).details).toEqual([]);
  });
});

describe('update payload', () => {
  it('carries neither an id nor rsvps', () => {
    const { volunteer, details } = fixture({ claim: true });
    const payload = volunteerUpdatePayload(volunteer, { details });

    // The legacy leaked both whenever the event had no details, because the
    // statements deleting them sat inside a loop over those details.
    expect(payload).not.toHaveProperty('id');
    expect(payload).not.toHaveProperty('rsvps');
    expect(payload).not.toHaveProperty('user');
  });

  it('includes details only when asked, since supplying them replaces the set', () => {
    const notes = new Detail({ id: 'd1', type: 'STRING', label: 'Notes' });
    const { volunteer } = fixture({
      details: [notes], values: new Map([[notes.key, 'hi']]),
    });

    expect(volunteerUpdatePayload(volunteer, { details: [notes] }).details)
      .toEqual([{ detail: 'd1', value: 'hi' }]);
    expect(volunteerUpdatePayload(volunteer, { details: [notes], includeDetails: false }))
      .not.toHaveProperty('details');
  });

  it('round-trips the name and reminder flag', () => {
    const { volunteer } = fixture();
    volunteer.name = 'Grace';
    volunteer.remindersEnabled = true;

    expect(volunteerUpdatePayload(volunteer, {}))
      .toMatchObject({ name: 'Grace', remindersEnabled: true });
  });
});

describe('reminder address', () => {
  const optedIn = (reminderEmail) => {
    const { volunteer, ...ctx } = fixture();
    volunteer.remindersEnabled = true;
    volunteer.reminderEmail = reminderEmail;
    return { volunteer, ctx: { ...ctx, account: null } };
  };

  it('is omitted when reminders are off', () => {
    const { volunteer, ctx } = optedIn('ada@example.com');
    volunteer.remindersEnabled = false;

    const payload = volunteerCreatePayload(volunteer, ctx);
    expect(payload.remindersEnabled).toBe(false);
    expect(payload).not.toHaveProperty('reminderEmail');
  });

  it('is omitted when blank, so the server can fall back to the account', () => {
    // Sending "" is a 400 against an anchored pattern rather than a signal
    // that no address was given.
    const { volunteer, ctx } = optedIn('   ');

    const payload = volunteerCreatePayload(volunteer, ctx);
    expect(payload.remindersEnabled).toBe(true);
    expect(payload).not.toHaveProperty('reminderEmail');
  });

  it('is lowercased, because the server pattern is case-sensitive', () => {
    const { volunteer, ctx } = optedIn('  Ada@Example.COM ');

    expect(volunteerCreatePayload(volunteer, ctx).reminderEmail).toBe('ada@example.com');
  });

  it('rides along on an update too', () => {
    const { volunteer } = optedIn('ada@example.com');

    expect(volunteerUpdatePayload(volunteer, { details: [] }).reminderEmail)
      .toBe('ada@example.com');
  });
});
