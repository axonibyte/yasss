/**
 * Grid rendering conformance — docs/legacy/02-aesthetics.md §3.1.
 *
 * Class strings are asserted with whole-string equality, not `toContain`:
 * `is-outlined is-light` and `is-light` are different tiles, and a containment
 * check would accept either. This is the primary mechanism for catching
 * aesthetic drift, so it has to be exact.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import EventGrid from '../../src/components/grid/EventGrid.svelte';
import { EventModel } from '../../src/state/event.svelte.js';
import { resetKeys } from '../../src/lib/keys.js';

/** Build an n-activity x m-window event with every slot enabled. */
function buildEvent(activityCount, windowCount, tweak = () => {}) {
  const event = new EventModel();
  event.load({
    id: 'e1',
    shortDescription: 'E',
    longDescription: '',
    windows: Array.from({ length: windowCount }, (_, i) => ({
      id: `w${i}`, begin: 1700000000000 + i * 3600000, end: 1700003600000 + i * 3600000,
    })),
    activities: Array.from({ length: activityCount }, (_, i) => ({
      id: `a${i}`,
      shortDescription: `Act ${i}`,
      longDescription: `Description ${i}`,
      maxActivityVolunteers: 0,
      maxSlotVolunteersDefault: 0,
      priority: i,
      slots: Array.from({ length: windowCount }, (_, w) => ({
        window: `w${w}`, maxSlotVolunteers: 0, rsvps: [], rsvpCount: 0,
      })),
    })),
    details: [],
    volunteers: [],
  });
  tweak(event);
  return event;
}

/**
 * Class list with Svelte's scoped-style hash removed.
 *
 * Components carrying a `<style>` block get a generated `svelte-xxxxxx` class
 * on every element. It is a framework artifact with no design meaning and its
 * value changes whenever the CSS does, so it is stripped rather than asserted.
 */
const listClasses = (container) =>
  [...container.querySelectorAll('.event-cell ul')].map((ul) =>
    [...ul.classList].filter((c) => !c.startsWith('svelte-')).join(' '));

const cellTexts = (container) =>
  [...container.querySelectorAll('.event-cell li')].map((li) => li.textContent.trim());

beforeEach(() => resetKeys());

