/**
 * Reading a poll's times in somebody else's clock.
 *
 * The interesting cases are the ones a hand-rolled offset would get wrong:
 * daylight saving, and a conversion that crosses midnight. The second is the
 * one that matters most for a relative poll, where crossing midnight means the
 * square is on a different weekday for that reader than the column it sits in
 * says -- so the label has to admit it rather than quietly renaming the time.
 */
import { describe, it, expect } from 'vitest';
import {
  fmtClock,
  instantOf,
  nextOccurrence,
  referenceDate,
  windowLabel,
  zoneNote,
} from '../../src/lib/poll/zones.js';

describe('fmtClock', () => {
  it.each([
    ['00:00', '12:00 AM'],
    ['09:00', '9:00 AM'],
    ['12:00', '12:00 PM'],
    ['13:30', '1:30 PM'],
    ['23:59', '11:59 PM'],
  ])('renders %s as %s', (raw, shown) => {
    expect(fmtClock(raw)).toBe(shown);
  });
});

describe('instantOf', () => {
  /** Chicago is UTC-6 in winter and UTC-5 in summer. */
  it('applies the offset in force on the day, not a fixed one', () => {
    const winter = instantOf({ year: 2026, month: 1, day: 15 }, '09:00', 'America/Chicago');
    const summer = instantOf({ year: 2026, month: 7, day: 15 }, '09:00', 'America/Chicago');
    expect(new Date(winter).toISOString()).toBe('2026-01-15T15:00:00.000Z');
    expect(new Date(summer).toISOString()).toBe('2026-07-15T14:00:00.000Z');
  });

  it('is exact for a zone with no daylight saving', () => {
    const at = instantOf({ year: 2026, month: 6, day: 1 }, '13:30', 'UTC');
    expect(new Date(at).toISOString()).toBe('2026-06-01T13:30:00.000Z');
  });

  /**
   * A reading close enough to a transition that a single-pass guess lands on
   * the wrong side of it. The second pass is what fixes this.
   */
  it('is right either side of a spring-forward transition', () => {
    // US daylight saving begins 2026-03-08 at 02:00 local.
    const before = instantOf({ year: 2026, month: 3, day: 8 }, '01:00', 'America/Chicago');
    const after = instantOf({ year: 2026, month: 3, day: 8 }, '03:00', 'America/Chicago');
    expect(new Date(before).toISOString()).toBe('2026-03-08T07:00:00.000Z');
    expect(new Date(after).toISOString()).toBe('2026-03-08T08:00:00.000Z');
  });
});

describe('nextOccurrence', () => {
  it('finds the coming weekday, and today counts as today', () => {
    // 2026-08-10 is a Monday.
    const monday = new Date(2026, 7, 10, 12, 0, 0);
    expect(nextOccurrence(1, monday)).toEqual({ year: 2026, month: 8, day: 10 });
    expect(nextOccurrence(3, monday)).toEqual({ year: 2026, month: 8, day: 12 });
    expect(nextOccurrence(7, monday)).toEqual({ year: 2026, month: 8, day: 16 });
  });
});

describe('referenceDate', () => {
  it('reads an absolute column from its own parts, never through a Date', () => {
    // `new Date('2026-09-03')` is UTC midnight and renders as the 2nd anywhere
    // west of Greenwich, which would move the column by a day for half the
    // world.
    const poll = { scope: 'ABSOLUTE' };
    expect(referenceDate(poll, { date: '2026-09-03' })).toEqual({
      year: 2026,
      month: 9,
      day: 3,
    });
  });
});

describe('windowLabel', () => {
  const wallClock = { timeMode: 'WALL_CLOCK', timezone: null, scope: 'RELATIVE' };

  it('converts nothing on a wall-clock poll', () => {
    expect(windowLabel('09:00', wallClock, { dayOfWeek: 1 })).toEqual({
      primary: '9:00 AM',
      secondary: null,
    });
  });

  it('says nothing twice when the reader is already in the poll zone', () => {
    const poll = {
      timeMode: 'ZONED',
      timezone: 'America/Chicago',
      displayZone: 'America/Chicago',
      scope: 'ABSOLUTE',
    };
    expect(windowLabel('09:00', poll, { date: '2026-07-15' }).secondary).toBeNull();
  });

  it('shows the reader their own time beside the poll time', () => {
    const poll = {
      timeMode: 'ZONED',
      timezone: 'America/Chicago',
      displayZone: 'UTC',
      scope: 'ABSOLUTE',
    };
    const label = windowLabel('09:00', poll, { date: '2026-07-15' });
    expect(label.primary).toBe('9:00 AM');
    expect(label.secondary).toBe('2:00 PM');
  });

  /**
   * The case worth having a test for at all. Eleven at night in Chicago is the
   * small hours of the next day in London, so a reader there is being asked
   * about a different weekday than the column heading names -- and hiding that
   * would tell them they are free on the wrong day.
   */
  it('marks a conversion that crosses midnight', () => {
    const poll = {
      timeMode: 'ZONED',
      timezone: 'America/Chicago',
      displayZone: 'Europe/London',
      scope: 'ABSOLUTE',
    };
    const label = windowLabel('23:00', poll, { date: '2026-07-15' });
    expect(label.primary).toBe('11:00 PM');
    expect(label.secondary).toContain('(+1d)');
  });

  it('marks a conversion that crosses midnight backwards', () => {
    const poll = {
      timeMode: 'ZONED',
      timezone: 'Europe/London',
      displayZone: 'America/Chicago',
      scope: 'ABSOLUTE',
    };
    const label = windowLabel('01:00', poll, { date: '2026-07-15' });
    expect(label.secondary).toContain('(');
    expect(label.secondary).toMatch(/1d\)/);
  });
});

describe('zoneNote', () => {
  it('says nothing about zones on a wall-clock poll', () => {
    expect(zoneNote({ timeMode: 'WALL_CLOCK', timezone: null })).toBeNull();
  });

  it('names both zones when they differ', () => {
    const note = zoneNote({
      timeMode: 'ZONED',
      timezone: 'America/Chicago',
      displayZone: 'UTC',
    });
    expect(note).toContain('UTC');
    expect(note).toContain('America/Chicago');
  });
});
