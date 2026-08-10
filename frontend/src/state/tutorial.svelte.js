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
 * them and has never seen it. They share one practice event: the organizer
 * track ends by looking at what its volunteers will see, and the volunteer
 * track starts there.
 */
import { buildPracticeEvent } from '../lib/tutorial/sandbox.js';
import { buildPracticePoll } from '../lib/tutorial/pollSandbox.js';
import { Volunteer } from './entities.svelte.js';
import { PRACTICE_ANSWER, PRACTICE_VOLUNTEER } from '../lib/tutorial/markers.js';
import { Mode } from './event.svelte.js';

/** @typedef {'organizer'|'volunteer'|'builder'|'poll'} Track */

/**
 * The tracks, and which practice model each one teaches on.
 *
 * `subject` is what the shell has to know: three of these drive the practice
 * event and one drives the practice poll, and `enter` is handed whichever it
 * is. Without this the shell would be guessing from the track name, which is
 * the sort of thing that works until somebody adds a fifth track.
 *
 * There are four because there are four newcomers, not because four is tidy.
 * The organizer is deciding whether this tool does what they need; the
 * volunteer is holding a link and has never seen the landing page; the builder
 * already knows what it does and wants to know what every switch means; and the
 * poll organizer wants the other feature entirely.
 */
export const TRACKS = {
  organizer: { subject: 'event', label: "I'm organizing an event" },
  volunteer: { subject: 'event', label: "I'm signing up for an event" },
  builder: { subject: 'event', label: 'Show me every event setting' },
  poll: { subject: 'poll', label: "I'm finding a time that suits everybody" },
};

/** @param {string} track @returns {boolean} */
export const isTrack = (track) => Object.hasOwn(TRACKS, track);

