/**
 * The "Submit RSVPs" button, and what it is allowed to claim.
 *
 * RSVPs take one of two paths, chosen by whether the volunteer exists server-side.
 * An unsaved volunteer accumulates slots in memory and "Submit RSVPs" is what writes
 * them; a persisted one has every toggle saved as it is made
 * (`rsvpActions.toggleRsvp`). The button rendered on mode alone, so in the second
 * case it was inert -- and pressing it reported success, which reads as confirmation
 * of a save that never happened.
 *
 * The organizer case is the one worth pinning. An event admin is shown every
 * volunteer on their event, so a role check would have got this wrong; the count is
 * of *unpersisted* volunteers, which exist only in this tab, so somebody else's forty
 * signups contribute nothing to it.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import EventSection from '../../src/components/sections/EventSection.svelte';
import { EventModel } from '../../src/state/event.svelte.js';
import { Volunteer } from '../../src/state/entities.svelte.js';

const noop = () => {};

/** Every callback EventSection takes, so a case only states what it cares about. */
const props = (event) => ({
  event,
  busy: false,
  onEditSummary: noop,
  onViewReport: noop,
  onShare: noop,
  onAddVolunteer: noop,
  onUpdateVolunteer: noop,
  onActivityClick: noop,
  onWindowClick: noop,
  onSlotClick: noop,
  onAddActivity: noop,
  onAddWindow: noop,
  onAddField: noop,
  onPublish: noop,
  onEnterEdit: noop,
  onExitEdit: noop,
  onSubmitRsvps: noop,
  onDetailClick: noop,
});

/**
 * A published event in VIEW mode -- the only mode that renders this button.
 *
 * `persisted` volunteers carry an id, as they do once the server has answered;
 * `unsaved` ones do not, which is exactly what makes them pending.
 */
function viewingEvent({ persisted = 0, unsaved = 0 } = {}) {
  const event = new EventModel();
  event.id = 'e1';
  event.title = 'Bake Sale';
  event.editing = false;

  for (let i = 0; i < persisted; i += 1) {
    event.volunteers = [...event.volunteers, new Volunteer({ id: `v${i}`, name: `Saved ${i}` })];
  }
  for (let i = 0; i < unsaved; i += 1) {
    event.volunteers = [...event.volunteers, new Volunteer({ name: `Unsaved ${i}` })];
  }
  return event;
}

const submitButton = () => screen.getByRole('button', { name: /Submit .*RSVP/ });

describe('the Submit RSVPs button', () => {
  it('is disabled, and uncounted, when there is nothing unsaved', () => {
    render(EventSection, { props: props(viewingEvent()) });

    const button = submitButton();
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Submit RSVPs');
  });

  it('enables and counts a single unsaved volunteer, in the singular', () => {
    render(EventSection, { props: props(viewingEvent({ unsaved: 1 })) });

    const button = submitButton();
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent('Submit 1 RSVP');
    // "1 RSVPs" is the classic way for this to regress.
    expect(button.textContent).not.toMatch(/1 RSVPs/);
  });

  it('counts several unsaved volunteers, in the plural', () => {
    render(EventSection, { props: props(viewingEvent({ unsaved: 3 })) });

    const button = submitButton();
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent('Submit 3 RSVPs');
  });

  /**
   * The organizer's view. Everyone on the event is already saved, so there is
   * nothing for this button to write, however many of them there are.
   */
  it('stays disabled for an organizer looking at everybody elses signups', () => {
    render(EventSection, { props: props(viewingEvent({ persisted: 40 })) });

    const button = submitButton();
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Submit RSVPs');
  });

  it('counts only the unsaved ones when both kinds are present', () => {
    render(EventSection, { props: props(viewingEvent({ persisted: 5, unsaved: 2 })) });

    const button = submitButton();
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent('Submit 2 RSVPs');
  });

  it('is disabled while a submission is already in flight', () => {
    const event = viewingEvent({ unsaved: 2 });
    render(EventSection, { props: { ...props(event), busy: true } });

    expect(submitButton()).toBeDisabled();
  });
});
