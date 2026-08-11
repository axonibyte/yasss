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

/** @typedef {'organizer'|'volunteer'|'voter'|'poll'} Track */

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
export const GROUPS = {
  organizing: { label: "I'm organizing an event" },
  participant: { label: "I'm an event participant" },
};

export const TRACKS = {
  poll: {
    group: 'organizing',
    subject: 'poll',
    label: 'I need to find a good event time',
  },
  organizer: {
    group: 'organizing',
    subject: 'event',
    label: 'I know when my event takes place already',
  },
  voter: {
    group: 'participant',
    subject: 'poll',
    label: "I'm voting for an event time",
  },
  volunteer: {
    group: 'participant',
    subject: 'event',
    label: "I'm signing up for an event",
  },
};

/**
 * Tracks that no longer exist, and where they went.
 *
 * `?tutorial=builder` was a working entry point before the event settings were
 * folded into the organizer track. Silently opening the chooser would turn a
 * broken link into one that merely looks unhelpful, so the old name resolves to
 * the track that absorbed it.
 */
const RETIRED = { builder: 'organizer' };

/** @param {string} track @returns {Track|null} */
export const resolveTrack = (track) =>
  Object.hasOwn(TRACKS, track) ? track : (RETIRED[track] ?? null);

/** The tracks in one group, in declaration order. @param {string} group */
export const tracksIn = (group) =>
  Object.entries(TRACKS).filter(([, meta]) => meta.group === group);

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
  //
  // One track, because anybody who needs the grid explained needs the settings
  // explained too -- they were split before, and the split asked a newcomer to
  // know which half they wanted before they knew what either half contained.
  //
  // It orients on the grid first, in VIEW mode, then goes through the editor a
  // setting at a time, then publishes and shares. `b-welcome` and `b-share` are
  // gone: `welcome` and `share` already said those things, and saying them twice
  // is how a 25-step tour feels like a 30-step one.
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
    id: 'b-summary',
    track: 'organizer',
    anchor: '[data-testid="edit-summary"]',
    mode: 'EDIT',
  },
  {
    id: 'b-notify',
    track: 'organizer',
    anchor: '[data-testid="edit-summary"]',
    mode: 'EDIT',
  },
  {
    id: 'b-one-each',
    track: 'organizer',
    anchor: '[data-testid="edit-summary"]',
    mode: 'EDIT',
  },
  {
    id: 'b-timezone',
    track: 'organizer',
    anchor: '[data-testid="edit-summary"]',
    mode: 'EDIT',
  },
  {
    id: 'b-reminders',
    track: 'organizer',
    anchor: '[data-testid="edit-summary"]',
    mode: 'EDIT',
  },
  {
    id: 'b-activity',
    track: 'organizer',
    anchor: '[data-testid="add-activity"]',
    mode: 'EDIT',
  },
  {
    id: 'b-caps',
    track: 'organizer',
    anchor: '[data-testid="add-activity"]',
    mode: 'EDIT',
  },
  {
    id: 'b-slot-cap',
    track: 'organizer',
    anchor: '#view-event-table [data-slot-state="editing"]',
    mode: 'EDIT',
  },
  {
    id: 'b-reorder',
    track: 'organizer',
    anchor: '#view-event-table',
    mode: 'EDIT',
    enter(event) {
      event.step = 1;
    },
  },
  {
    id: 'b-window',
    track: 'organizer',
    anchor: '[data-testid="add-window"]',
    mode: 'EDIT',
  },
  {
    id: 'b-fields',
    track: 'organizer',
    anchor: '[data-testid="add-field"]',
    mode: 'EDIT',
  },
  {
    id: 'b-required',
    track: 'organizer',
    anchor: '#view-event-details',
    mode: 'EDIT',
  },
  {
    id: 'b-report',
    track: 'organizer',
    anchor: '#view-event-buttons',
    mode: 'VIEW',
  },
  {
    id: 'b-expiry',
    track: 'organizer',
    anchor: '#view-event-buttons',
    mode: 'VIEW',
  },
  {
    id: 'b-dashboard',
    track: 'organizer',
    anchor: null,
    mode: 'VIEW',
  },
  {
    id: 'b-delete',
    track: 'organizer',
    anchor: '[data-testid="edit-summary"]',
    mode: 'EDIT',
  },
  {
    id: 'b-publish',
    track: 'organizer',
    anchor: '[data-testid="publish-event"]',
    mode: 'CREATE',
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
  {
    id: 'b-done',
    track: 'organizer',
    anchor: null,
    // Deliberately no mode. It closes the track and points at nothing, so it
    // should stay on whatever surface the step before it left the learner on --
    // which is the published event. It carried CREATE while it followed
    // `b-publish`; once `share` and `as-a-volunteer` moved in between, that
    // became a jump back to the editor to say "that is the tour".
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

  // --- poll (organizing: finding a time) -----------------------------------
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
  // --- voter (participant: voting on a time) -------------------------------
  //
  // The poll counterpart of the volunteer track, and it exists for the same
  // reason: somebody holding a link did not come to build anything. It stays in
  // VIEW mode throughout -- a respondent has no editor and never sees one.
  //
  // No step anchors the zone picker. It renders only on a ZONED poll and the
  // practice poll is wall-clock, so an anchor there would point at nothing; the
  // copy describes it instead.
  {
    id: 'vo-welcome',
    track: 'voter',
    anchor: '[data-testid="poll-title"]',
  },
  {
    id: 'vo-grid',
    track: 'voter',
    anchor: '#view-poll-table',
    enter(poll) {
      // Back to the first page, so the step describes what is on screen however
      // far the learner dragged it before reaching here.
      poll.step = 1;
    },
  },
  {
    id: 'vo-pick',
    track: 'voter',
    anchor: '#view-poll-table [data-slot-state="available"]',
  },
  {
    id: 'vo-answer',
    track: 'voter',
    anchor: '#view-poll-answer',
  },
  {
    id: 'vo-once',
    track: 'voter',
    anchor: '#view-poll-answer',
  },
  {
    id: 'vo-submit',
    track: 'voter',
    anchor: '#view-poll-buttons',
  },
  {
    id: 'vo-results',
    track: 'voter',
    anchor: '[data-testid="poll-results"]',
  },
  {
    id: 'vo-done',
    track: 'voter',
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
