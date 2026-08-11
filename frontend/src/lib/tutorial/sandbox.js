/**
 * The practice event the tutorial teaches on, in the stages a tour builds it.
 *
 * Built entirely in the browser and never sent anywhere. It carries a synthetic
 * id once it is "published" so `EventModel.mode` resolves to VIEW -- the
 * volunteer half of the tour needs the surface that only a published event shows
 * -- and `sandbox`, which is what stops every write that id would otherwise
 * authorize from leaving the page. See `state/actions/remote.js`.
 *
 * The content is chosen so that one screen shows every cell state a learner will
 * meet: available, booked, full, and unavailable. A tour of an empty grid would
 * be a tour of nothing, which is the whole reason this exists rather than coach
 * marks over the user's own (empty) app.
 *
 * **Stages, not one builder.** The organizer track walks somebody through
 * building an event, and a step describing the form you fill in cannot be shown
 * over an event that is already finished and published -- half the controls it
 * names do not exist on that surface. So the tour starts at `draft` and calls
 * each seeder as it reaches the thing that seeder produces. The volunteer track
 * is handed a link to something finished, so it loads `buildPracticeEvent`,
 * which is every stage in order.
 *
 * Every seeder is idempotent: `enter` re-runs when a learner steps back and
 * forward again.
 */
import { Activity, Detail, EventWindow, Slot } from '../../state/entities.svelte.js';
import { localZone } from '../format/dates.js';
import {
  PRACTICE_ANSWER, PRACTICE_CODE, PRACTICE_EVENT_ID, PRACTICE_TITLE,
} from './markers.js';

/**
 * The Saturday after next, at a given hour, in the viewer's own zone.
 *
 * Relative rather than fixed so the practice event is never expired -- an
 * expired one renders the "This event has expired." pill and `interactive` goes
 * false, which would leave the learner unable to click the thing the tour is
 * describing.
 *
 * @param {number} hour
 * @param {Date} [now] injectable so a test can pin the clock
 */
function nextSaturday(hour, now = new Date()) {
  const d = new Date(now);
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7) + 7);
  d.setHours(hour, 0, 0, 0);
  return d;
}

/**
 * An event as it stands the moment its summary form is saved: the settings and
 * nothing else. No windows, no activities, no questions, no id.
 *
 * Empty on purpose. This is exactly what the product gives somebody who has
 * just pressed Save on the create form -- an empty grid with a message saying
 * so -- and a tour that skipped over that would be teaching a screen the
 * learner will not recognise the first time they see it for real.
 *
 * No id is what makes it a draft, which is the surface "Publish Event" lives on
 * and the one an organizer actually builds on.
 *
 * Takes the model rather than returning a new one, mirroring `EventModel.load`:
 * the app drives a single `currentEvent` that other modules hold a reference to,
 * so swapping the object would leave them pointing at the old one.
 *
 * @param {import('../../state/event.svelte.js').EventModel} event
 * @returns {import('../../state/event.svelte.js').EventModel} the same model
 */
export function draftPracticeEvent(event) {
  event.reset();

  event.sandbox = true;
  event.title = PRACTICE_TITLE;
  event.description = 'A pretend event, so you can try everything without '
    + 'creating anything real.';
  event.timezone = localZone();
  event.allowMultiuserSignups = true;

  return event;
}

/**
 * The rows: two windows on the Saturday after next.
 *
 * @param {import('../../state/event.svelte.js').EventModel} event
 * @param {Date} [now] injectable clock, for tests
 */
export function seedPracticeWindows(event, now = new Date()) {
  if (event.windows.length > 0) return event;
  event.windows = [[9, 12], [13, 16]].map(([from, to]) => new EventWindow({
    begin: nextSaturday(from, now),
    end: nextSaturday(to, now),
    timezone: event.timezone,
  }));
  return event;
}

/**
 * The columns, their caps, and the four squares that show the four states.
 *
 * Separate from the draft because activities are what "Add an Activity" adds:
 * the step that names that button should be followed by columns appearing,
 * which is the one thing that makes the button's effect legible.
 *
 * @param {import('../../state/event.svelte.js').EventModel} event
 */