describe('grid container', () => {
  it.each([
    [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [6, 5],
  ])('%i activities renders has-%i-cols', (activities, cols) => {
    const event = buildEvent(activities, 1);
    const { container } = render(EventGrid, { props: { event } });
    expect(container.querySelector(`.fixed-grid.has-${cols}-cols`)).toBeTruthy();
  });

  it('nests cells as .fixed-grid > .grid > .cell.event-cell', () => {
    const { container } = render(EventGrid, { props: { event: buildEvent(2, 1) } });
    expect(container.querySelector('.fixed-grid > .grid > .cell.event-cell')).toBeTruthy();
  });

  /**
   * Exact, and deliberately not trimmed -- unlike `cellLabels` above, which
   * trims because it is comparing labels rather than markup.
   *
   * That trim is how this suite once missed a real regression. GridCell grew a
   * `{@render children?.()}` for the poll grid's All Day switch, and the newline
   * in front of it became a text node inside every tile, so `textContent` went
   * from "Act 0" to "Act 0 ". Nothing here noticed. The live browser tier did:
   * its locators filter on `/^Setup$/`, and Playwright matches a *regex*
   * against raw textContent without normalising whitespace, so two smoke tests
   * went red on a grid that looked perfect in a screenshot.
   *
   * The snippet is documented as rendering nothing at all when absent. This is
   * the assertion that holds it to that, and it is why the markup in GridCell
   * closes `{/if}{@render children?.()}</li>` on one line.
   */
  it('renders a tile with no stray whitespace around the label', () => {
    const { container } = render(EventGrid, { props: { event: buildEvent(1, 1) } });
    const labelled = [...container.querySelectorAll('.event-cell li')]
      .map((li) => li.textContent)
      .filter((t) => t !== '');
    expect(labelled).toContain('Act 0');
    for (const text of labelled) expect(text).toBe(text.trim());
  });
});

describe('empty state', () => {
  it('shows a single warning tile when there is nothing at all', () => {
    const event = new EventModel();
    const { container } = render(EventGrid, { props: { event } });

    expect(container.querySelector('.fixed-grid.has-1-cols')).toBeTruthy();
    expect(listClasses(container)).toEqual(['block-list is-small is-centered is-warning']);
    expect(cellTexts(container)[0])
      .toBe("You haven't added any windows or activities to your event yet!");
  });
});

describe('header cells', () => {
  it('renders a classless corner cell first', () => {
    const { container } = render(EventGrid, { props: { event: buildEvent(1, 1) } });
    // The corner has no aesthetic modifier and, critically, no trailing space.
    expect(listClasses(container)[0]).toBe('block-list is-small is-centered');
  });

  it('renders activity and window headers as solid primary', () => {
    const { container } = render(EventGrid, { props: { event: buildEvent(1, 1) } });
    const classes = listClasses(container);
    expect(classes[1]).toBe('block-list is-small is-centered is-primary'); // activity
    expect(classes[2]).toBe('block-list is-small is-centered is-primary'); // window
  });

  it('puts the activity description in a tooltip, and nothing on the others', () => {
    const { container } = render(EventGrid, { props: { event: buildEvent(1, 1) } });
    const cells = [...container.querySelectorAll('.event-cell')];
    expect(cells[0].getAttribute('data-tooltip')).toBeNull(); // corner
    expect(cells[1].getAttribute('data-tooltip')).toBe('Description 0'); // activity
    expect(cells[1].classList.contains('has-tooltip-top')).toBe(true);
    expect(cells[2].getAttribute('data-tooltip')).toBeNull(); // window
    expect(cells[3].getAttribute('data-tooltip')).toBeNull(); // slot
  });

  it('renders window headers on two lines', () => {
    const { container } = render(EventGrid, { props: { event: buildEvent(1, 1) } });
    expect(container.querySelectorAll('.event-cell br').length).toBe(1);
  });
});

describe('slot cell matrix', () => {
  const slotClassAt = (container, index) => listClasses(container).at(index);

  it('disabled -> Unavailable', () => {
    const event = buildEvent(1, 1, (e) => {
      e.slot(e.activities[0], e.windows[0]).enabled = false;
    });
    const { container } = render(EventGrid, { props: { event } });
    expect(cellTexts(container).at(-1)).toBe('Unavailable');
    expect(slotClassAt(container, -1)).toBe('block-list is-small is-centered is-outlined is-light');
  });

  it('open -> Available', () => {
    const { container } = render(EventGrid, { props: { event: buildEvent(1, 1) } });
    expect(cellTexts(container).at(-1)).toBe('Available');
    expect(slotClassAt(container, -1))
      .toBe('block-list is-small is-centered is-outlined is-primary');
  });

  it('held by the selected volunteer -> Booked', () => {
    const event = buildEvent(1, 1, (e) => {
      e.load({
        id: 'e1', shortDescription: 'E', longDescription: '',
        windows: [{ id: 'w0', begin: 1700000000000, end: 1700003600000 }],
        activities: [{
          id: 'a0', shortDescription: 'A', longDescription: '',
          maxActivityVolunteers: 0, maxSlotVolunteersDefault: 0, priority: 0,
          slots: [{ window: 'w0', maxSlotVolunteers: 0, rsvps: ['v1'], rsvpCount: 1 }],
        }],
        details: [],
        volunteers: [{ id: 'v1', name: 'Ada', details: [] }],
      });
    });
    const { container } = render(EventGrid, { props: { event } });
    expect(cellTexts(container).at(-1)).toBe('Booked');
    expect(slotClassAt(container, -1))
      .toBe('block-list is-small is-centered is-outlined is-warning');
  });

  it('full and unheld -> At Capacity', () => {
    const event = buildEvent(1, 1, (e) => {
      const slot = e.slot(e.activities[0], e.windows[0]);
      slot.cap = 1;
      slot.rsvpCount = 1;
    });
    const { container } = render(EventGrid, { props: { event } });
    expect(cellTexts(container).at(-1)).toBe('At Capacity');
    expect(slotClassAt(container, -1)).toBe('block-list is-small is-centered is-outlined is-light');
  });

  it('edit mode -> count / cap', () => {
    const event = buildEvent(1, 1, (e) => {
      e.editing = true;
      const slot = e.slot(e.activities[0], e.windows[0]);
      slot.cap = 10;
      slot.rsvpCount = 3;
    });
    const { container } = render(EventGrid, { props: { event } });
    expect(cellTexts(container).at(-1)).toBe('3 / 10');
    expect(slotClassAt(container, -1))
      .toBe('block-list is-small is-centered is-outlined is-primary');
  });
});

describe('horizontal paging', () => {
  it('shows only four activity columns however many exist', () => {
    const { container } = render(EventGrid, { props: { event: buildEvent(9, 1) } });
    // corner + 4 activity headers + window header + 4 slots
    expect(container.querySelectorAll('.event-cell').length).toBe(10);
  });

  it('renders a slider only when there is something to page through', () => {
    const { container: few } = render(EventGrid, { props: { event: buildEvent(3, 1) } });
    expect(few.querySelector('#view-event-slider')).toBeNull();

    const { container: many } = render(EventGrid, { props: { event: buildEvent(9, 1) } });
    const slider = many.querySelector('#view-event-slider');
    expect(slider).toBeTruthy();
    // legacy class string, exactly
    expect(slider.getAttribute('class'))
      .toBe('slider is-fullwidth is-small is-primary is-light');
    expect(slider.getAttribute('max')).toBe('6'); // 9 - 3
    expect(slider.getAttribute('min')).toBe('1');
  });

  it('moves the visible window as the step advances', () => {
    const event = buildEvent(6, 1);
    const { container, rerender } = render(EventGrid, { props: { event } });
    expect(cellTexts(container).slice(1, 5)).toEqual(['Act 0', 'Act 1', 'Act 2', 'Act 3']);

    event.step = 3;
    return rerender({ event }).then(() => {
      expect(cellTexts(container).slice(1, 5)).toEqual(['Act 2', 'Act 3', 'Act 4', 'Act 5']);
    });
  });

  it('renders every window row regardless of the step', () => {
    // Only the activity axis is windowed; rows are unbounded.
    const { container } = render(EventGrid, { props: { event: buildEvent(2, 5) } });
    expect(container.querySelectorAll('.event-cell').length).toBe(1 + 2 + 5 * (1 + 2));
  });
});
