/**
 * The poll the app is currently looking at.
 *
 * Mirrors `EventModel` in shape and reuses its `Mode`, because the three states
 * are the same three: building one that does not exist yet, editing one that
 * does, and answering one somebody sent you. What differs is underneath -- the
 * columns are days, the rows are times of day, and there is one respondent
 * rather than a list of volunteers.
 */
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { Mode } from './event.svelte.js';
import { PollCell, PollOption, PollWindow, cellKey } from './pollEntities.svelte.js';
import { clampStep, maxStep } from '../lib/grid.js';

export { Mode };

/** The six result settings, in the order the organizer is offered them. */
export const VISIBILITY = [
  'CREATOR_ONLY',
  'PUBLIC_ALWAYS',
  'PUBLIC_AFTER_CLOSE',
  'RESPONDENT_OWN',
  'RESPONDENT_ALL_AFTER_SUBMIT',
  'RESPONDENT_ALL_AFTER_CLOSE',
];

/** Which settings are meaningless without a deadline. */
export const NEEDS_DEADLINE = new Set(['PUBLIC_AFTER_CLOSE', 'RESPONDENT_ALL_AFTER_CLOSE']);

/** Which setting narrows who may answer at all. */
export const NEEDS_ACCOUNT = 'RESPONDENT_ALL_AFTER_CLOSE';

export class PollModel {
  id = $state(null);
  code = $state(null);
  title = $state('');
  description = $state('');
  scope = $state('RELATIVE');
  timeMode = $state('WALL_CLOCK');
  /** The zone the poll's times are stated in. Null on a wall-clock poll. */
  timezone = $state(null);
  /** Epoch millis, or null for a poll that never closes. */
  deadline = $state(null);
  allowMultiAnswers = $state(true);
  allowAnswerEdits = $state(true);
  resultVisibility = $state('PUBLIC_ALWAYS');
  isPublished = $state(false);
  closed = $state(false);
  requiresAuthenticatedAnswers = $state(false);

  options = $state([]);
  windows = $state([]);
  details = $state([]);
  /** cellKey -> PollCell. A square exists here iff it is offered. */
  cells = new SvelteMap();

  /** Server ids of the squares this respondent has chosen. */
  votes = new SvelteSet();
  /** cell id -> count, or null when the tally is not disclosed to us. */
  tally = $state(null);
  respondents = $state(0);
  /** The organizer's view of who answered. */
  responses = $state([]);
  /** Our own answer, once we have one. */
  ownResponse = $state(null);

  /**
   * True while this poll exists only in this browser.
   *
   * The same flag `EventModel` carries, read by the same `isRemote` guard, so a
   * tutorial poll cannot write anything anywhere.
   */
  sandbox = $state(false);
  editing = $state(false);

  /** Which page of columns the slider is showing. */
  step = $state(1);

  /** The zone the reader has asked to see times in. Display only. */
  displayZone = $state(null);

  get persisted() {
    return this.id !== null;
  }

  mode = $derived(!this.persisted ? Mode.CREATE : this.editing ? Mode.EDIT : Mode.VIEW);

  maxStep = $derived(maxStep(this.options.length));

  isEmpty = $derived(this.options.length === 0 && this.windows.length === 0);

  /** A poll that has closed can still be read; it just cannot be answered. */
  interactive = $derived(!this.closed);

  /** Whether we are allowed to see the counts at all. */
  tallyVisible = $derived(this.tally !== null);

  /** The square at an intersection, or undefined when it is not offered. */
  cell(option, win) {
    return this.cells.get(cellKey(option.key, win?.key ?? null));
  }

  /** Whether a square is offered. */
  offers(option, win) {
    return this.cells.has(cellKey(option.key, win?.key ?? null));
  }

  /** How many people chose a square, or null when that is not disclosed. */
  votesFor(cell) {
    if (this.tally === null || !cell?.id) return null;
    return this.tally[cell.id] ?? 0;
  }

  /** Whether this respondent chose a square. */
  chose(cell) {
    return Boolean(cell?.id) && this.votes.has(cell.id);
  }

  /** Offer a square. Local only; the caller decides whether to write it. */
  addCell(option, win) {
    const key = cellKey(option.key, win?.key ?? null);
    if (!this.cells.has(key)) {
      this.cells.set(key, new PollCell(option.key, win?.key ?? null));
    }
    return this.cells.get(key);
  }

  /** Withdraw a square. */
  removeCell(option, win) {
    this.cells.delete(cellKey(option.key, win?.key ?? null));
  }

  /**
   * Put the poll back to an empty draft.
   *
   * Mutates in place rather than returning a new model, mirroring
   * `EventModel.reset`: the app drives a single current poll that other modules
   * hold a reference to, so swapping the object leaves them pointing at the old
   * one.
   */
  reset() {
    this.id = null;
    this.code = null;
    this.title = '';
    this.description = '';
    this.scope = 'RELATIVE';
    this.timeMode = 'WALL_CLOCK';
    this.timezone = null;
    this.deadline = null;
    this.allowMultiAnswers = true;
    this.allowAnswerEdits = true;
    this.resultVisibility = 'PUBLIC_ALWAYS';
    this.isPublished = false;
    this.closed = false;
    this.requiresAuthenticatedAnswers = false;
    this.options = [];
    this.windows = [];
    this.details = [];
    this.cells.clear();
    this.votes.clear();
    this.tally = null;
    this.respondents = 0;
    this.responses = [];
    this.ownResponse = null;
    this.sandbox = false;
    this.editing = false;
    this.step = 1;
    this.displayZone = null;
  }

  /** Keep the slider honest when columns come and go. */
  clampStep() {
    this.step = clampStep(this.step, this.options.length);
  }
}

export { PollOption, PollWindow, PollCell };

export const currentPoll = new PollModel();
