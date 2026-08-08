/**
 * The practice event the tutorial teaches on.
 *
 * Built entirely in the browser and never sent anywhere. It carries a synthetic
 * id so `EventModel.mode` resolves to VIEW -- the volunteer half of the tour
 * needs the surface that only a published event shows -- and `sandbox`, which is
 * what stops every write that id would otherwise authorise from leaving the
 * page. See `state/actions/remote.js`.
 *
 * The content is chosen so that one screen shows every cell state a learner will
 * meet: available, booked, full, and unavailable. A tour of an empty grid would
 * be a tour of nothing, which is the whole reason this exists rather than coach
 * marks over the user's own (empty) app.
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
 * Load the practice event into a model.
 *
 * Takes the model rather than returning a new one, mirroring `EventModel.load`:
 * the app drives a single `currentEvent` that other modules hold a reference to,
 * so swapping the object would leave them pointing at the old one.
 *
 * @param {import('../../state/event.svelte.js').EventModel} event
 * @param {Date} [now] injectable clock, for tests
 * @returns {import('../../state/event.svelte.js').EventModel} the same model
 */
export function buildPracticeEvent(event, now = new Date()) {
  event.reset();

  event.sandbox = true;
  event.id = PRACTICE_EVENT_ID;
  event.code = PRACTICE_CODE;
  event.title = PRACTICE_TITLE;
  event.description = 'A pretend event, so you can try everything without '
    + 'creating anything real.';
  event.isPublished = true;
  event.timezone = localZone();
  event.allowMultiuserSignups = true;

  const morning = new EventWindow({
    begin: nextSaturday(9, now),
    end: nextSaturday(12, now),
    timezone: event.timezone,
  });
  const afternoon = new EventWindow({
    begin: nextSaturday(13, now),
    end: nextSaturday(16, now),
    timezone: event.timezone,
  });
  event.windows = [morning, afternoon];

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

  event.activities = [setUp, bake];

  event.details = [new Detail({
    type: 'STRING',
    label: 'What are you bringing?',
    hint: PRACTICE_ANSWER,
    required: true,
    priority: 0,
  })];

  return event;
}
