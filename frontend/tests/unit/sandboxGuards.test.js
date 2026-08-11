/**
 * Every door out of the sandbox, and whether it is shut.
 *
 * The tutorial's containment is one clause -- `isRemote`, which is false for a
 * model carrying `sandbox` -- and the rule is only as good as its coverage.
 * Three calls were outside it, and all three became reachable the moment the
 * practice models were made owned by the learner looking at them, which is what
 * lets the creation tracks show the organiser's own surface at all:
 *
 *   - `deletePoll`, because "Delete Poll" is owner-only and a practice poll had
 *     no owner, so nobody could press it;
 *   - `openReport`, because "View Report" is owner-only for the same reason --
 *     and because it is a read, so it was never in the write gating to begin
 *     with;
 *   - `withdrawAnswer`, which is only rendered once a response exists.
 *
 * "Unreachable" is an argument about today's UI. These assert the functions
 * themselves, so the next button that reaches one does not have to re-derive
 * the argument.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/api/index.js', () => ({
  deletePoll: vi.fn(),
  deletePollResponse: vi.fn(),
  getEventReport: vi.fn(),
}));

vi.mock('../../src/state/toast.js', () => ({
  toastDanger: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

const api = await import('../../src/lib/api/index.js');
const { deletePoll } = await import('../../src/state/actions/pollActions.js');
const { openReport } = await import('../../src/state/actions/eventActions.js');
const { withdrawAnswer } = await import('../../src/state/actions/answerActions.js');

/** The practice model's shape, as far as these functions are concerned. */
const practice = (extra = {}) => ({
  id: 'practice-poll', sandbox: true, votes: new Set(['a']), ...extra,
});

beforeEach(() => vi.clearAllMocks());

describe('deletePoll', () => {
  it('sends nothing for a practice poll', async () => {
    expect(await deletePoll(practice())).toBe(false);
    expect(api.deletePoll).not.toHaveBeenCalled();
  });

  it('still deletes a real one', async () => {
    api.deletePoll.mockResolvedValue({});
    expect(await deletePoll({ id: 'p1' })).toBe(true);
    expect(api.deletePoll).toHaveBeenCalledWith('p1');
  });
});

describe('openReport', () => {
  it('fetches nothing for a practice event', async () => {
    expect(await openReport({ id: 'practice-event', sandbox: true })).toBe(false);
    expect(api.getEventReport).not.toHaveBeenCalled();
  });

  it('still fetches a real one', async () => {
    api.getEventReport.mockResolvedValue(new Blob(['x']));
    // `window.open` is not implemented under jsdom; the report path only needs
    // it to return something truthy.
    vi.stubGlobal('open', vi.fn(() => ({ focus: vi.fn() })));
    URL.createObjectURL ??= vi.fn(() => 'blob:x');
    URL.revokeObjectURL ??= vi.fn();

    expect(await openReport({ id: 'e1' })).toBe(true);
    expect(api.getEventReport).toHaveBeenCalledWith('e1');
    vi.unstubAllGlobals();
  });
});

describe('withdrawAnswer', () => {
  it('sends nothing for a practice poll, and drops the local votes', async () => {
    const poll = practice({ ownResponse: { id: 'r1' } });
    expect(await withdrawAnswer(poll)).toBe(true);
    expect(api.deletePollResponse).not.toHaveBeenCalled();
    expect(poll.votes.size).toBe(0);
  });

  it('still withdraws from a real one', async () => {
    api.deletePollResponse.mockResolvedValue({});
    // `persisted`, because `isRemote` is `persisted && !sandbox` -- a draft
    // poll has nothing on the server to withdraw from either.
    const poll = { id: 'p1', persisted: true, ownResponse: { id: 'r1' }, votes: new Set(['a']) };
    expect(await withdrawAnswer(poll)).toBe(true);
    expect(api.deletePollResponse).toHaveBeenCalled();
  });
});
