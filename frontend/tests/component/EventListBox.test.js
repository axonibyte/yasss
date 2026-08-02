/**
 * Dashboard list box — docs/legacy/02-aesthetics.md §1.3.
 *
 * The list class flips between is-centered and is-primary depending on whether
 * there is anything in it. Asserting the exact class string is the point: this
 * is the mechanism that catches aesthetic drift, so `toContain` would not do.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import EventListBox from '../../src/components/sections/EventListBox.svelte';

const listOf = (container) => container.querySelector('ul');

describe('EventListBox', () => {
  it('shows a loading placeholder before the events arrive', () => {
    const { container } = render(EventListBox, { props: { heading: 'Your Upcoming Events', events: null } });
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(listOf(container).getAttribute('class')).toBe('block-list is-centered');
  });

  it('centres an empty list', () => {
    const { container } = render(EventListBox, { props: { heading: 'H', events: [] } });
    expect(screen.getByText('No events.')).toBeInTheDocument();
    expect(listOf(container).getAttribute('class')).toBe('block-list is-centered');
  });

  it('switches to is-primary once populated', () => {
    const { container } = render(EventListBox, { props: {
      heading: 'H',
      events: [{ id: 'e1', shortDescription: 'Bake Sale' }],
    } });
    expect(listOf(container).getAttribute('class')).toBe('block-list is-primary');
  });

  it('lists each event by its short description', () => {
    render(EventListBox, { props: {
      heading: 'H',
      events: [
        { id: 'e1', shortDescription: 'Bake Sale' },
        { id: 'e2', shortDescription: 'Car Wash' },
      ],
    } });
    expect(screen.getByText('Bake Sale')).toBeInTheDocument();
    expect(screen.getByText('Car Wash')).toBeInTheDocument();
  });

  it('reports the selected event id', async () => {
    const onSelect = vi.fn();
    render(EventListBox, { props: {
      heading: 'H',
      events: [{ id: 'e1', shortDescription: 'Bake Sale' }],
      onSelect,
    } });
    await userEvent.click(screen.getByRole('button', { name: 'Bake Sale' }));
    expect(onSelect).toHaveBeenCalledWith('e1');
  });

  it('exposes entries as real buttons, not clickable list items', async () => {
    // The legacy bound click straight to the <li>, so entries were unreachable
    // by keyboard and unannounced by assistive tech.
    const onSelect = vi.fn();
    render(EventListBox, { props: {
      heading: 'H',
      events: [{ id: 'e1', shortDescription: 'Bake Sale' }],
      onSelect,
    } });
    const entry = screen.getByRole('button', { name: 'Bake Sale' });
    entry.focus();
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('e1');
  });
});
