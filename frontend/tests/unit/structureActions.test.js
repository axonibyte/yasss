/**
 * The two ways a structural write can lie about having worked.
 *
 * Both are invisible from a single request: every call involved answers 200,
 * and the damage only shows up on the *next* edit, or on a reload.
 *
 *   - A write response with no id was accepted into the model as `null`. Every
 *     later operation gates on that id — `updateActivity`, `removeDetail`,
 *     `updateSlot` all check it and quietly skip the network when it is missing
 *     — so the item sat on screen looking saved while absorbing every
 *     subsequent edit in silence.
 *   - Reorders push one priority at a time. A failure halfway left the server
 *     holding a partial order while the caller abandoned the local move, and
 *     the two then disagreed permanently with nothing on screen to say so.
 */
import {
  describe, it, expect, beforeEach, vi,
} from 'vitest';

vi.mock('../../src/lib/api/index.js', () => ({
  addActivity: vi.fn(),
  addWindow: vi.fn(),
  addDetail: vi.fn(),
  updateActivity: vi.fn(),
  updateDetail: vi.fn(),
}));

vi.mock('../../src/state/toast.js', () => ({
  toastError: vi.fn(),
  toastDanger: vi.fn(),
}));

const api = await import('../../src/lib/api/index.js');
const toast = await import('../../src/state/toast.js');
const {
  addActivity, addWindow, addDetail, moveActivity,
} = await import('../../src/state/actions/structureActions.js');

/** The smallest thing the actions will treat as a published event. */
function liveEvent(overrides = {}) {
  return {
    id: 'e1',
    persisted: true,
    activities: [],
    windows: [],
    details: [],
    volunteers: [],
    timezone: null,
    clampStep() {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('a write response with no id', () => {
  it('refuses an activity rather than adopting a null id', async () => {
    const event = liveEvent();
    api.addActivity.mockResolvedValue({ status: 'ok' });

    expect(await addActivity(event, { label: 'Setup' })).toBeNull();
    // Not added: an activity with no id cannot be edited, moved or deleted, so
    // leaving it on screen is worse than not having created it.
    expect(event.activities).toHaveLength(0);
    expect(toast.toastError).toHaveBeenCalled();
  });

  it('refuses a custom field the same way', async () => {
    const event = liveEvent();
    api.addDetail.mockResolvedValue({ status: 'ok' });

    expect(await addDetail(event, { label: 'Shirt size' })).toBeNull();
    expect(event.details).toHaveLength(0);
  });

  it('refuses a window without destroying the dates that were picked', async () => {
    // The sharpest of the three. `windowFromWrite({})` yields
    // `{id: undefined, begin: null, end: null}`, and the old code assigned that
    // straight over the window — so a response missing its `window` object blanked
    // the times the user had just chosen *and* left it id-less.
    const event = liveEvent();
    api.addWindow.mockResolvedValue({ status: 'ok' });

    const begin = new Date('2026-01-01T10:00:00Z');
    const end = new Date('2026-01-01T12:00:00Z');

    expect(await addWindow(event, { begin, end })).toBeNull();
    expect(event.windows).toHaveLength(0);
  });

  it('accepts a response that does carry an id', async () => {
    const event = liveEvent();
    api.addActivity.mockResolvedValue({ status: 'ok', activity: { id: 'a1' } });

    const activity = await addActivity(event, { label: 'Setup' });
    expect(activity?.id).toBe('a1');
    expect(event.activities).toHaveLength(1);
    expect(toast.toastError).not.toHaveBeenCalled();
  });
});

describe('a reorder that fails partway', () => {
  /** Three activities at priorities 0, 1, 2. */
  const threeActivities = () => [
    { id: 'a1', priority: 0 },
    { id: 'a2', priority: 1 },
    { id: 'a3', priority: 2 },
  ];

  it('puts back the priorities that already landed', async () => {
    const activities = threeActivities();
    const event = liveEvent({ activities });

    // Moving a1 right gives the order [a2, a1, a3], so both swap partners are
    // renumbered: a2 to 0 and a1 to 1, pushed in that order. Let a2's land and
    // a1's fail.
    api.updateActivity
      .mockResolvedValueOnce({ status: 'ok' })
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({ status: 'ok' });

    expect(await moveActivity(event, activities[0], 1)).toBe(false);

    // Three calls: two forward, one rolling a2 back to the priority it had.
    // Without that last call the server keeps half a reorder that nothing on
    // screen reflects.
    expect(api.updateActivity).toHaveBeenCalledTimes(3);
    expect(api.updateActivity.mock.calls[0]).toEqual(['e1', 'a2', { priority: 0 }]);
    expect(api.updateActivity.mock.calls[2]).toEqual(['e1', 'a2', { priority: 1 }]);

    // And the local model is untouched, so screen and server agree again.
    expect(event.activities.map((a) => a.id)).toEqual(['a1', 'a2', 'a3']);
    expect(activities[0].priority).toBe(0);
  });

  it('says so plainly when the rollback fails too', async () => {
    const activities = threeActivities();
    const event = liveEvent({ activities });

    api.updateActivity
      .mockResolvedValueOnce({ status: 'ok' })
      .mockRejectedValue(new Error('boom'));

    expect(await moveActivity(event, activities[0], 1)).toBe(false);

    // At this point the server's order is genuinely unknown, and the only
    // honest thing to do is tell the user to reload rather than let them
    // discover it later.
    expect(toast.toastDanger).toHaveBeenCalledWith(
      expect.stringMatching(/may not match what you see[\s\S]*Reload/i),
    );
  });

  it('leaves nothing to roll back when the very first push fails', async () => {
    const activities = threeActivities();
    const event = liveEvent({ activities });

    api.updateActivity.mockRejectedValue(new Error('boom'));

    expect(await moveActivity(event, activities[0], 1)).toBe(false);
    expect(api.updateActivity).toHaveBeenCalledTimes(1);
    expect(toast.toastDanger).not.toHaveBeenCalled();
  });

  it('renumbers and keeps the move when every push lands', async () => {
    const activities = threeActivities();
    const event = liveEvent({ activities });
    api.updateActivity.mockResolvedValue({ status: 'ok' });

    expect(await moveActivity(event, activities[0], 1)).toBe(true);
    expect(event.activities.map((a) => a.id)).toEqual(['a2', 'a1', 'a3']);
    expect(event.activities.map((a) => a.priority)).toEqual([0, 1, 2]);
  });
});
