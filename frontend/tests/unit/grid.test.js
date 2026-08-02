/**
 * Grid layout math — docs/legacy/01-behavior.md §2.3-§2.5.
 *
 * The cell matrix assertions use exact whole-string equality on purpose:
 * `is-outlined is-light` and `is-light` are different tiles, and a `toContain`
 * check would pass for both.
 */
import { describe, it, expect } from 'vitest';
import {
  MAX_TABLE_COLS, colsFor, visibleActivityCount, maxStep, clampStep,
  visibleRange, visibleActivities, slotCell, cellClasses, isEmptyGrid,
} from '../../src/lib/grid.js';

describe('column count', () => {
  // cols = sz >= 5 ? 5 : sz + 1
  it.each([
    [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 5], [6, 5], [40, 5],
  ])('%i activities -> has-%i-cols', (activities, cols) => {
    expect(colsFor(activities)).toBe(cols);
  });

  it('always reserves exactly one column for window labels', () => {
    for (let n = 0; n <= 10; n++) {
      expect(visibleActivityCount(n)).toBe(colsFor(n) - 1);
    }
  });

  it('never shows more than four activity columns', () => {
    expect(visibleActivityCount(100)).toBe(MAX_TABLE_COLS - 1);
  });
});

describe('slider bounds', () => {
  // max = sz > 3 ? sz - 3 : 1
  it.each([
    [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 2], [6, 3], [10, 7],
  ])('%i activities -> max step %i', (activities, max) => {
    expect(maxStep(activities)).toBe(max);
  });

  it('at max step, the last activity is the last visible column', () => {
    for (const n of [5, 6, 7, 12]) {
      const { end } = visibleRange(maxStep(n), n);
      expect(end).toBe(n);
    }
  });

  it('shows everything when there is nothing to page through', () => {
    for (const n of [0, 1, 2, 3, 4]) {
      const { start, end } = visibleRange(1, n);
      expect(start).toBe(0);
      expect(end).toBeGreaterThanOrEqual(n);
    }
  });
});

describe('clampStep', () => {
  it('pins below the minimum', () => {
    expect(clampStep(0, 10)).toBe(1);
    expect(clampStep(-5, 10)).toBe(1);
  });

  it('pins above the maximum', () => {
    expect(clampStep(99, 10)).toBe(maxStep(10));
  });

  it('survives NaN', () => {
    // The legacy set currentVol to NaN via Number(undefined) and then indexed
    // an array with it (behavior §6.12). Nothing here may produce NaN.
    expect(clampStep(NaN, 10)).toBe(1);
    expect(clampStep(undefined, 10)).toBe(1);
    expect(clampStep('not a number', 10)).toBe(1);
  });

  it('truncates fractional steps', () => {
    expect(clampStep(2.9, 10)).toBe(2);
  });
});

describe('visibleActivities', () => {
  const acts = ['a', 'b', 'c', 'd', 'e', 'f'];

  it('pages by one activity per step', () => {
    expect(visibleActivities(acts, 1)).toEqual(['a', 'b', 'c', 'd']);
    expect(visibleActivities(acts, 2)).toEqual(['b', 'c', 'd', 'e']);
    expect(visibleActivities(acts, 3)).toEqual(['c', 'd', 'e', 'f']);
  });

  it('does not run off the end at max step', () => {
    expect(visibleActivities(acts, maxStep(acts.length))).toHaveLength(4);
  });

  it('shows all activities when they fit', () => {
    expect(visibleActivities(['a', 'b'], 1)).toEqual(['a', 'b']);
  });
});

describe('slot cell matrix', () => {
  const base = { enabled: true, editing: false, hasRsvp: false, atCapacity: false };

  it('disabled -> Unavailable, outranking every other condition', () => {
    expect(slotCell({ ...base, enabled: false, editing: true, hasRsvp: true, atCapacity: true }))
      .toEqual({ label: 'Unavailable', aesthetics: 'is-outlined is-light' });
  });

  it('editing -> count / cap', () => {
    expect(slotCell({ ...base, editing: true, rsvpCount: 3, cap: 10 }))
      .toEqual({ label: '3 / 10', aesthetics: 'is-outlined is-primary' });
  });

  it('editing outranks hasRsvp and atCapacity', () => {
    expect(slotCell({ ...base, editing: true, hasRsvp: true, atCapacity: true, rsvpCount: 1, cap: 1 }).label)
      .toBe('1 / 1');
  });

  it('hasRsvp -> Booked, outranking atCapacity', () => {
    expect(slotCell({ ...base, hasRsvp: true, atCapacity: true }))
      .toEqual({ label: 'Booked', aesthetics: 'is-outlined is-warning' });
  });

  it('atCapacity -> At Capacity', () => {
    expect(slotCell({ ...base, atCapacity: true }))
      .toEqual({ label: 'At Capacity', aesthetics: 'is-outlined is-light' });
  });

  it('otherwise -> Available', () => {
    expect(slotCell(base))
      .toEqual({ label: 'Available', aesthetics: 'is-outlined is-primary' });
  });

  it('renders an unlimited cap as 0 in edit mode, as the legacy did', () => {
    expect(slotCell({ ...base, editing: true, rsvpCount: 2, cap: 0 }).label).toBe('2 / 0');
  });
});

describe('cell class strings', () => {
  it('matches the legacy exactly, in order', () => {
    expect(cellClasses('is-outlined is-primary'))
      .toBe('block-list is-small is-centered is-outlined is-primary');
    expect(cellClasses('is-primary'))
      .toBe('block-list is-small is-centered is-primary');
  });

  it('emits no trailing space for the blank corner cell', () => {
    expect(cellClasses('')).toBe('block-list is-small is-centered');
  });
});

describe('empty grid', () => {
  it('is empty only when there are neither activities nor windows', () => {
    expect(isEmptyGrid(0, 0)).toBe(true);
    expect(isEmptyGrid(1, 0)).toBe(false);
    expect(isEmptyGrid(0, 1)).toBe(false);
  });
});
