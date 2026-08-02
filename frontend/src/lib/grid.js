/**
 * Event-grid layout math, extracted so it can be tested without a DOM.
 *
 * The grid is activities (columns) x windows (rows), with a fixed column cap
 * and horizontal paging via a slider. All windows always render; only the
 * activity axis is windowed. See docs/legacy/01-behavior.md §2.3-§2.5.
 *
 * The legacy computed all of this inline in renderEventTable and lost the step
 * on every refresh, because refreshTable took a `step` argument and then failed
 * to forward it (behavior §6.4). Here the visible range is a pure function of
 * the step, so the two cannot drift.
 */

/** One label column plus up to four activity columns. */
export const MAX_TABLE_COLS = 5;

/** Total grid columns, including the leading window-label column. */
export const colsFor = (activityCount) =>
  activityCount >= MAX_TABLE_COLS ? MAX_TABLE_COLS : activityCount + 1;

/** How many activity columns are visible — always one fewer than the total. */
export const visibleActivityCount = (activityCount) => colsFor(activityCount) - 1;

/**
 * Highest slider position. With 4 visible activity columns, the last page
 * starts at `activityCount - 3`.
 */
export const maxStep = (activityCount) =>
  activityCount > MAX_TABLE_COLS - 2 ? activityCount - (MAX_TABLE_COLS - 2) : 1;

/** Clamp a step into the valid range, tolerating NaN. */
export function clampStep(step, activityCount) {
  const max = maxStep(activityCount);
  const n = Number(step);
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(Math.trunc(n), 1), max);
}

/**
 * The activities visible at a given step.
 * @returns {{start: number, end: number}} half-open index range
 */
export function visibleRange(step, activityCount) {
  const start = clampStep(step, activityCount) - 1;
  return { start, end: start + visibleActivityCount(activityCount) };
}

/** @template T @param {T[]} activities @returns {T[]} */
export function visibleActivities(activities, step) {
  const { start, end } = visibleRange(step, activities.length);
  return activities.slice(start, end);
}

/**
 * Label and Bulma classes for one slot cell.
 *
 * The condition order is normative — a disabled slot reads "Unavailable" even
 * when it would also be at capacity. See docs/legacy/02-aesthetics.md §3.1.
 *
 * @param {object} args
 * @param {boolean} args.enabled
 * @param {boolean} args.editing     grid is in edit mode
 * @param {boolean} args.hasRsvp     the selected volunteer holds this slot
 * @param {boolean} args.atCapacity  slot or parent activity is full
 * @param {number}  args.rsvpCount
 * @param {number}  args.cap         0 means unlimited
 */
export function slotCell({ enabled, editing, hasRsvp, atCapacity, rsvpCount = 0, cap = 0 }) {
  if (!enabled) return { label: 'Unavailable', aesthetics: 'is-outlined is-light' };
  if (editing) return { label: `${rsvpCount} / ${cap}`, aesthetics: 'is-outlined is-primary' };
  if (hasRsvp) return { label: 'Booked', aesthetics: 'is-outlined is-warning' };
  if (atCapacity) return { label: 'At Capacity', aesthetics: 'is-outlined is-light' };
  return { label: 'Available', aesthetics: 'is-outlined is-primary' };
}

/** The full `ul` class string for a cell, in the legacy's order. */
export const cellClasses = (aesthetics) =>
  `block-list is-small is-centered${aesthetics ? ` ${aesthetics}` : ''}`;

/** Shown when the event has neither activities nor windows. */
export const EMPTY_GRID_MESSAGE =
  "You haven't added any windows or activities to your event yet!";

export const isEmptyGrid = (activityCount, windowCount) =>
  activityCount === 0 && windowCount === 0;
