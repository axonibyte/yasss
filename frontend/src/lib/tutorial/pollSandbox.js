/**
 * The practice poll the tutorial teaches on, in the stages a tour builds it.
 *
 * The sibling of `sandbox.js`, and built to the same rule: it exists entirely
 * in the browser, it carries a synthetic id once it is "published" so the
 * answering surface renders, and `sandbox` is what stops every write that id
 * would otherwise authorize from leaving the page. See `state/actions/remote.js`.
 *
 * **Stages, not one builder.** The poll track walks somebody through creating a
 * poll, so it cannot start from a finished one -- a step describing the days
 * you are about to choose, shown over a poll whose days are already chosen and
 * no longer changeable, describes nothing. So the tour begins at `draft` and
 * calls the seeders as it reaches the thing each one produces: the grid grows a
 * row when the step about rows runs, and the tally appears when the step about
 * tallies does.
 *
 * The voter track wants none of that -- a respondent is handed a finished poll
 * -- so `buildPracticePoll` is every stage in order, and is what that track
 * loads.
 *
 * Every seeder is idempotent. `enter` re-runs whenever a learner steps back and
 * forward again, and a second pass must not double the columns.
 */
import { PollCell, PollOption, PollResponse, PollWindow, cellKey } from '../../state/pollEntities.svelte.js';
import {
  PRACTICE_POLL_CODE, PRACTICE_POLL_ID, PRACTICE_POLL_TITLE, PRACTICE_RESPONDENT,
} from './markers.js';

/**
 * The times the practice poll offers, and the one that carries the standing rule.
 *
 * Nine, one, five: exactly what "every four hours from nine, until five"
 * produces. The poll track opens the time form with that repeat already set, so
 * the learner reads the form's own preview of three times and then watches
 * those three rows appear. Times that did not match would make the preview a
 * decoration.
 */
const TIMES = ['09:00', '13:00', '17:00'];

/** Squares deliberately left unoffered, so "Unavailable" appears without help. */
const WITHHELD = [[1, '17:00'], [4, '13:00']];

/**
 * A poll as it stands the moment its settings form is saved: settings and
 * columns, no times, no squares, no id.
 *
 * No id is what makes it a draft, and the draft surface -- the one with "Add a
 * Time" on it -- is the only place most of what the tour describes exists.
 *
 * @param {import('../../state/poll.svelte.js').PollModel} poll
 * @returns {object} the same model
 */
export function draftPracticePoll(poll) {
  poll.reset();

  poll.sandbox = true;
  poll.title = PRACTICE_POLL_TITLE;
  poll.description = 'A pretend poll, so you can try everything without '
    + 'creating anything real.';
  poll.scope = 'RELATIVE';
  poll.timeMode = 'WALL_CLOCK';
  poll.allowMultiAnswers = false;
  poll.allowAnswerEdits = true;
  // Public so the results panel is on screen for the step that describes it.
  // The tour cannot demonstrate a setting whose whole effect is that you see
  // nothing.
  poll.resultVisibility = 'PUBLIC_ALWAYS';

  // Five columns against four visible, deliberately over the cap -- the same
  // reasoning the practice event uses for six activities. The slider is the one
  // control on the page that reveals content rather than changing it, and a
  // grid that fitted would teach a layout the learner stops having the moment
  // they add a fifth day.
  //
  // They are here rather than in a later stage because they are what the
  // settings form collects: the day picker in that form reads them back, so a
  // tour pointing at it needs them chosen before the form opens.
  poll.options = [1, 2, 3, 4, 5].map((dayOfWeek, i) => new PollOption({
    id: `practice-option-${dayOfWeek}`,
    dayOfWeek,
    priority: i,
  }));

  return poll;
}

/** One square, offered. */
function offer(poll, option, win) {
  const key = cellKey(option.key, win?.key ?? null);
  if (poll.cells.has(key)) return;
  poll.cells.set(key, new PollCell(option.key, win?.key ?? null, {
    id: `practice-cell-${option.dayOfWeek}-${win ? win.startTime : 'all'}`,
  }));
}

/**
 * The rows, and the squares where they meet the columns.
 *
 * Friday becomes the whole-day column here rather than in the draft: the step
 * that describes the All Day switch is the one that should make a column change
 * shape, and a learner who arrives at it to find it already done learns
 * nothing from it.
 */
export function seedPracticeTimes(poll) {
  if (poll.windows.length === 0) {
    poll.windows = TIMES.map((startTime, i) => new PollWindow({
      id: `practice-window-${i}`,
      startTime,
      appliesToNewOptions: i === 0,
    }));
  }

  const withheld = new Set(WITHHELD.map(([day, time]) => `${day}@${time}`));
  for (const option of poll.options.slice(0, 4)) {
    for (const win of poll.windows) {
      if (withheld.has(`${option.dayOfWeek}@${win.startTime}`)) continue;
      offer(poll, option, win);
    }
  }

  const last = poll.options[4];
  if (last) {
    last.allDay = true;
    offer(poll, last, null);
  }
  return poll;
}

/** The one custom question, so the field steps have something to point at. */
export function seedPracticeQuestion(poll) {
  if (poll.details.length > 0) return poll;
  poll.details = [{
    id: 'practice-detail-1',
    type: 'STRING',
    label: 'Anything we should know?',
    hint: 'Allergies, a hard stop, anything at all.',
    required: false,
    priority: 0,
  }];
  return poll;
}

/**
 * Published: an id, a code, and answers already in.
 *
 * The id is what moves the poll off the draft surface, and the tally is what
 * gives the results step something to read -- a panel showing nothing would
 * teach the reader that polls show nothing.
 */
export function publishPracticePoll(poll) {
  poll.id = PRACTICE_POLL_ID;
  poll.code = PRACTICE_POLL_CODE;
  poll.isPublished = true;
  poll.editing = false;

  poll.tally = {
    'practice-cell-1-09:00': 4,
    'practice-cell-2-09:00': 2,
    'practice-cell-2-13:00': 5,
    'practice-cell-3-13:00': 3,
    'practice-cell-5-all': 1,
  };
  poll.respondents = 6;
  if (poll.responses.length === 0) {
    poll.responses = [
      new PollResponse({
        id: 'practice-response-1',
        name: PRACTICE_RESPONDENT,
        submitted: new Date(),
        votes: ['practice-cell-2-13:00'],
      }),
    ];
  }
  return poll;
}

/**
 * The finished practice poll: every stage, in order.
 *
 * What the voter track loads, because somebody who was sent a link is handed a
 * poll that already exists.
 *
 * @param {import('../../state/poll.svelte.js').PollModel} poll
 * @returns {object} the same model
 */
export function buildPracticePoll(poll) {
  draftPracticePoll(poll);
  seedPracticeTimes(poll);
  seedPracticeQuestion(poll);
  publishPracticePoll(poll);
  return poll;
}
