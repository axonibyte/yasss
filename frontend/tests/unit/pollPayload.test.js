/**
 * The poll create body, and the rule that is the opposite of the event one.
 *
 * `eventPayload` emits one entry per (activity, window) pair because for an
 * event OMISSION ENABLES a slot. For a poll PRESENCE ENABLES a square. Anybody
 * who has read one of those files and then the other will assume the wrong
 * rule, so the inversion is asserted here explicitly rather than left implied.
 */
import { describe, it, expect } from 'vitest';
import { pollCreatePayload, pollSummaryDiff } from '../../src/state/serialize/pollPayload.js';
import { PollModel } from '../../src/state/poll.svelte.js';
import { PollOption, PollWindow } from '../../src/state/pollEntities.svelte.js';

function draft(tweak = () => {}) {
  const poll = new PollModel();
  poll.title = 'When?';
  poll.description = 'Pick times';
  poll.scope = 'RELATIVE';
  poll.options = [
    new PollOption({ dayOfWeek: 1 }),
    new PollOption({ dayOfWeek: 3 }),
  ];
  poll.windows = [
    new PollWindow({ startTime: '09:00' }),
    new PollWindow({ startTime: '13:30' }),
  ];
  tweak(poll);
  return poll;
}

describe('presence enables', () => {
  it('sends only the squares that are offered', () => {
    const poll = draft((p) => {
      p.addCell(p.options[0], p.windows[0]);
      p.addCell(p.options[1], p.windows[1]);
    });
    const body = pollCreatePayload(poll);

    // Two of the four pairs. The event payload would send all four with an
    // `enabled` flag; here the two absent pairs are absent *because* they are
    // not offered.
    expect(body.cells).toEqual([
      { option: 0, window: 0 },
      { option: 1, window: 1 },
    ]);
  });

  it('sends no squares at all for a grid nobody has filled in', () => {
    expect(pollCreatePayload(draft()).cells).toEqual([]);
  });

  it('names the all-day square by its column alone', () => {
    const poll = draft((p) => {
      p.options[0].allDay = true;
      p.addCell(p.options[0], null);
    });
    // No `window` key, which is what a null poll_window means server-side.
    expect(pollCreatePayload(poll).cells).toEqual([{ option: 0 }]);
  });

  it('drops a square whose column was removed mid-edit', () => {
    const poll = draft((p) => {
      p.addCell(p.options[0], p.windows[0]);
      p.options = [p.options[1]];
    });
    // An index the server cannot resolve is a 400; silence is harmless.
    expect(pollCreatePayload(poll).cells).toEqual([]);
  });
});

describe('columns and rows', () => {
  it('sends weekdays on a relative poll and never dates', () => {
    const body = pollCreatePayload(draft());
    expect(body.options).toEqual([
      { dayOfWeek: 1, allDay: false, priority: 0 },
      { dayOfWeek: 3, allDay: false, priority: 1 },
    ]);
  });

  it('sends dates on an absolute poll and never weekdays', () => {
    const poll = draft((p) => {
      p.scope = 'ABSOLUTE';
      p.options = [new PollOption({ date: '2026-09-03' })];
    });
    expect(pollCreatePayload(poll).options).toEqual([
      { date: '2026-09-03', allDay: false, priority: 0 },
    ]);
  });

  it('carries the standing apply-to-new-days rule on the row', () => {
    const poll = draft((p) => { p.windows[0].appliesToNewOptions = true; });
    expect(pollCreatePayload(poll).windows).toEqual([
      { startTime: '09:00', appliesToNewOptions: true },
      { startTime: '13:30', appliesToNewOptions: false },
    ]);
  });
});

describe('settings', () => {
  it('omits a zone on a wall-clock poll', () => {
    const poll = draft((p) => { p.timezone = 'America/Chicago'; });
    // The server refuses a zone it would never read, so a stale one must not
    // ride along just because the form once held it.
    expect(pollCreatePayload(poll).timezone).toBeUndefined();
  });

  it('sends the zone on a zoned poll', () => {
    const poll = draft((p) => {
      p.timeMode = 'ZONED';
      p.timezone = 'America/Chicago';
    });
    expect(pollCreatePayload(poll).timezone).toBe('America/Chicago');
  });

  it('sends the deadline as a string', () => {
    const poll = draft((p) => { p.deadline = 1789000000000; });
    // A JSON number is a double, and an epoch in milliseconds is past the point
    // where every one is exactly representable.
    expect(pollCreatePayload(poll).responseDeadline).toBe('1789000000000');
  });

  it('sets the admin only when signed in', () => {
    expect(pollCreatePayload(draft(), { account: 'u-1' }).admin).toBe('u-1');
    expect(pollCreatePayload(draft()).admin).toBeUndefined();
  });
});

describe('pollSummaryDiff', () => {
  const previous = {
    title: 'When?',
    description: 'Pick times',
    timeMode: 'WALL_CLOCK',
    timezone: null,
    deadline: null,
    allowMultiAnswers: true,
    allowAnswerEdits: true,
    resultVisibility: 'PUBLIC_ALWAYS',
  };

  it('sends nothing when nothing changed', () => {
    expect(pollSummaryDiff({ ...previous }, previous)).toEqual({});
  });

  it('sends only what moved', () => {
    expect(pollSummaryDiff({ ...previous, title: 'Which evening?' }, previous)).toEqual({
      shortDescription: 'Which evening?',
    });
  });

  /**
   * The two nullable fields. An explicit null is how a poll goes back to wall
   * clock and how a deadline is removed to reopen a closed poll; `undefined`
   * would be dropped by JSON.stringify and the change would silently not
   * happen.
   */
  it('sends an explicit null to clear the zone', () => {
    const diff = pollSummaryDiff(
      { ...previous, timeMode: 'WALL_CLOCK', timezone: null },
      { ...previous, timeMode: 'ZONED', timezone: 'UTC' },
    );
    expect(diff.timezone).toBeNull();
    expect('timezone' in diff).toBe(true);
  });

  it('sends an explicit null to remove the deadline', () => {
    const diff = pollSummaryDiff({ ...previous, deadline: null }, { ...previous, deadline: 123 });
    expect(diff.responseDeadline).toBeNull();
    expect('responseDeadline' in diff).toBe(true);
  });
});
