/**
 * The strings that identify the tutorial's practice event.
 *
 * **This module must not import anything.** The seeded journey drivers
 * (`e2e/journeys/`) are plain ESM run by node against the mounted repo, with no
 * bundler and no Svelte runtime, and they import this file directly so they can
 * ask the server whether any of these strings ever reached it. A single import
 * of anything under `src/state/` would drag in `$state` and break that.
 *
 * They live apart from `sandbox.js` for that reason alone. The alternative --
 * the drivers hard-coding the same literals -- means the leak check goes on
 * passing while hunting for a string nobody writes any more, from the first time
 * somebody renames the bake sale.
 *
 * Distinctive on purpose: `PRACTICE_TITLE` has to be something no real organiser
 * would type, because the check that matters is "does this appear anywhere on
 * the server", and a common word would make that question unanswerable.
 */

/** The practice event's title. */
export const PRACTICE_TITLE = 'Bake Sale (tutorial practice event)';

/** The short code the tour shows when it explains sharing. */
export const PRACTICE_CODE = 'PRACTICE';

/** The volunteer the learner adds during the tour. */
export const PRACTICE_VOLUNTEER = 'Practice Volunteer';

/** The answer the tour pre-fills into the custom field. */
export const PRACTICE_ANSWER = 'A tutorial tray of practice brownies';

/**
 * The synthetic event id. Not a UUID, and deliberately not one: every real event
 * id is a UUID, so anything that reaches the API carrying this is unambiguously
 * a leak rather than a coincidence, and it cannot collide with a real row.
 */
export const PRACTICE_EVENT_ID = 'tutorial-practice-event';

/** Everything above, for a driver that wants to sweep for any of them. */
export const PRACTICE_MARKERS = [
  PRACTICE_TITLE,
  PRACTICE_CODE,
  PRACTICE_VOLUNTEER,
  PRACTICE_ANSWER,
  PRACTICE_EVENT_ID,
];
