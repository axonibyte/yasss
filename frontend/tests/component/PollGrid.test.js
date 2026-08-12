/**
 * Poll grid rendering conformance, in the style of `EventGrid.test.js`.
 *
 * Class strings are asserted with whole-string equality for the same reason
 * they are there: `is-outlined is-light` and `is-light` are different tiles,
 * and a containment check would accept either.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import PollGrid from '../../src/components/grid/PollGrid.svelte';
import { PollModel, PollOption, PollWindow } from '../../src/state/poll.svelte.js';
import { PollCell, cellKey } from '../../src/state/pollEntities.svelte.js';
import { resetKeys } from '../../src/lib/keys.js';

/** A relative poll with every square offered. */
function buildPoll(dayCount, timeCount, tweak = () => {}) {
  const poll = new PollModel();
  poll.id = 'p1';
  poll.title = 'When?';
  poll.options = Array.from(
    { length: dayCount },
    (_, i) => new PollOption({ id: `o${i}`, dayOfWeek: i + 1, priority: i }),
  );
  poll.windows = Array.from(
    { length: timeCount },
    (_, i) => new PollWindow({ id: `w${i}`, startTime: `0${9 + i}:00` }),
  );
  for (const option of poll.options)
    for (const win of poll.windows)
      poll.cells.set(
        cellKey(option.key, win.key),
        new PollCell(option.key, win.key, { id: `c-${option.id}-${win.id}` }),
      );
  tweak(poll);
  return poll;
}

const listClasses = (container) =>
  [...container.querySelectorAll('.event-cell ul')].map((ul) =>
    [...ul.classList].filter((c) => !c.startsWith('svelte-')).join(' '));

const cellTexts = (container) =>
  [...container.querySelectorAll('.event-cell li')].map((li) => li.textContent.trim());

const states = (container) =>
  [...container.querySelectorAll('[data-slot-state]')].map((n) =>
    n.getAttribute('data-slot-state'));

beforeEach(() => resetKeys());

describe('layout', () => {
  it('caps the grid at five columns and pages the rest', () => {
    const poll = buildPoll(6, 2);
    const { container } = render(PollGrid, { poll });
    expect(container.querySelector('.fixed-grid').className).toContain('has-5-cols');
    // corner + 4 day headers, then per row: a time header + 4 squares.
    expect(container.querySelectorAll('.event-cell').length).toBe(5 + 2 * 5);
    expect(container.querySelector('#view-poll-slider')).not.toBeNull();
  });

  it('does not show a slider when every day fits', () => {
    const { container } = render(PollGrid, { poll: buildPoll(3, 1) });
    expect(container.querySelector('#view-poll-slider')).toBeNull();
  });

  it('says so when there is nothing on the poll yet', () => {
    const poll = new PollModel();
    const { container } = render(PollGrid, { poll });
    expect(cellTexts(container)).toEqual([
      "You haven't added any days or times to your poll yet!",
    ]);
    expect(listClasses(container)).toEqual(['block-list is-small is-centered is-warning']);
  });
});

describe('squares', () => {
  it('offers a square that exists and refuses one that does not', () => {
    const poll = buildPoll(2, 1, (p) => {
      p.cells.delete(cellKey(p.options[1].key, p.windows[0].key));
    });
    const { container } = render(PollGrid, { poll });
    expect(states(container)).toEqual(['available', 'unavailable']);
    expect(listClasses(container).slice(4)).toEqual([
      'block-list is-small is-centered is-outlined is-primary',
      'block-list is-small is-centered is-outlined is-light',
    ]);
  });

  it('marks the squares this respondent chose', () => {
    const poll = buildPoll(2, 1, (p) => {
      p.votes.add('c-o0-w0');
    });
    const { container } = render(PollGrid, { poll });
    expect(states(container)).toEqual(['voted', 'available']);
    expect(cellTexts(container).slice(4)).toEqual(['Voted', 'Available']);
  });

  it('shows counts instead of words once the tally is disclosed', () => {
    const poll = buildPoll(2, 1, (p) => {
      p.tally = { 'c-o0-w0': 3 };
      p.votes.add('c-o0-w0');
    });
    const { container } = render(PollGrid, { poll });
    // The one they chose is warning-colored; the one nobody chose reads zero.
    expect(cellTexts(container).slice(4)).toEqual(['3', '0']);
    expect(states(container)).toEqual(['voted', 'available']);
  });
});