/** @param {Track} track @returns {'event'|'poll'} */
export const subjectOf = (track) => TRACKS[track]?.subject ?? 'event';

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
 *
 * `mode` says which surface the step is about, when it is not the default one.
 * Most of what an organizer can set only exists in the editor, so a tour that
 * could only ever show the view surface could not describe half the product.
 * Making it a property of the step rather than something twenty `enter` bodies
 * each assert means the tutorial applies it once, in one place, before the step
 * runs.
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
    id: 'paging',
    track: 'organizer',
    anchor: '#view-event-slider',
    enter(event) {
      // Back to the first page, so the step describes what is on screen however
      // far the learner dragged it before reaching here.
      event.step = 1;
    },
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
    id: 'v-paging',
    track: 'volunteer',
    anchor: '#view-event-slider',
    enter(event) {
      event.step = 1;
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
  // --- builder -------------------------------------------------------------
  //
  // The event editor, which the other two tracks deliberately never enter. Most
  // of what an organizer can decide lives behind "Modify Event", so before this
  // track existed the tour could describe the grid and almost nothing about the
  // settings that govern it.
  {
    id: 'b-welcome',
    track: 'builder',
    anchor: null,
    mode: 'EDIT',
  },
  {
    id: 'b-summary',
    track: 'builder',
    anchor: '[data-testid="edit-summary"]',
    mode: 'EDIT',
  },
  {
    id: 'b-notify',
    track: 'builder',
    anchor: '[data-testid="edit-summary"]',
    mode: 'EDIT',
  },
  {
    id: 'b-one-each',
    track: 'builder',
    anchor: '[data-testid="edit-summary"]',
    mode: 'EDIT',
  },
  {
    id: 'b-timezone',
    track: 'builder',
    anchor: '[data-testid="edit-summary"]',
    mode: 'EDIT',
  },
  {
    id: 'b-reminders',
    track: 'builder',
    anchor: '[data-testid="edit-summary"]',
    mode: 'EDIT',
  },
  {
    id: 'b-activity',
    track: 'builder',
    anchor: '[data-testid="add-activity"]',
    mode: 'EDIT',
  },
  {
    id: 'b-caps',
    track: 'builder',
    anchor: '[data-testid="add-activity"]',
    mode: 'EDIT',
  },
  {
    id: 'b-slot-cap',
    track: 'builder',
    anchor: '#view-event-table [data-slot-state="editing"]',
    mode: 'EDIT',
  },
  {
    id: 'b-reorder',
    track: 'builder',
    anchor: '#view-event-table',
    mode: 'EDIT',
    enter(event) {
      event.step = 1;
    },
  },
  {
    id: 'b-window',
    track: 'builder',
    anchor: '[data-testid="add-window"]',
    mode: 'EDIT',
  },
  {
    id: 'b-fields',
    track: 'builder',
    anchor: '[data-testid="add-field"]',
    mode: 'EDIT',
  },
  {
    id: 'b-required',
    track: 'builder',
    anchor: '#view-event-details',
    mode: 'EDIT',
  },
  {
    id: 'b-report',
    track: 'builder',
    anchor: '#view-event-buttons',
    mode: 'VIEW',
  },
  {
    id: 'b-share',
    track: 'builder',
    anchor: '[data-testid="event-title"]',
    mode: 'VIEW',
  },
  {
    id: 'b-expiry',
    track: 'builder',
    anchor: '#view-event-buttons',
    mode: 'VIEW',
  },
  {
    id: 'b-dashboard',
    track: 'builder',
    anchor: null,
    mode: 'VIEW',
  },
  {
    id: 'b-delete',
    track: 'builder',
    anchor: '[data-testid="edit-summary"]',
    mode: 'EDIT',
  },
  {
    id: 'b-publish',
    track: 'builder',
    anchor: '[data-testid="publish-event"]',
    mode: 'CREATE',
  },
  {
    id: 'b-done',
    track: 'builder',
    anchor: null,
    mode: 'CREATE',
  },

  // --- poll ----------------------------------------------------------------
  {
    id: 'p-welcome',
    track: 'poll',
    anchor: null,
  },
  {
    id: 'p-scope',
    track: 'poll',
    anchor: '[data-testid="poll-summary"]',
  },
  {
    id: 'p-columns',
    track: 'poll',
    anchor: '#view-poll-table',
    enter(poll) {
      poll.step = 1;
    },
  },
  {
    id: 'p-time-mode',
    track: 'poll',
    anchor: '[data-testid="poll-summary"]',
  },
  {
    id: 'p-viewer-zone',
    track: 'poll',
    anchor: '#view-poll-answer',
  },
  {
    id: 'p-all-day',
    track: 'poll',
    anchor: '#view-poll-table',
    enter(poll) {
      // The all-day column is the fifth, so the slider has to be at the end for
      // the step to be describing something on screen.
      poll.step = poll.maxStep;
    },
  },
  {
    id: 'p-window',
    track: 'poll',
    anchor: '[data-testid="add-poll-window"]',
    mode: 'EDIT',
  },
  {
    id: 'p-repeat',
    track: 'poll',
    anchor: '[data-testid="add-poll-window"]',
    mode: 'EDIT',
  },
  {
    id: 'p-apply',
    track: 'poll',
    anchor: '[data-testid="add-poll-window"]',
    mode: 'EDIT',
  },
  {
    id: 'p-cells',
    track: 'poll',
    anchor: '#view-poll-table [data-slot-state="available"]',
    enter(poll) {
      poll.step = 1;
    },
  },
  {
    id: 'p-fields',
    track: 'poll',
    anchor: '[data-testid="add-poll-field"]',
    mode: 'EDIT',
  },
  {
    id: 'p-deadline',
    track: 'poll',
    anchor: '[data-testid="poll-summary"]',
  },
  {
    id: 'p-one-answer',
    track: 'poll',
    anchor: '[data-testid="poll-summary"]',
  },
  {
    id: 'p-edit-answers',
    track: 'poll',
    anchor: '[data-testid="poll-summary"]',
  },
  {
    id: 'p-visibility',
    track: 'poll',
    anchor: '[data-testid="poll-summary"]',
  },
  {
    id: 'p-publish',
    track: 'poll',
    anchor: '[data-testid="publish-poll"]',
    mode: 'CREATE',
  },
  {
    id: 'p-code',
    track: 'poll',
    anchor: '[data-testid="poll-share"]',
  },
  {
    id: 'p-answer',
    track: 'poll',
    anchor: '#view-poll-buttons',
  },
  {
    id: 'p-results',
    track: 'poll',
    anchor: '[data-testid="poll-results"]',
  },
  {
    id: 'p-done',
    track: 'poll',
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
  /**
   * The practice model's id, captured when the tour starts.
   *
   * Needed because a step whose mode is CREATE has to clear the id and a later
   * one has to put it back, and only the sandbox knows what it was.
   */
  practiceID = null;

  begin(track, subject, copy) {
    this.track = track;
    this.copy = copy;
    this.index = 0;
    this.choosing = false;
    this.running = true;
    this.practiceID = subject?.id ?? null;
    this.#arrive(subject);
  }

  next(subject) {
    if (this.atEnd) return false;
    this.index += 1;
    this.#arrive(subject);
    return true;
  }

  back(subject) {
    if (this.index === 0) return false;
    this.index -= 1;
    this.#arrive(subject);
    return true;
  }

  /**
   * Put the practice model on the surface this step is about, then run the
   * step's own choreography.
   *
   * Mode before `enter`, always: a step that seeds something into the editor is
   * describing the editor, and running it against the view surface would put
   * the change somewhere nobody can see it.
   */
  #arrive(subject) {
    if (!subject) return;
    applyMode(subject, this.step?.mode ?? null, this.practiceID);
    this.step?.enter?.(subject);
  }

  stop() {
    this.running = false;
    this.practiceID = null;
    this.choosing = false;
    this.track = null;
    this.index = 0;
  }
}

