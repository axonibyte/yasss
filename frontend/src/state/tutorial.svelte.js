/**
 * The guided tutorial: which track, which step, and what each step does.
 *
 * The step list is code and the words are not. Anchors, ordering, the surface a
 * step is about and the choreography it performs on the practice model are
 * structural -- they break loudly when the UI moves -- while the prose is
 * operator-authored and shipped in `content/tutorial.md`.
 * `lib/tutorial/deck.js` merges the two, and every step carries a built-in
 * default so a deployment with no file configured still teaches somebody
 * something.
 *
 * ## Show, do not describe
 *
 * The two creation tracks build their practice model in front of the learner,
 * from the front page forwards: the step about "Create Poll" points at the
 * navbar item, the step about "Whose clock?" opens the real settings form and
 * highlights that field inside it, and the step about repeating a time opens
 * the real time form with a repeat already configured so the preview is on
 * screen while the copy explains it.
 *
 * This is not decoration. A tour that describes a modal from outside it is
 * talking about something the reader cannot see, and every one of those steps
 * reads as a non sequitur -- which is exactly what the first version of the
 * poll track did, and exactly what was reported. Three things carry the rule:
 *
 *   - `stage` says whether the practice model is on screen at all, so a step
 *     can sit on the landing page where the create buttons live;
 *   - `modal` names a dialog the tour opens, so a step can point inside one;
 *   - `enter` applies the change the step just described, so the grid grows a
 *     column when the step about columns runs.
 *
 * The two participant tracks do none of this and should not: somebody who
 * followed a link is handed something finished, and building it in front of
 * them would teach a screen they will never see. They load the finished
 * practice model, and their `modal` steps open the answering form -- which is
 * the one dialog a participant does meet.
 */
import {
  buildPracticeEvent, draftPracticeEvent, publishPracticeEvent,
  seedPracticeActivities, seedPracticeQuestion as seedEventQuestion,
  seedPracticeWindows,
} from '../lib/tutorial/sandbox.js';
import {
  buildPracticePoll, draftPracticePoll, publishPracticePoll,
  seedPracticeQuestion as seedPollQuestion, seedPracticeTimes,
} from '../lib/tutorial/pollSandbox.js';
import { Volunteer } from './entities.svelte.js';
import {
  PRACTICE_ANSWER, PRACTICE_EVENT_ID, PRACTICE_POLL_ID, PRACTICE_VOLUNTEER,
} from '../lib/tutorial/markers.js';
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
 * `build` is the other half of that. A creation track starts from a draft and
 * assembles it as it goes; a participant track starts from something finished,
 * because that is what being sent a link gives you.
 *
 * There are four because there are four newcomers, not because four is tidy.
 * The organizer is deciding whether this tool does what they need; the
 * volunteer is holding a link and has never seen the landing page; the voter
 * likewise; and the poll organizer wants the other feature entirely.
 */
export const GROUPS = {
  organizing: { label: "I'm organizing an event" },
  participant: { label: "I'm an event participant" },
};

