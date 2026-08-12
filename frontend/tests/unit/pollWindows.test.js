/**
 * "Repeat every", and the bound the organizer asked to be held to.
 *
 * The bound is the interesting part and it was stated as a requirement rather
 * than inferred: a repeat may not ask for more time than is left between the
 * first window and the end of the day. The obvious consequence is that
 * generation stops at midnight. The less obvious one is that an interval longer
 * than the remainder is refused rather than quietly yielding one window, which
 * would hide the organizer's mistake from them.
 */
import { describe, it, expect } from 'vitest';
import {
  checkInterval,
  expandRepeat,
  newOnly,
  remainingAfter,
  toClock,
  toMinutes,
} from '../../src/lib/poll/windows.js';

describe('readings', () => {
  it.each([
    ['00:00', 0],
    ['09:00', 540],
    ['13:30', 810],
    ['23:59', 1439],
  ])('reads %s as %i minutes', (raw, minutes) => {
    expect(toMinutes(raw)).toBe(minutes);
    expect(toClock(minutes)).toBe(raw);
  });

  it.each([['9:00'], ['24:00'], ['09:60'], ['nope'], [''], ['09:00:00']])(
    'refuses %s',
    (raw) => {
      expect(toMinutes(raw)).toBeNull();
    },
  );
});

describe('what is left of the day', () => {
  it.each([
    ['00:00', 1440],
    ['09:00', 900],
    ['23:00', 60],
    ['23:59', 1],
  ])('after %s there is %i minutes', (start, left) => {
    expect(remainingAfter(start)).toBe(left);
  });
});

describe('checkInterval', () => {
  it('accepts an interval that fits', () => {
    expect(checkInterval('09:00', 2, 30)).toEqual({ ok: true });
  });

  it('accepts an interval exactly as long as the remainder', () => {
    // 15 hours after 09:00 is midnight, which is the last acceptable answer:
    // it produces one window and reaches the end of the day exactly.
    expect(checkInterval('09:00', 15, 0)).toEqual({ ok: true });
  });

  it('refuses an interval longer than the remainder, and says how long is left', () => {
    const verdict = checkInterval('18:00', 8, 0);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('6h 0m');
  });

  it.each([
    [0, 0],
    [-1, 0],
  ])('refuses an interval of %ih %im', (hours, minutes) => {
    expect(checkInterval('09:00', hours, minutes).ok).toBe(false);
  });

  it('refuses a start that is not a time', () => {
    expect(checkInterval('nope', 1, 0).ok).toBe(false);
  });
});

describe('expandRepeat', () => {
  it('yields just the one window when there is no repeat', () => {
    expect(expandRepeat({ start: '09:00' })).toEqual(['09:00']);
  });

  it('repeats until the end of the day and no further', () => {
    expect(expandRepeat({ start: '21:00', repeat: true, hours: 1, minutes: 0 })).toEqual([
      '21:00',
      '22:00',
      '23:00',
    ]);
  });

  it('handles an interval with minutes in it', () => {
    expect(expandRepeat({ start: '09:00', repeat: true, hours: 2, minutes: 30 })).toEqual([
      '09:00',
      '11:30',
      '14:00',
      '16:30',
      '19:00',
      '21:30',
    ]);
  });

  it('never produces a window at or past midnight', () => {
    const readings = expandRepeat({ start: '00:00', repeat: true, hours: 0, minutes: 15 });
    expect(readings[0]).toBe('00:00');
    expect(readings.at(-1)).toBe('23:45');
    expect(readings).toHaveLength(96);
  });

  it('falls back to the single window when the interval does not fit', () => {
    // The form refuses this before it is asked for; the expansion agrees rather
    // than producing something the check said was not allowed.
    expect(expandRepeat({ start: '18:00', repeat: true, hours: 8, minutes: 0 })).toEqual([
      '18:00',
    ]);
  });
});

