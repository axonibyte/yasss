/**
 * The guided tutorial: which track, which step, and what each step does.
 *
 * The step list is code and the words are not. Anchors, ordering and the
 * choreography a step performs on the practice event are structural -- they
 * break loudly when the UI moves -- while the prose is operator-authored and
 * shipped in `content/tutorial.md`. `lib/tutorial/deck.js` merges the two, and
 * every step carries a built-in default so a deployment with no file configured
 * still teaches somebody something.
 *
 * There are two tracks because there are two newcomers. The organizer is the
 * person on the landing page; the volunteer arrived from a link somebody sent
 * them and has never seen it. They share one practice event: the organiser
 * track ends by looking at what its volunteers will see, and the volunteer
 * track starts there.
 */
import { buildPracticeEvent } from '../lib/tutorial/sandbox.js';
import { Volunteer } from './entities.svelte.js';
import { PRACTICE_ANSWER, PRACTICE_VOLUNTEER } from '../lib/tutorial/markers.js';
import { Mode } from './event.svelte.js';

/** @typedef {'organizer'|'volunteer'} Track */

/**
 * One step.
 *
 * `anchor` is a selector for the thing being talked about; it gets a highlight
 * and nothing else -- never `inert` on its surroundings, because the learner has
 * to be able to click it. A null anchor means the step is about the page as a
 * whole.
 *
 * `enter` runs when the step becomes current and must be idempotent: stepping
 * back and forward again re-runs it, and a learner who clicked ahead should not
 * have their work undone by revisiting the step that described it.
 */
const STEPS = [
  // --- organizer -----------------------------------------------------------
  {
    id: 'welcome',
    track: 'organizer',
    anchor: null,
  },
  {
    id: 'grid',
    track: 'organizer',
    anchor: '#view-event-table',
  },
  {
    id: 'cells',
    track: 'organizer',
    // A claimable square, not the blank corner -- which is the first
    // `.event-cell` in document order and the one thing on the grid that
    // cannot be clicked.
    anchor: '#view-event-table [data-slot-state="available"]',
  },
  {
    id: 'structure',
    track: 'organizer',
    anchor: '#view-event-section',
    enter(event) {
      // Back out of edit mode if the learner wandered into it, so the step
      // describes the surface it names.
      event.editing = false;
    },
  },
  {
    id: 'share',
    track: 'organizer',
    anchor: '[data-testid="event-title"]',
  },
  {
    id: 'as-a-volunteer',
    track: 'organizer',
    anchor: '#view-event-volunteer',
  },

  // --- volunteer -----------------------------------------------------------
  {
    id: 'v-welcome',
    track: 'volunteer',
    anchor: '[data-testid="event-title"]',
  },
  {
    id: 'v-add',
    track: 'volunteer',
    anchor: '#view-event-volunteer',
  },
  {
    id: 'v-fields',
    track: 'volunteer',
    anchor: '#view-event-volunteer',
    enter(event) {
      // Give them somebody to be, rather than making the first thing they do
      // in a tutorial be filling in a form.
      if (event.volunteers.length === 0) {
        const volunteer = new Volunteer({ name: PRACTICE_VOLUNTEER });
        for (const detail of event.details) volunteer.values.set(detail.key, PRACTICE_ANSWER);
        event.addVolunteer(volunteer);
      }
    },
  },
  {
    id: 'v-claim',
    track: 'volunteer',
    // A claimable square, not the blank corner -- which is the first
    // `.event-cell` in document order and the one thing on the grid that
    // cannot be clicked.
    anchor: '#view-event-table [data-slot-state="available"]',
  },
  {
    id: 'v-submit',
    track: 'volunteer',
    anchor: '#view-event-buttons',
  },
  {
    id: 'v-done',
    track: 'volunteer',
    anchor: null,
  },
];

/** Every step id the frontend declares, in order. Read by the deck checks. */
export const stepIds = STEPS.map((s) => s.id);

/** @param {Track} track */
export const stepsFor = (track) => STEPS.filter((s) => s.track === track);

class Tutorial {
  /** @type {Track|null} */
  track = $state(null);
  index = $state(0);
  /** True once a track is chosen; the chooser shows while this is false. */
  running = $state(false);
  /** True while the chooser is up. */
  choosing = $state(false);
  /** step id -> rendered HTML, deck over defaults. Installed at start. */
  copy = $state({});

  steps = $derived(this.track ? stepsFor(this.track) : []);
  step = $derived(this.steps[this.index] ?? null);
  total = $derived(this.steps.length);
  /** 1-based, for the human-readable position. */
  position = $derived(this.index + 1);
  atEnd = $derived(this.index >= this.steps.length - 1);

  html = $derived(this.step ? (this.copy[this.step.id] ?? '') : '');

  open() {
    this.choosing = true;
  }

  /**
   * @param {Track} track
   * @param {object} event the practice event, already built
   * @param {Record<string,string>} copy
   */
  begin(track, event, copy) {
    this.track = track;
    this.copy = copy;
    this.index = 0;
    this.choosing = false;
    this.running = true;
    this.step?.enter?.(event);
  }

  next(event) {
    if (this.atEnd) return false;
    this.index += 1;
    this.step?.enter?.(event);
    return true;
  }

  back(event) {
    if (this.index === 0) return false;
    this.index -= 1;
    this.step?.enter?.(event);
    return true;
  }

  stop() {
    this.running = false;
    this.choosing = false;
    this.track = null;
    this.index = 0;
  }
}

export const tutorial = new Tutorial();

/**
 * Load the practice event into the app's event model.
 *
 * One event for both tracks, not two. The volunteer track starts partway into
 * the organizer's world -- already built, already shared, which is what a
 * volunteer is handed -- so the tracks differ in where the tour begins and not
 * in what it is about.
 *
 * @param {object} event the model to load into
 */
export function loadPracticeEvent(event) {
  buildPracticeEvent(event);
  // Both tracks view rather than edit: the id makes `mode` VIEW already, and
  // this only guards against a stale flag on a reused model.
  event.editing = false;
  if (event.mode !== Mode.VIEW) {
    throw new Error('the practice event must be in VIEW mode for the tour to work');
  }
  return event;
}
