/**
 * The practice poll the tutorial teaches on.
 *
 * The sibling of `sandbox.js`, and built to the same rule: it exists entirely
 * in the browser, it carries a synthetic id so the answering surface renders,
 * and `sandbox` is what stops every write that id would otherwise authorize
 * from leaving the page. See `state/actions/remote.js`.
 *
 * The content is chosen so one screen shows every state a learner will meet --
 * an offered square, one they have chosen, a withheld one, and a whole column
 * set to All Day -- and so that the results panel has something in it. A tour
 * of an empty grid would be a tour of nothing.
 */
import { PollCell, PollOption, PollResponse, PollWindow, cellKey } from '../../state/pollEntities.svelte.js';
import {
  PRACTICE_POLL_CODE, PRACTICE_POLL_ID, PRACTICE_POLL_TITLE, PRACTICE_RESPONDENT,
} from './markers.js';

/**
 * Load the practice poll into a model.
 *
 * Takes the model rather than returning one, mirroring `buildPracticeEvent`:
 * the app drives a single current poll that other modules hold a reference to.
 *
 * @param {import('../../state/poll.svelte.js').PollModel} poll
 * @returns {object} the same model
 */
export function buildPracticePoll(poll) {
  poll.reset();

  poll.sandbox = true;
  poll.id = PRACTICE_POLL_ID;
  poll.code = PRACTICE_POLL_CODE;
  poll.title = PRACTICE_POLL_TITLE;
  poll.description = 'A pretend poll, so you can try everything without '
    + 'creating anything real.';
  poll.isPublished = true;
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
  const days = [1, 2, 3, 4, 5].map((dayOfWeek, i) => new PollOption({
    id: `practice-option-${dayOfWeek}`,
    dayOfWeek,
    priority: i,
  }));
  // Friday is the whole-day column, so the All Day step has something to point
  // at that is already in that state.
  days[4].allDay = true;
  poll.options = days;

  const times = ['09:00', '12:30', '17:00'].map((startTime, i) => new PollWindow({
    id: `practice-window-${i}`,
    startTime,
    appliesToNewOptions: i === 0,
  }));
  poll.windows = times;

  const offer = (option, win) => {
    const cell = new PollCell(option.key, win?.key ?? null, {
      id: `practice-cell-${option.dayOfWeek}-${win ? win.startTime : 'all'}`,
    });
    poll.cells.set(cellKey(option.key, win?.key ?? null), cell);
    return cell;
  };

  // Most squares are offered; Monday evening and Thursday lunchtime are not, so
  // "Unavailable" appears without the learner having to withdraw one first.
  for (const option of days.slice(0, 4)) {
    for (const win of times) {
      if (option.dayOfWeek === 1 && win.startTime === '17:00') continue;
      if (option.dayOfWeek === 4 && win.startTime === '12:30') continue;
      offer(option, win);
    }
  }
  offer(days[4], null);

  poll.details = [{
    id: 'practice-detail-1',
    type: 'STRING',
    label: 'Anything we should know?',
    hint: 'Allergies, a hard stop, anything at all.',
    required: false,
    priority: 0,
  }];

  // Somebody has already answered, so the results panel is not empty and the
  // step about reading a tally has a tally to read.
  poll.tally = {
    'practice-cell-1-09:00': 4,
    'practice-cell-2-09:00': 2,
    'practice-cell-2-12:30': 5,
    'practice-cell-3-12:30': 3,
    'practice-cell-5-all': 1,
  };
  poll.respondents = 6;
  poll.responses = [
    new PollResponse({
      id: 'practice-response-1',
      name: PRACTICE_RESPONDENT,
      submitted: new Date(),
      votes: ['practice-cell-2-12:30'],
    }),
  ];

  return poll;
}
