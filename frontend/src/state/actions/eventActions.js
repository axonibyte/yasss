/**
 * Event-level operations: loading, the summary PATCH, and the report.
 */
import * as api from '../../lib/api/index.js';
import { eventSummaryToApi } from '../../lib/api/dto.js';
import { isForbidden, isNotFound, isUnpublished } from '../../lib/api/errors.js';
import { toastDanger, toastError, toastSuccess } from '../toast.js';

/**
 * Load an event into the model.
 *
 * The four status-specific messages are the legacy's (behavior §1.2); a bare
 * "something went wrong" would be a regression in how much the user is told.
 */
export async function loadEvent(event, eventId) {
  try {
    const res = await api.getEvent(eventId);
    event.load(res.event);
    return true;
  } catch (e) {
    if (isNotFound(e)) toastDanger("That event doesn't exist. Sorry about that.");
    else if (isUnpublished(e)) {
      toastDanger("That event hasn't yet been published. Sorry about that.");
    } else if (isForbidden(e)) toastDanger('Access denied.');
    else {
      toastDanger('An internal error prevented us from showing your event. Sorry about that.');
    }
    return false;
  }
}

/** Persist a changed summary, sending only the fields that actually differ. */
export async function saveSummary(event, next, previous) {
  const changes = eventSummaryToApi(next, previous);
  if (Object.keys(changes).length === 0) return true;

  try {
    await api.updateEvent(event.id, changes);
    return true;
  } catch (e) {
    toastError(e, "Couldn't update your event... sorry.");
    return false;
  }
}

/**
 * Open the printable report in a new tab.
 *
 * The response is HTML rather than JSON. The legacy never revoked the object
 * URL it created here.
 */
export async function openReport(eventId) {
  let url = null;
  try {
    const blob = await api.getEventReport(eventId);
    url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) {
      toastDanger('Your browser blocked the report window. Please allow pop-ups and retry.');
      return false;
    }
    win.focus();
    return true;
  } catch (e) {
    toastError(e, "Couldn't generate that report, sorry.");
    return false;
  } finally {
    // Give the new tab a moment to take ownership before releasing it.
    if (url) setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

