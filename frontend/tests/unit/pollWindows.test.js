/**
 * "Repeat every", and the bound the organiser asked to be held to.
 *
 * The bound is the interesting part and it was stated as a requirement rather
 * than inferred: a repeat may not ask for more time than is left between the
 * first window and the end of the day. The obvious consequence is that
 * generation stops at midnight. The less obvious one is that an interval longer
 * than the remainder is refused rather than quietly yielding one window, which
 * would hide the organiser's mistake from them.
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