export const tutorial = new Tutorial();

/**
 * Put a practice model onto a particular surface.
 *
 * `mode` is derived rather than assignable on both models -- it is a function
 * of whether there is an id and whether `editing` is set -- so this drives
 * those two rather than trying to set it.
 *
 * @param {object} subject the practice event or poll
 * @param {'VIEW'|'EDIT'|'CREATE'|null} mode
 * @param {string|null} practiceID the sandbox id to restore
 */
export function applyMode(subject, mode, practiceID) {
  if (!mode) return subject;
  if (mode === 'CREATE') {
    // No id is what makes it a draft. The sandbox flag is redundant here --
    // `isRemote` is already false without an id -- but it is left alone,
    // because a later step puts the id back and the flag is what keeps that
    // safe.
    subject.id = null;
    subject.editing = false;
    return subject;
  }
  subject.id = practiceID;
  subject.editing = mode === 'EDIT';
  return subject;
}

/**
 * Load the practice event into the app's event model.
 *
 * One event for all three of its tracks, not three. The volunteer track starts
 * partway into the organizer's world -- already built, already shared, which is
 * what a volunteer is handed -- and the builder track goes behind it into the
 * editor. They differ in where the tour begins and what it looks at, not in
 * what it is about.
 *
 * @param {object} event the model to load into
 * @param {{mode?: 'VIEW'|'EDIT'|'CREATE'}} [opts] the surface to start on
 */
export function loadPracticeEvent(event, { mode = 'VIEW' } = {}) {
  buildPracticeEvent(event);
  applyMode(event, mode, event.id);

  // The assertion is kept and generalised rather than dropped. Its job was
  // always to catch a stale flag silently putting the tour on a surface it was
  // not written for; that job did not go away when more than one surface became
  // legal, it just stopped being expressible as a single constant.
  if (event.mode !== Mode[mode]) {
    throw new Error(`the practice event must be in ${mode} mode for this track`);
  }
  return event;
}

/**
 * Load the practice poll into the app's poll model.
 *
 * @param {object} poll the model to load into
 * @param {{mode?: 'VIEW'|'EDIT'|'CREATE'}} [opts] the surface to start on
 */
export function loadPracticePoll(poll, { mode = 'VIEW' } = {}) {
  buildPracticePoll(poll);
  applyMode(poll, mode, poll.id);

  if (poll.mode !== Mode[mode]) {
    throw new Error(`the practice poll must be in ${mode} mode for this track`);
  }
  return poll;
}
