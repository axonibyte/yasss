/**
 * The event model — loading, RSVP bookkeeping, and removal.
 *
 * Several of these exist specifically to pin bugs that the legacy's flat,
 * index-addressed slot array made possible.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { EventModel, Mode } from '../../src/state/event.svelte.js';
import { Volunteer } from '../../src/state/entities.svelte.js';
import { resetKeys } from '../../src/lib/keys.js';

/** A 2-activity x 2-window event, all slots enabled. */
function payload(overrides = {}) {
  return {
    id: 'e1',
    admin: 'u1',
    shortDescription: 'Bake Sale',
    longDescription: 'Cakes',
    emailOnSubmission: true,
    allowMultiUserSignups: false,
    isPublished: true,
    volunteersMaxed: false,
    expired: false,
    windows: [
      { id: 'w1', begin: 1700000000000, end: 1700003600000 },
      { id: 'w2', begin: 1700010000000, end: 1700013600000 },
    ],
    activities: [
      {
        id: 'a1', shortDescription: 'Setup', maxActivityVolunteers: 0,
        maxSlotVolunteersDefault: 2, priority: 0,
        slots: [
          { window: 'w1', maxSlotVolunteers: 2, rsvps: ['v1'], rsvpCount: 1 },
          { window: 'w2', maxSlotVolunteers: 2, rsvps: [], rsvpCount: 0 },
        ],
      },
      {
        id: 'a2', shortDescription: 'Cleanup', maxActivityVolunteers: 0,
        maxSlotVolunteersDefault: 1, priority: 1,
        slots: [{ window: 'w1', maxSlotVolunteers: 1, rsvps: [], rsvpCount: 0 }],
      },
    ],
    details: [
      { id: 'd1', type: 'STRING', label: 'Notes', hint: '', required: false, priority: 0 },
    ],
    volunteers: [
      { id: 'v1', name: 'Ada', remindersEnabled: false, details: [{ detail: 'd1', value: 'hi' }] },
    ],
    ...overrides,
  };
}

let event;
beforeEach(() => {
  resetKeys();
  event = new EventModel();
});

describe('load', () => {
  it('maps the summary', () => {
    event.load(payload());
    expect(event.title).toBe('Bake Sale');
    expect(event.notifyOnSignup).toBe(true);
    expect(event.allowMultiuserSignups).toBe(false);
  });

  it('creates a slot for every (activity, window) pair', () => {
    event.load(payload());
    for (const activity of event.activities) {
      expect(activity.slots.size).toBe(event.windows.length);
    }
  });

  it('marks only the slots the server returned as enabled', () => {
    // The server has no `enabled` column: a slot row exists iff it is enabled.
    event.load(payload());
    const [setup, cleanup] = event.activities;
    const [w1, w2] = event.windows;

    expect(event.slot(setup, w1).enabled).toBe(true);
    expect(event.slot(setup, w2).enabled).toBe(true);
    expect(event.slot(cleanup, w1).enabled).toBe(true);
    expect(event.slot(cleanup, w2).enabled).toBe(false);
  });

  it('reverses per-slot RSVP lists into per-volunteer membership', () => {
    event.load(payload());
    const ada = event.volunteers[0];
    const slot = event.slot(event.activities[0], event.windows[0]);
    expect(ada.rsvps.has(slot.key)).toBe(true);
    expect(event.hasRsvp(slot)).toBe(true);
  });

  it('maps detail answers through server ids to client keys', () => {
    event.load(payload());
    const notes = event.details[0];
    expect(event.volunteers[0].values.get(notes.key)).toBe('hi');
  });

  it('drops answers referencing an unknown detail', () => {
    const p = payload();
    p.volunteers[0].details.push({ detail: 'nope', value: 'x' });
    event.load(p);
    expect(event.volunteers[0].values.size).toBe(1);
  });

  it('ignores a slot for a window it was not given', () => {
    const p = payload();
    p.activities[0].slots.push({ window: 'ghost', rsvpCount: 5, rsvps: [] });
    event.load(p);
    expect(event.activities[0].slots.size).toBe(2);
  });

  it('selects the first volunteer', () => {
    event.load(payload());
    expect(event.selectedVolunteer).toBe(event.volunteers[0]);
  });

  it('leaves nothing selected when there are no volunteers', () => {
    // A guest sees volunteers: [] because the server filters them.
    event.load(payload({ volunteers: [] }));
    expect(event.selectedVolunteer).toBeNull();
  });
});

describe('mode', () => {
  it('is CREATE before the event is persisted', () => {
    expect(event.mode).toBe(Mode.CREATE);
    expect(event.persisted).toBe(false);
  });

  it('is VIEW once loaded', () => {
    event.load(payload());
    expect(event.mode).toBe(Mode.VIEW);
  });

  it('is EDIT while editing a persisted event', () => {
    event.load(payload());
    event.editing = true;
    expect(event.mode).toBe(Mode.EDIT);
  });
});

/**
 * What the beforeunload guard asks before letting the tab close.
 *
 * This reported only unsubmitted volunteers for a long time, which left the
 * larger case uncovered: until an event is published nothing about it is
 * remote, so an organizer who had built activities, windows and custom fields
 * but added no volunteers could close the tab and be asked nothing at all.
 */