export function seedPracticeActivities(event) {
  if (event.activities.length > 0) return event;
  const [morning, afternoon] = event.windows;
  if (!morning || !afternoon) return event;

  // Six activities against five columns, which is one more than the grid shows.
  //
  // Deliberately over the cap. The grid holds five columns at every width -- one
  // for the window labels and four for activities -- and pages the rest behind a
  // slider. A practice event that fitted would teach a first-time organizer a
  // grid that behaves differently from the one they get the moment they add a
  // fifth activity, and the slider is not self-evident: it is the only control
  // on the page that reveals content rather than changing it.
  const setUp = new Activity({
    label: 'Set up',
    description: 'Tables, signs, and the float for the cash box.',
    priority: 0,
    slotCapDefault: 2,
  });
  const bake = new Activity({
    label: 'Bake something',
    description: 'Anything you like, so long as you label the nuts.',
    priority: 1,
    slotCapDefault: 3,
  });
  const extras = ['Serve', 'Take payments', 'Wash up', 'Pack down'].map(
    (label, i) => new Activity({
      label,
      priority: 2 + i,
      slotCapDefault: 2,
    }),
  );

  // Four cells, four states. "Set up" in the afternoon is disabled -- there is
  // nothing to set up once it has started -- and its morning slot is one short
  // of its cap so the learner's own click is what fills it.
  setUp.slots.set(morning.key, new Slot(setUp.key, morning.key, {
    enabled: true, cap: 2, rsvpCount: 1,
  }));
  setUp.slots.set(afternoon.key, new Slot(setUp.key, afternoon.key, {
    enabled: false, cap: 2,
  }));
  bake.slots.set(morning.key, new Slot(bake.key, morning.key, {
    enabled: true, cap: 3, rsvpCount: 3,
  }));
  bake.slots.set(afternoon.key, new Slot(bake.key, afternoon.key, {
    enabled: true, cap: 3, rsvpCount: 0,
  }));

  // Every extra activity is available in both windows: they exist to push the
  // grid past its column cap, and a page of nothing but full and disabled tiles
  // would be a poor thing to scroll to.
  for (const activity of extras) {
    for (const win of [morning, afternoon]) {
      activity.slots.set(win.key, new Slot(activity.key, win.key, {
        enabled: true, cap: 2, rsvpCount: 0,
      }));
    }
  }

  event.activities = [setUp, bake, ...extras];

  return event;
}

/** The one custom question, so the field steps have something to point at. */
export function seedPracticeQuestion(event) {
  if (event.details.length > 0) return event;
  event.details = [new Detail({
    type: 'STRING',
    label: 'What are you bringing?',
    hint: PRACTICE_ANSWER,
    required: true,
    priority: 0,
  })];
  return event;
}

/**
 * Published: an id and a code.
 *
 * The id is what moves the event off the create surface and onto the one a
 * volunteer sees -- which is where the tour ends, and where the whole volunteer
 * track lives.
 *
 * @param {import('../../state/event.svelte.js').EventModel} event
 */
export function publishPracticeEvent(event) {
  event.id = PRACTICE_EVENT_ID;
  event.code = PRACTICE_CODE;
  event.isPublished = true;
  event.editing = false;
  return event;
}

/**
 * The finished practice event: every stage, in order.
 *
 * What the volunteer track loads, because somebody who was sent a link is
 * handed an event that already exists.
 *
 * @param {import('../../state/event.svelte.js').EventModel} event
 * @param {Date} [now] injectable clock, for tests
 * @returns {import('../../state/event.svelte.js').EventModel} the same model
 */
export function buildPracticeEvent(event, now = new Date()) {
  draftPracticeEvent(event);
  seedPracticeWindows(event, now);
  seedPracticeActivities(event);
  seedPracticeQuestion(event);
  publishPracticeEvent(event);
  return event;
}
