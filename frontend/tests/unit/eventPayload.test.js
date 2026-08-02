/**
 * The publish payload — docs/legacy/01-behavior.md §5.1.
 *
 * The asymmetric-grid cases are the direct regression test for the legacy's
 * stride bug, and the reason they matter is that the server *enables* any slot
 * the payload omits: a mis-walked array did not merely lose slots, it turned on
 * ones the user had switched off.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { eventCreatePayload } from '../../src/state/serialize/eventPayload.js';
import { EventModel } from '../../src/state/event.svelte.js';
import { Activity, Detail, EventWindow, Slot } from '../../src/state/entities.svelte.js';
import { resetKeys } from '../../src/lib/keys.js';

/**
 * Build an unpersisted event of the given shape.
 * @param {(a: number, w: number) => boolean} enabledFor
 */
function wizardEvent(activityCount, windowCount, enabledFor = () => true) {
  const event = new EventModel();
  event.title = 'Bake Sale';
  event.description = 'Cakes';

  event.windows = Array.from({ length: windowCount }, (_, i) => new EventWindow({
    begin: new Date(2030, 0, 1 + i, 9),
    end: new Date(2030, 0, 1 + i, 17),
  }));

  event.activities = Array.from({ length: activityCount }, (_, a) => {
    const activity = new Activity({ label: `Act ${a}`, slotCapDefault: 0 });
    event.windows.forEach((win, w) => {
      activity.slots.set(win.key, new Slot(activity.key, win.key, {
        enabled: enabledFor(a, w),
        cap: 0,
      }));
    });
    return activity;
  });

  return event;
}

beforeEach(() => resetKeys());

describe('slot coverage', () => {
  it.each([[3, 5], [5, 3], [1, 7], [7, 1], [4, 4]])(
    'emits exactly one entry per pair for %ix%i',
    (activities, windows) => {
      const payload = eventCreatePayload(wizardEvent(activities, windows));

      expect(payload.activities).toHaveLength(activities);
      for (const activity of payload.activities) {
        expect(activity.slots).toHaveLength(windows);
        // every window index present exactly once, in order
        expect(activity.slots.map((s) => s.window))
          .toEqual(Array.from({ length: windows }, (_, i) => i));
      }
    },
  );

  it('never omits a disabled slot', () => {
    // Omission is what the server reads as "enabled" — this is the whole point.
    const event = wizardEvent(3, 5, (a, w) => !(a === 1 && w === 3));
    const payload = eventCreatePayload(event);

    const entry = payload.activities[1].slots.find((s) => s.window === 3);
    expect(entry).toBeDefined();
    expect(entry.enabled).toBe(false);
  });

  it('carries the enable flags through unmangled on an asymmetric grid', () => {
    // The legacy strode by windows.length over an array laid out by
    // activities.length, so anything but a square grid mapped slots wrongly.
    const enabledFor = (a, w) => (a + w) % 2 === 0;
    const payload = eventCreatePayload(wizardEvent(3, 5, enabledFor));

    payload.activities.forEach((activity, a) => {
      activity.slots.forEach((slot) => {
        expect(slot.enabled).toBe(enabledFor(a, slot.window));
      });
    });
  });

  it('is stable when there are no windows at all', () => {
    const payload = eventCreatePayload(wizardEvent(2, 0));
    expect(payload.windows).toEqual([]);
    for (const activity of payload.activities) expect(activity.slots).toEqual([]);
  });
});

describe('slot caps', () => {
  it('omits a cap that matches the activity default', () => {
    const event = wizardEvent(1, 1);
    event.activities[0].slotCapDefault = 5;
    event.activities[0].slots.values().next().value.cap = 5;

    const slot = eventCreatePayload(event).activities[0].slots[0];
    expect(slot).not.toHaveProperty('maxSlotVolunteers');
  });

  it('sends a cap that overrides the default', () => {
    const event = wizardEvent(1, 1);
    event.activities[0].slotCapDefault = 5;
    event.activities[0].slots.values().next().value.cap = 2;

    expect(eventCreatePayload(event).activities[0].slots[0].maxSlotVolunteers).toBe(2);
  });

  it('never sends a cap for a disabled slot', () => {
    const event = wizardEvent(1, 1, () => false);
    event.activities[0].slots.values().next().value.cap = 3;
    expect(eventCreatePayload(event).activities[0].slots[0])
      .not.toHaveProperty('maxSlotVolunteers');
  });
});

describe('summary and ordering', () => {
  it('maps the summary to wire names', () => {
    const event = wizardEvent(0, 0);
    event.notifyOnSignup = true;
    event.allowMultiuserSignups = true;

    expect(eventCreatePayload(event)).toMatchObject({
      shortDescription: 'Bake Sale',
      longDescription: 'Cakes',
      emailOnSubmission: true,
      allowMultiUserSignups: true,
    });
  });

  it('assigns priority from array position', () => {
    const payload = eventCreatePayload(wizardEvent(3, 1));
    expect(payload.activities.map((a) => a.priority)).toEqual([0, 1, 2]);
  });

  it('attaches the admin only when signed in', () => {
    const event = wizardEvent(0, 0);
    expect(eventCreatePayload(event)).not.toHaveProperty('admin');
    expect(eventCreatePayload(event, { account: 'u1' }).admin).toBe('u1');
  });

  it('omits optional activity fields when they are unset', () => {
    const activity = eventCreatePayload(wizardEvent(1, 0)).activities[0];
    expect(activity).not.toHaveProperty('longDescription');
    expect(activity).not.toHaveProperty('maxActivityVolunteers');
    expect(activity).not.toHaveProperty('maxSlotVolunteersDefault');
  });
});

describe('windows', () => {
  it('sends stringified epoch millis', () => {
    const event = wizardEvent(0, 1);
    const win = event.windows[0];
    expect(eventCreatePayload(event).windows[0]).toEqual({
      beginTime: String(win.begin.getTime()),
      endTime: String(win.end.getTime()),
    });
  });

  it('references windows by index, since nothing has an id yet', () => {
    const payload = eventCreatePayload(wizardEvent(1, 3));
    expect(payload.activities[0].slots.map((s) => s.window)).toEqual([0, 1, 2]);
  });
});

describe('details', () => {
  it('maps type, label and ordering', () => {
    const event = wizardEvent(0, 0);
    event.details = [
      new Detail({ type: 'EMAIL', label: 'Email', hint: 'yours', required: true }),
      new Detail({ type: 'STRING', label: 'Notes' }),
    ];

    expect(eventCreatePayload(event).details).toEqual([
      { type: 'EMAIL', label: 'Email', priority: 0, hint: 'yours', required: true },
      { type: 'STRING', label: 'Notes', priority: 1 },
    ]);
  });
});
