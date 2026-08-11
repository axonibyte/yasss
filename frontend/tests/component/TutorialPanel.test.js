/**
 * The tutorial's highlight.
 *
 * One assertion carries this file: a step's anchor marks *every* element it
 * matches. It used to mark the first, which is why "every column is a day"
 * drew one box around the whole table -- time axis, blank corner and all --
 * instead of one box per day. Nothing failed; the highlight simply said
 * something false about what the copy meant.
 *
 * The second is the modal case. A creation step opens a dialog and points at a
 * field inside it, and the dialog is mounted by a different effect off the same
 * step change -- so on the first pass the field may not be in the document yet.
 * Without the retry those steps highlight nothing at all, silently.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import TutorialPanel from '../../src/components/TutorialPanel.svelte';

/**
 * Props go under `props`, deliberately spelled out: `anchor` is also one of
 * this library's own render options, and passing it flat makes it a mount
 * target rather than a prop.
 */

/** jsdom has no layout, so it has no `scrollIntoView`. The panel calls it. */
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  document.body.innerHTML = '';
});

const marked = () => [...document.querySelectorAll('.tutorial-anchor')];

/** One frame, which is what the panel waits before looking a second time. */
const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

function grid() {
  const table = document.createElement('div');
  table.id = 'view-poll-table';
  table.innerHTML = '<i class="corner"></i>'
    + '<i data-col="0"></i><i data-col="1"></i><i data-col="2"></i>'
    + '<i class="row-label"></i>'
    + '<i data-col="0"></i><i data-col="1"></i><i data-col="2"></i>';
  document.body.append(table);
  return table;
}

describe('the step highlight', () => {
  it('marks every element the anchor matches, not the first', async () => {
    grid();
    render(TutorialPanel, { props: { html: '<p>x</p>', anchor: '#view-poll-table [data-col]' } });
    await tick();

    expect(marked()).toHaveLength(6);
    // And nothing that is not a day: the corner and the row label are in the
    // same table and must stay unmarked.
    expect(document.querySelector('.corner').classList.contains('tutorial-anchor')).toBe(false);
    expect(document.querySelector('.row-label').classList.contains('tutorial-anchor')).toBe(false);
  });

  it('takes the marks off again when the step moves on', async () => {
    grid();
    const { rerender } = render(TutorialPanel, {
      props: { html: '<p>x</p>', anchor: '#view-poll-table [data-col]' },
    });
    await tick();
    expect(marked()).toHaveLength(6);

    await rerender({ anchor: '#view-poll-table [data-col="1"]' });
    await tick();
    expect(marked()).toHaveLength(2);
    for (const el of marked()) expect(el.getAttribute('data-col')).toBe('1');
  });

  it('carries on when a step points at nothing', async () => {
    render(TutorialPanel, { props: { html: '<p>x</p>', anchor: '[data-field="not-here"]' } });
    await tick();
    await frame();
    expect(marked()).toHaveLength(0);
  });

  it('looks again a frame later, for a field its own dialog has not mounted yet',
    async () => {
      render(TutorialPanel, {
        props: { html: '<p>x</p>', anchor: '[data-field="poll-repeat"]' },
      });
      await tick();
      expect(marked()).toHaveLength(0);

      // The dialog arrives after the panel first looked -- which is exactly the
      // ordering a step that opens a modal produces.
      const field = document.createElement('div');
      field.setAttribute('data-field', 'poll-repeat');
      document.body.append(field);

      await frame();
      expect(marked()).toEqual([field]);
    });

  it('does nothing at all for a step about the page as a whole', async () => {
    grid();
    render(TutorialPanel, { props: { html: '<p>x</p>', anchor: null } });
    await tick();
    expect(marked()).toHaveLength(0);
  });
});