describe('newOnly', () => {
  it('drops readings the poll already has', () => {
    expect(newOnly(['09:00', '10:00', '11:00'], ['10:00'])).toEqual(['09:00', '11:00']);
  });

  it('drops repeats within one expansion too', () => {
    expect(newOnly(['09:00', '09:00'], [])).toEqual(['09:00']);
  });
});

/**
 * "Until", and the decision that it includes the time it names.
 *
 * The exclusive reading is the more familiar one -- Doodle and a calendar's
 * working hours both stop short -- but it is exclusive because a slot there has
 * a duration and the last one *ends* on the boundary. A poll window is an
 * instant with no end at all, so an exclusive reading would mean the organizer
 * types the time they want offered and is then not offered it. See the module
 * header; this suite is the executable half of that argument.
 */
describe('repeating until a time', () => {
  it('offers the time the organizer named', () => {
    expect(expandRepeat({ start: '09:00', repeat: true, hours: 1, minutes: 0, until: '12:00' }))
      .toEqual(['09:00', '10:00', '11:00', '12:00']);
  });

  it('stops short when the cadence steps over the until', () => {
    // 13:00 would be next and is past 12:30, so 11:00 is the last one. The
    // boundary is inclusive, not a license to overshoot it.
    expect(expandRepeat({ start: '09:00', repeat: true, hours: 2, minutes: 0, until: '12:30' }))
      .toEqual(['09:00', '11:00']);
  });

  it('lands on the until exactly when the interval divides the span', () => {
    expect(expandRepeat({ start: '08:00', repeat: true, hours: 0, minutes: 45, until: '10:15' }))
      .toEqual(['08:00', '08:45', '09:30', '10:15']);
  });

  it('treats a blank until as the end of the day', () => {
    // The field is empty until somebody fills it, and an empty field must not
    // silently mean midnight-minus-nothing or refuse the whole repeat.
    const both = [
      expandRepeat({ start: '21:00', repeat: true, hours: 1, minutes: 0, until: '' }),
      expandRepeat({ start: '21:00', repeat: true, hours: 1, minutes: 0 }),
    ];
    expect(both[0]).toEqual(['21:00', '22:00', '23:00']);
    expect(both[1]).toEqual(both[0]);
  });

  it('still refuses to run past midnight when the until is late', () => {
    expect(expandRepeat({ start: '22:00', repeat: true, hours: 1, minutes: 0, until: '23:59' }))
      .toEqual(['22:00', '23:00']);
  });

  describe('and the guard on it', () => {
    it('refuses an until before the start, naming the start', () => {
      const verdict = checkInterval('14:00', 1, 0, '09:00');
      expect(verdict.ok).toBe(false);
      expect(verdict.reason).toContain('14:00');
    });

    it('refuses an until equal to the start', () => {
      // It would produce exactly one window, which is what turning the repeat
      // off already does -- so accepting it would only hide a slip.
      expect(checkInterval('09:00', 1, 0, '09:00').ok).toBe(false);
    });

    it('refuses an interval wider than the span, and says how wide the span is', () => {
      const verdict = checkInterval('09:00', 2, 0, '10:00');
      expect(verdict.ok).toBe(false);
      expect(verdict.reason).toContain('1h 0m');
    });

    it('accepts an interval exactly as wide as the span', () => {
      // Two windows: the start and the until. Nothing is hidden, so nothing is
      // refused.
      expect(checkInterval('09:00', 1, 0, '10:00')).toEqual({ ok: true });
      expect(expandRepeat({ start: '09:00', repeat: true, hours: 1, minutes: 0, until: '10:00' }))
        .toEqual(['09:00', '10:00']);
    });

    it('refuses an until that is not a time', () => {
      expect(checkInterval('09:00', 1, 0, '25:00').ok).toBe(false);
    });

    it('expands to the single window whenever the check refuses', () => {
      // The expansion agrees with the form rather than producing something the
      // form just said was not allowed.
      for (const until of ['08:00', '09:00', '25:00']) {
        expect(expandRepeat({ start: '09:00', repeat: true, hours: 1, minutes: 0, until }))
          .toEqual(['09:00']);
      }
    });
  });
});