export const TRACKS = {
  poll: {
    group: 'organizing',
    subject: 'poll',
    build: 'draft',
    label: 'I need to find a good event time',
  },
  organizer: {
    group: 'organizing',
    subject: 'event',
    build: 'draft',
    label: 'I know when my event takes place already',
  },
  voter: {
    group: 'participant',
    subject: 'poll',
    build: 'ready',
    label: "I'm voting for an event time",
  },
  volunteer: {
    group: 'participant',
    subject: 'event',
    build: 'ready',
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

/** @param {Track} track @returns {'draft'|'ready'} */
export const buildOf = (track) => TRACKS[track]?.build ?? 'ready';

/**
 * The sandbox id each practice model takes once the tour "publishes" it.
 *
 * A constant rather than whatever id the model happened to carry when the tour
 * began: a creation track begins with no id at all, so an observed one would be
 * null and the step that returns to the published surface would have nothing to
 * restore.
 */
const PRACTICE_ID = { event: PRACTICE_EVENT_ID, poll: PRACTICE_POLL_ID };

/**
 * One step.
 *
 * `anchor` is a selector for the thing being talked about; it gets a highlight
 * and nothing else -- never `inert` on its surroundings, because the learner has
 * to be able to click it. A null anchor means the step is about the page as a
 * whole. It may match several elements, and does where the subject is plural:
 * "every column is a day" is four columns, and highlighting the table instead
 * highlights the time axis and the blank corner as well.
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
 *
 * `stage` is `'home'` for a step that belongs on the landing page -- where the
 * create buttons are, and therefore where a creation tour has to start -- and
 * `'subject'`, the default, for everything after.
 *
 * `modal` is a dialog the tour opens on arrival, and closes again on any step
 * that does not name one. It is a plain descriptor because that is what the
 * shell's own modal state is; the tour is using the same door every button in
 * the app uses.
 */
const STEPS = [
  // --- organizer -----------------------------------------------------------
  //
  // One track, because anybody who needs the grid explained needs the settings
  // explained too. It builds an event from the front page: the summary form
  // first, then columns, then rows, then the questions, then publish -- which
  // is the order the product itself imposes, so the tour cannot teach a
  // sequence the app will not accept.
  {
    id: 'welcome',
    track: 'organizer',
    anchor: null,
    stage: 'home',
    mode: 'CREATE',
  },
  {
    id: 'b-create',
    track: 'organizer',
    anchor: '[data-testid="nav-create-event"]',
    stage: 'home',
    mode: 'CREATE',
  },
  {
    id: 'b-summary',
    track: 'organizer',
    anchor: '[data-field="event-title"], [data-field="event-description"]',
    stage: 'home',
    mode: 'CREATE',
    modal: { kind: 'summary', summary: null, isNew: true, prefill: true },
  },
  {
    id: 'b-notify',
    track: 'organizer',
    anchor: '[data-field="event-notify"]',
    stage: 'home',
    mode: 'CREATE',
    modal: { kind: 'summary', summary: null, isNew: true, prefill: true },
  },
  {
    id: 'b-one-each',
    track: 'organizer',
    anchor: '[data-field="event-multiuser"]',
    stage: 'home',
    mode: 'CREATE',
    modal: { kind: 'summary', summary: null, isNew: true, prefill: true },
  },
  {
    id: 'b-timezone',
    track: 'organizer',
    anchor: '[data-field="event-timezone"]',
    stage: 'home',
    mode: 'CREATE',
    modal: { kind: 'summary', summary: null, isNew: true, prefill: true },
  },
  {
    id: 'b-reminders',
    track: 'organizer',
    anchor: '[data-field="event-lead-time"]',
    stage: 'home',
    mode: 'CREATE',
    modal: { kind: 'summary', summary: null, isNew: true, prefill: true },
  },
  {
    id: 'grid',
    track: 'organizer',
    anchor: '#view-event-table',
    mode: 'CREATE',
  },
  {
    id: 'b-window',
    track: 'organizer',
    anchor: '[data-field="event-window"]',
    mode: 'CREATE',
    modal: { kind: 'window', win: null, isNew: true },
  },
  {
    id: 'b-activity',
    track: 'organizer',
    anchor: '[data-field="activity-label"], [data-field="activity-description"]',
    mode: 'CREATE',
    modal: { kind: 'activity', activity: null, isNew: true },
    enter(event) {
      // What pressing "Save Window" on the step before would have done. The
      // rows are on the grid behind this dialog now, which is what makes the
      // next thing -- columns -- legible as the other axis.
      seedPracticeWindows(event);
    },
  },
  {
    id: 'b-caps',
    track: 'organizer',
    anchor: '[data-field="activity-vol-cap"], [data-field="activity-slot-cap"]',
    mode: 'CREATE',
    modal: { kind: 'activity', activity: null, isNew: true },
  },
  {
    id: 'b-columns',
    track: 'organizer',
    anchor: '#view-event-table [data-col]',
    mode: 'CREATE',
    enter(event) {
      seedPracticeActivities(event);
      event.step = 1;
    },
  },
  {
    id: 'cells',
    track: 'organizer',
    // One square, named by its coordinates rather than by its state: the copy
    // describes what a single tile shows and then tells the learner to click
    // it, and outlining all eight of them would say something plural about a
    // singular instruction. It is also the square `b-slot-cap` opens next --
    // that step resolves to the first activity and the first window.
    anchor: '#view-event-table [data-col="0"][data-row="0"]',
    mode: 'CREATE',
    enter(event) {
      event.step = 1;
    },
  },
  {
    id: 'b-slot-cap',
    track: 'organizer',
    anchor: '[data-field="slot-enabled"], [data-field="slot-cap"]',
    mode: 'CREATE',
    modal: { kind: 'slot', tutorial: true },
  },
  {
    id: 'paging',
    track: 'organizer',
    anchor: '#view-event-slider',
    mode: 'CREATE',
    enter(event) {
      // Back to the first page, so the step describes what is on screen however
      // far the learner dragged it before reaching here.
      event.step = 1;
    },
  },
  {
    id: 'b-reorder',
    track: 'organizer',
    anchor: '#view-event-table [data-col="0"]',
    mode: 'CREATE',
    enter(event) {
      event.step = 1;
    },
  },
  {
    id: 'b-fields',
    track: 'organizer',
    anchor: '[data-field="detail-type"], [data-field="detail-label"]',
    mode: 'CREATE',
    modal: { kind: 'detail', detail: null, isNew: true },
  },
  {
    id: 'b-required',
    track: 'organizer',
    anchor: '[data-field="detail-required"]',
    mode: 'CREATE',
    modal: { kind: 'detail', detail: null, isNew: true },
  },
  {
    id: 'b-publish',
    track: 'organizer',
    anchor: '[data-testid="publish-event"]',
    mode: 'CREATE',
    enter(event) {
      seedEventQuestion(event);
    },
  },
  {
    id: 'share',
    track: 'organizer',
    anchor: '[data-testid="share"]',
    enter(event) {
      publishPracticeEvent(event);
    },
  },
  {
    id: 'b-report',
    track: 'organizer',
    anchor: '[data-testid="view-report"]',
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
    id: 'structure',
    track: 'organizer',
    anchor: '[data-testid="modify-event"]',
    mode: 'VIEW',
  },
  // There was a `b-delete` step here, and it is gone rather than reworded.
  // It said an event could be deleted from its editor. `DELETE /v1/events/:id`
  // exists and `api.deleteEvent` wraps it, but nothing in the interface calls
  // either -- there is no delete control on an event anywhere, so the step was
  // confidently describing a button that has never existed. A poll has one and
  // that is why the poll track can talk about deleting; an event does not.
  // Saying nothing is the honest option until there is something to point at.
  {
    id: 'as-a-volunteer',
    track: 'organizer',
    anchor: '#view-event-volunteer',
    mode: 'VIEW',
  },
  {
    id: 'b-done',
    track: 'organizer',
    anchor: null,
    // Deliberately no mode. It closes the track and points at nothing, so it
    // should stay on whatever surface the step before it left the learner on --
    // which is the published event.
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
    id: 'v-form',
    track: 'volunteer',
    anchor: '[data-field="vol-name"]',
    modal: { kind: 'volunteer', volunteer: null },
  },
  {
    id: 'v-fields',
    track: 'volunteer',
    anchor: '[data-field^="vol-detail-"]',
    modal: { kind: 'volunteer', volunteer: null },
  },
  {
    id: 'v-picker',
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
  //
  // The track the rebuild started from. It used to open on a finished poll and
  // describe a creation flow over the top of it: the step about choosing days
  // pointed at columns that were already chosen and could no longer be changed,
  // and the steps about repeating a time and about which days it applies to
  // described a form the learner never saw and, on the surface they were
  // standing on, could not have opened.
  {
    id: 'p-welcome',
    track: 'poll',
    anchor: null,
    stage: 'home',
    mode: 'CREATE',
  },
  {
    id: 'p-create',
    track: 'poll',
    anchor: '[data-testid="nav-create-poll"]',
    stage: 'home',
    mode: 'CREATE',
  },
  {
    id: 'p-scope',
    track: 'poll',
    anchor: '[data-field="poll-scope"]',
    stage: 'home',
    mode: 'CREATE',
    modal: { kind: 'poll-summary', isNew: true, prefill: true },
  },
  {
    id: 'p-days',
    track: 'poll',
    anchor: '[data-field="day-picker"]',
    stage: 'home',
    mode: 'CREATE',
    modal: { kind: 'poll-summary', isNew: true, prefill: true },
  },
  {
    id: 'p-time-mode',
    track: 'poll',
    anchor: '[data-field="poll-time-mode"]',
    stage: 'home',
    mode: 'CREATE',
    modal: { kind: 'poll-summary', isNew: true, prefill: true },
  },
  {
    id: 'p-deadline',
    track: 'poll',
    anchor: '[data-field="poll-deadline"]',
    stage: 'home',
    mode: 'CREATE',
    modal: { kind: 'poll-summary', isNew: true, prefill: true },
  },
  {
    id: 'p-visibility',
    track: 'poll',
    anchor: '[data-field="poll-visibility"]',
    stage: 'home',
    mode: 'CREATE',
    modal: { kind: 'poll-summary', isNew: true, prefill: true },
  },
  {
    id: 'p-one-answer',
    track: 'poll',
    anchor: '[data-field="poll-multi"]',
    stage: 'home',
    mode: 'CREATE',
    modal: { kind: 'poll-summary', isNew: true, prefill: true },
  },
  {
    id: 'p-edit-answers',
    track: 'poll',
    anchor: '[data-field="poll-edits"]',
    stage: 'home',
    mode: 'CREATE',
    modal: { kind: 'poll-summary', isNew: true, prefill: true },
  },
  {
    id: 'p-columns',
    track: 'poll',
    // Every day column, one highlight each. Not the table: that would box the
    // time axis and the blank corner in with them, and neither is a day.
    anchor: '#view-poll-table [data-col]',
    mode: 'CREATE',
    enter(poll) {
      poll.step = 1;
    },
  },
  {
    id: 'p-window',
    track: 'poll',
    anchor: '[data-testid="add-poll-window"]',
    mode: 'CREATE',
  },
  {
    id: 'p-window-start',
    track: 'poll',
    anchor: '[data-field="poll-window-start"]',
    mode: 'CREATE',
    modal: {
      kind: 'poll-window',
      win: null,
      // Opened with a repeat already set up, so the two steps after this one
      // have their fields -- and the live preview of what they produce -- on
      // screen. With the switch off, neither control is rendered at all.
      preset: {
        start: '09:00', repeat: true, hours: 4, minutes: 0, until: '17:00', mode: 'all',
      },
    },
  },
  {
    id: 'p-repeat',
    track: 'poll',
    anchor: '[data-field="poll-repeat"], [data-field="poll-repeat-every"], '
      + '[data-field="poll-repeat-until"]',
    mode: 'CREATE',
    modal: {
      kind: 'poll-window',
      win: null,
      preset: {
        start: '09:00', repeat: true, hours: 4, minutes: 0, until: '17:00', mode: 'all',
      },
    },
  },
  {
    id: 'p-apply',
    track: 'poll',
    anchor: '[data-field="poll-apply-to"]',
    mode: 'CREATE',
    modal: {
      kind: 'poll-window',
      win: null,
      preset: {
        start: '09:00', repeat: true, hours: 4, minutes: 0, until: '17:00', mode: 'all',
      },
    },
  },
  {
    id: 'p-cells',
    track: 'poll',
    anchor: '#view-poll-table [data-slot-state="editing"]',
    mode: 'CREATE',
    enter(poll) {
      seedPracticeTimes(poll);
      poll.step = 1;
    },
  },
  {
    id: 'p-all-day',
    track: 'poll',
    anchor: '#view-poll-table [data-testid="all-day-toggle"]',
    mode: 'CREATE',
    enter(poll) {
      // The all-day column is the fifth, so the slider has to be at the end for
      // the step to be describing something on screen.
      poll.step = poll.maxStep;
    },
  },
  {
    id: 'p-fields',
    track: 'poll',
    anchor: '[data-field="detail-type"], [data-field="detail-required"]',
    mode: 'CREATE',
    modal: { kind: 'poll-detail', detail: null, isNew: true },
  },
  {
    id: 'p-publish',
    track: 'poll',
    anchor: '[data-testid="publish-poll"]',
    mode: 'CREATE',
    enter(poll) {
      seedPollQuestion(poll);
    },
  },
  {
    id: 'p-code',
    track: 'poll',
    anchor: '[data-testid="poll-share"]',
    mode: 'VIEW',
    enter(poll) {
      publishPracticePoll(poll);
    },
  },
  {
    id: 'p-answer',
    track: 'poll',
    anchor: '[data-field="poll-answer-name"]',
    mode: 'VIEW',
    modal: { kind: 'poll-answer' },
  },
  {
    id: 'p-results',
    track: 'poll',
    anchor: '[data-testid="poll-results"]',
    mode: 'VIEW',
  },
  {
    id: 'p-done',
    track: 'poll',
    anchor: null,
    mode: 'VIEW',
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
    anchor: '#view-poll-table [data-col]',
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
    anchor: '[data-field="poll-answer-name"]',
    modal: { kind: 'poll-answer' },
  },
  {
    id: 'vo-once',
    track: 'voter',
    anchor: '[data-testid="fingerprint-notice"]',
    modal: { kind: 'poll-answer' },
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

  /**
   * The sandbox id this tour's practice model takes once it is published.
   *
   * A step whose mode is CREATE clears the id and a later one puts it back, and
   * the value is a constant of the sandbox rather than something observed --
   * see `PRACTICE_ID`.
   */
  practiceID = $derived(this.track ? PRACTICE_ID[subjectOf(this.track)] : null);

  /** Whether the current step belongs on the landing page rather than the model. */
  atHome = $derived(this.step?.stage === 'home');

  /** The dialog this step wants open, or null for none. */
  modal = $derived(this.step?.modal ?? null);

  open() {
    this.choosing = true;
  }

  /**
   * @param {Track} track
   * @param {object} subject the practice event or poll, already built
   * @param {Record<string,string>} copy
   */
  begin(track, subject, copy) {
    this.track = track;
    this.copy = copy;
    this.index = 0;
    this.choosing = false;
    this.running = true;
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
 * `build` is the track's, not the caller's guess: the organizer track assembles
 * an event from a draft and the volunteer track is handed a finished one, and
 * which of those a track wants is declared beside the track.
 *
 * @param {object} event the model to load into
 * @param {{mode?: 'VIEW'|'EDIT'|'CREATE', build?: 'draft'|'ready'}} [opts]
 */
export function loadPracticeEvent(event, { mode = 'VIEW', build = 'ready' } = {}) {
  if (build === 'draft') draftPracticeEvent(event);
  else buildPracticeEvent(event);
  applyMode(event, mode, PRACTICE_EVENT_ID);

  // The assertion is kept and generalized rather than dropped. Its job was
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
 * @param {{mode?: 'VIEW'|'EDIT'|'CREATE', build?: 'draft'|'ready'}} [opts]
 */
export function loadPracticePoll(poll, { mode = 'VIEW', build = 'ready' } = {}) {
  if (build === 'draft') draftPracticePoll(poll);
  else buildPracticePoll(poll);
  applyMode(poll, mode, PRACTICE_POLL_ID);

  if (poll.mode !== Mode[mode]) {
    throw new Error(`the practice poll must be in ${mode} mode for this track`);
  }
  return poll;
}