describe('hasUnsavedWork', () => {
  it('is false for an untouched model', () => {
    expect(event.hasUnsavedWork).toBe(false);
  });

  it('is true once a draft has a title', () => {
    event.title = 'Bake Sale';
    expect(event.hasUnsavedWork).toBe(true);
  });

  it('is true for a draft with structure but no volunteers', () => {
    // The case that used to go unwarned.
    event.load(payload());
    const activities = event.activities;
    event.reset();
    event.activities = activities;
    expect(event.hasUnsavedWork).toBe(true);
  });

  it('is false for a published event with nothing pending', () => {
    event.load(payload());
    expect(event.persisted).toBe(true);
    expect(event.hasUnsavedWork).toBe(false);
  });

  it('is true for a published event with an unsubmitted volunteer', () => {
    event.load(payload());
    event.volunteers.push(new Volunteer({ id: null, name: 'Grace' }));
    expect(event.hasUnsavedWork).toBe(true);
  });
});

describe('capacity', () => {
  it('reports a slot full at its own cap', () => {
    event.load(payload());
    const slot = event.slot(event.activities[1], event.windows[0]);
    expect(slot.full).toBe(false);
    slot.rsvpCount = 1; // cap is 1
    expect(slot.full).toBe(true);
  });

  it('treats a cap of 0 as unlimited', () => {
    event.load(payload());
    const slot = event.slot(event.activities[0], event.windows[0]);
    slot.cap = 0;
    slot.rsvpCount = 999;
    expect(slot.full).toBe(false);
  });

  it('applies an activity-wide cap across all its slots', () => {
    event.load(payload());
    const activity = event.activities[0];
    activity.volunteerCap = 2;
    // one existing RSVP from the fixture
    expect(activity.atCapacity).toBe(false);
    event.slot(activity, event.windows[1]).rsvpCount = 1;
    expect(activity.rsvpTotal).toBe(2);
    expect(activity.atCapacity).toBe(true);
  });
});

describe('RSVP bookkeeping', () => {
  it('adds and removes cleanly for a persisted volunteer', () => {
    event.load(payload());
    const ada = event.volunteers[0];
    const slot = event.slot(event.activities[0], event.windows[1]);

    event.addRsvp(ada, slot);
    expect(slot.rsvpCount).toBe(1);
    expect(slot.rsvps.has('v1')).toBe(true);

    event.removeRsvp(ada, slot);
    expect(slot.rsvpCount).toBe(0);
    expect(slot.rsvps.has('v1')).toBe(false);
  });

  it('does not corrupt other volunteers when removing an unpersisted one', () => {
    // The legacy called indexOf(undefined) -> -1, and splice(-1, 1) then
    // removed the LAST entry, i.e. somebody else's id (behavior §6.11).
    event.load(payload());
    const slot = event.slot(event.activities[0], event.windows[0]);
    expect(slot.rsvps.has('v1')).toBe(true);

    const guest = event.addVolunteer(new Volunteer({ name: 'Guest' }));
    event.addRsvp(guest, slot);
    event.removeRsvp(guest, slot);

    expect(slot.rsvps.has('v1')).toBe(true);
  });

  it('is idempotent', () => {
    event.load(payload());
    const ada = event.volunteers[0];
    const slot = event.slot(event.activities[0], event.windows[0]);
    const before = slot.rsvpCount;

    event.addRsvp(ada, slot); // already held
    expect(slot.rsvpCount).toBe(before);

    event.removeRsvp(ada, slot);
    event.removeRsvp(ada, slot); // already released
    expect(slot.rsvpCount).toBe(before - 1);
  });

  it('never lets a count go negative', () => {
    event.load(payload());
    const guest = event.addVolunteer(new Volunteer({ name: 'G' }));
    const slot = event.slot(event.activities[0], event.windows[1]);
    guest.rsvps.add(slot.key);
    event.removeRsvp(guest, slot);
    expect(slot.rsvpCount).toBe(0);
  });
});

describe('removeVolunteer', () => {
  it('releases their slots and fixes the counts', () => {
    // The legacy dropped the volunteer but left the counts, so the grid kept
    // showing them as booked until a reload (behavior §6.13).
    event.load(payload());
    const ada = event.volunteers[0];
    const slot = event.slot(event.activities[0], event.windows[0]);
    expect(slot.rsvpCount).toBe(1);

    event.removeVolunteer(ada);

    expect(slot.rsvpCount).toBe(0);
    expect(slot.rsvps.has('v1')).toBe(false);
    expect(event.volunteers).toHaveLength(0);
  });

  it('moves the selection off the removed volunteer', () => {
    event.load(payload());
    const second = event.addVolunteer(new Volunteer({ name: 'Bob' }));
    event.selectedVolunteer = event.volunteers[0];

    event.removeVolunteer(event.volunteers[0]);
    expect(event.selectedVolunteer).toBe(second);
  });
});

describe('structural removal', () => {
  it('drops an activity together with its slots', () => {
    event.load(payload());
    const activity = event.activities[0];
    event.removeActivity(activity);
    expect(event.activities).toHaveLength(1);
    expect(event.activities[0].id).toBe('a2');
  });

  it('drops a window from every activity', () => {
    // No stride arithmetic: one delete per activity.
    event.load(payload());
    const win = event.windows[0];
    event.removeWindow(win);

    expect(event.windows).toHaveLength(1);
    for (const activity of event.activities) {
      expect(activity.slots.has(win.key)).toBe(false);
      expect(activity.slots.size).toBe(1);
    }
  });

  it('clamps the paging step when activities shrink', () => {
    event.load(payload());
    event.activities = [...event.activities, ...event.activities];
    event.step = event.maxStep;
    event.activities = event.activities.slice(0, 2);
    event.clampStep();
    expect(event.step).toBe(1);
  });
});