describe('all day', () => {
  it('grays a whole column and marks it, without losing the squares', () => {
    const poll = buildPoll(2, 2, (p) => {
      p.options[0].allDay = true;
    });
    const { container } = render(PollGrid, { poll });
    // Every square under the all-day column reads All Day...
    expect(states(container)).toEqual(['all-day', 'available', 'all-day', 'available']);
    // ...and the squares themselves are still there, so unsetting restores them.
    expect(poll.cells.size).toBe(4);
  });

  it('names the all-day column for anybody who cannot see it', () => {
    const poll = buildPoll(1, 1, (p) => {
      p.options[0].allDay = true;
      p.cells.set(
        cellKey(p.options[0].key, null),
        new PollCell(p.options[0].key, null, { id: 'c-allday' }),
      );
    });
    const { container } = render(PollGrid, { poll, onCellClick: () => {} });
    const header = container.querySelector('button[aria-label*="all day"]');
    expect(header).not.toBeNull();
    expect(header.getAttribute('aria-label')).toBe('Mon, all day: Available');
  });

  it('offers the switch only while the organizer is laying the grid out', () => {
    const poll = buildPoll(1, 1);
    const { container } = render(PollGrid, { poll, onAllDayToggle: () => {} });
    // A published poll being viewed is not being edited.
    expect(container.querySelector('[data-testid="all-day-toggle"]')).toBeNull();

    poll.editing = true;
    const editing = render(PollGrid, { poll, onAllDayToggle: () => {} });
    expect(editing.container.querySelector('[data-testid="all-day-toggle"]')).not.toBeNull();
  });
});

describe('editing', () => {
  it('shows the organizer what their respondents will see', () => {
    const poll = buildPoll(2, 1, (p) => {
      p.editing = true;
      p.cells.delete(cellKey(p.options[1].key, p.windows[0].key));
    });
    const { container } = render(PollGrid, { poll });
    expect(states(container)).toEqual(['editing', 'editing-off']);
    expect(cellTexts(container).slice(4)).toEqual(['Available', 'Unavailable']);
  });
});

describe('row headers', () => {
  it('reads a wall-clock poll exactly as it was written', () => {
    const { container } = render(PollGrid, { poll: buildPoll(1, 2) });
    expect(cellTexts(container)[2]).toBe('9:00 AM');
  });

  it('adds the reader own zone when the poll fixes one', () => {
    const poll = buildPoll(1, 1, (p) => {
      p.timeMode = 'ZONED';
      p.timezone = 'America/Chicago';
      p.displayZone = 'UTC';
    });
    const { container } = render(PollGrid, { poll });
    const header = cellTexts(container)[2];
    expect(header).toContain('9:00 AM');
    // Chicago is behind UTC, so nine in the morning there is the afternoon here.
    expect(header).toMatch(/[23]:00 PM/);
  });
});

/**
 * Which column a tile belongs to.
 *
 * The grid is one flat CSS grid, so a column has no element of its own and
 * "the Tuesday column" is only expressible as the set of tiles that share a
 * value here. The tutorial highlights columns that way, and before this
 * existed its only option was to highlight the table -- which boxed the time
 * axis and the blank corner in with the days, and was what got reported.
 */
describe('column identity', () => {
  it('marks each day column, and only the day columns', () => {
    const { container } = render(PollGrid, { poll: buildPoll(3, 2) });

    const cells = [...container.querySelectorAll('.event-cell')];
    const cols = cells.map((c) => c.getAttribute('data-col'));

    // One blank corner, three day headers, then per window a row label and
    // three squares.
    expect(cols).toEqual([
      null, '0', '1', '2',
      null, '0', '1', '2',
      null, '0', '1', '2',
    ]);

    // And the set a step would highlight is the days, top to bottom: three
    // columns of three tiles, never the table itself.
    expect(container.querySelectorAll('[data-col]')).toHaveLength(9);
    expect(container.querySelectorAll('[data-col="1"]')).toHaveLength(3);
  });

  it('follows the slider, so a highlighted column is one on screen', () => {
    // Six days against four visible columns: the last two are off page one, and
    // a highlight has to land on what is rendered rather than on what exists.
    const poll = buildPoll(6, 1);
    poll.step = 3;
    const { container } = render(PollGrid, { poll });

    expect(container.querySelectorAll('[data-col]')).toHaveLength(8);
    const labels = [...container.querySelectorAll('[data-col="0"] li')]
      .map((li) => li.textContent.trim());
    // Page three starts at the third day, which is Wednesday.
    expect(labels[0]).toBe('Wed');
  });
});

/**
 * Addressing one square rather than a column of them.
 *
 * `data-col` alone names a set, which is right for "every column is a day" and
 * wrong for "click this square". The pair together makes every tile
 * addressable, and the tutorial uses both.
 */
describe('square identity', () => {
  it('gives every square a row as well as a column', () => {
    const { container } = render(PollGrid, { poll: buildPoll(2, 2) });

    const one = container.querySelectorAll('[data-col="1"][data-row="0"]');
    expect(one).toHaveLength(1);

    // Headers belong to a column but to no row: they are the axis, not a square.
    const headers = [...container.querySelectorAll('[data-col]')]
      .filter((el) => !el.hasAttribute('data-row'));
    expect(headers).toHaveLength(2);

    // And the row index follows the windows, not document order.
    const rows = [...container.querySelectorAll('[data-row]')]
      .map((el) => el.getAttribute('data-row'));
    expect(rows).toEqual(['0', '0', '1', '1']);
  });
});
