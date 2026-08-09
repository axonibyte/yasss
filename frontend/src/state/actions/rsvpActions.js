/**
 * RSVP toggling.
 *
 * Persistence is deliberately deferred for volunteers who do not yet exist
 * server-side: a locally-added volunteer accumulates RSVPs in memory and the
 * whole set is submitted together. That matches what shipped. For a volunteer
 * that *is* persisted, each toggle goes to the server immediately, and the
 * local model is only updated once the request succeeds — so a failure leaves
 * the grid showing the truth.
 *
 * See docs/legacy/01-behavior.md §1.3.
 */
import * as api from '../../lib/api/index.js';
import { toastError } from '../toast.js';
import { isRemoteVolunteer } from './remote.js';

/**
 * Toggle the selected volunteer's claim on a slot.
 *
 * @returns {Promise<boolean>} whether the model changed
 */
export async function toggleRsvp(event, activity, win) {
  const volunteer = event.selectedVolunteer;
  const slot = event.slot(activity, win);
  if (!volunteer || !slot || !slot.enabled) return false;
  // `interactive`, not `expired`: an expired event is closed to everyone except
  // a platform admin, and that exemption is the model's to state rather than
  // this module's to re-derive.
  if (!event.interactive) return false;

  const held = event.hasRsvp(slot);
  if (!held && event.atCapacity(activity, slot)) return false;

  // Not the server's to record: local only, submitted later with the volunteer.
  if (!isRemoteVolunteer(event, volunteer)) {
    if (held) event.removeRsvp(volunteer, slot);
    else event.addRsvp(volunteer, slot);
    return true;
  }

  try {
    if (held) {
      await api.unsetRsvp(event.id, activity.id, win.id, volunteer.id);
      event.removeRsvp(volunteer, slot);
    } else {
      await api.setRsvp(event.id, activity.id, win.id, volunteer.id);
      event.addRsvp(volunteer, slot);
    }
    return true;
  } catch (e) {
    toastError(e, "Couldn't update that RSVP, sorry.");
    return false;
  }
}
