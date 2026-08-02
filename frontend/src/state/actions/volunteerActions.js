/**
 * Volunteer creation, update, deletion, and the deferred submit.
 *
 * Persistence stays deferred, as it shipped: adding a volunteer builds them
 * locally and "Submit RSVPs" is what actually writes them. Two things about
 * that are fixed. The legacy toasted success *before* any request resolved and
 * had no failure handling at all, so a failed submit looked identical to a
 * successful one; here the toast follows the requests and reports what actually
 * happened. And because unsubmitted work can now be lost, the caller installs
 * an unload guard — see `hasUnsavedWork`.
 *
 * See docs/legacy/01-behavior.md §1.4 and §6.10.
 */
import * as api from '../../lib/api/index.js';
import { toastDanger, toastError, toastSuccess } from '../toast.js';
import { volunteerCreatePayload, volunteerUpdatePayload } from '../serialize/volunteerPayload.js';

/** Volunteers that exist only in the browser. */
export const pendingVolunteers = (event) => event.volunteers.filter((v) => !v.persisted);

/** True when closing the tab would lose something. */
export const hasUnsavedWork = (event) => pendingVolunteers(event).length > 0;

/**
 * Persist one volunteer and adopt the server's id, wiring their RSVPs into the
 * slot membership sets that only accept persisted ids.
 */
async function createVolunteer(event, volunteer, account, captcha) {
  const payload = volunteerCreatePayload(volunteer, {
    details: event.details,
    activities: event.activities,
    windows: event.windows,
    account,
  });

  const res = await api.addVolunteer(event.id, payload, captcha);
  const id = res.volunteer?.id;
  if (!id) throw new Error('The server did not return a volunteer id.');

  volunteer.id = id;

  // Now that there is an id, record it against every slot they hold so the
  // counts and capacity checks see them.
  for (const activity of event.activities) {
    for (const slot of activity.slots.values()) {
      if (volunteer.rsvps.has(slot.key)) slot.rsvps.add(id);
    }
  }
  return volunteer;
}

/**
 * Submit every unsaved volunteer.
 *
 * @returns {Promise<boolean>} true if everything landed
 */
export async function submitVolunteers(event, { account, captcha }) {
  const pending = pendingVolunteers(event);
  if (pending.length === 0) {
    toastSuccess('Everything is already up to date!');
    return true;
  }

  const failures = [];
  for (const volunteer of pending) {
    try {
      await createVolunteer(event, volunteer, account, captcha);
    } catch (e) {
      failures.push({ volunteer, error: e });
    }
  }

  if (failures.length === 0) {
    toastSuccess('RSVP successfully submitted!');
    return true;
  }

  // Name the ones that failed; they are still on screen and still unsaved.
  const names = failures.map((f) => f.volunteer.name).join(', ');
  toastDanger(
    failures.length === pending.length
      ? `Couldn't submit your RSVP: ${failures[0].error.info ?? failures[0].error.message}`
      : `Some volunteers couldn't be saved (${names}). Please try again.`,
  );
  return false;
}

/** Push a rename or changed answers for an already-persisted volunteer. */
export async function saveVolunteer(event, volunteer) {
  if (!volunteer.persisted) return true;
  try {
    await api.updateVolunteer(
      event.id,
      volunteer.id,
      volunteerUpdatePayload(volunteer, { details: event.details }),
    );
    return true;
  } catch (e) {
    toastError(e, "Couldn't update that volunteer, sorry.");
    return false;
  }
}

/** Delete a volunteer, server-side if they got that far. */
export async function deleteVolunteer(event, volunteer) {
  if (volunteer.persisted) {
    try {
      await api.removeVolunteer(event.id, volunteer.id);
    } catch (e) {
      toastError(e, "Couldn't remove that volunteer, sorry.");
      return false;
    }
  }
  // Releases their slots and fixes the counts, which the legacy did not.
  event.removeVolunteer(volunteer);
  return true;
}
