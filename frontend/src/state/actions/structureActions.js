/**
 * Create, update and delete for activities, windows, details and slots.
 *
 * One module rather than two, because the only difference between the creation
 * wizard and edit mode is whether the change is also sent to the server. In the
 * wizard nothing has an id and everything is local until publish; in edit mode
 * every change publishes immediately. Splitting those into parallel local and
 * remote code paths is what let the legacy's two versions drift apart — its
 * wizard branch built slots with an undefined cap while the edit branch got it
 * right, and its activity PATCH used a key the server does not tokenize.
 *
 * See docs/legacy/01-behavior.md §1.5-§1.7.
 */
import * as api from '../../lib/api/index.js';
import {
  activityChangesToApi, detailChangesToApi, windowFromWrite, windowToApi,
} from '../../lib/api/dto.js';
import { Activity, Detail, EventWindow, Slot } from '../entities.svelte.js';
import { toastError } from '../toast.js';

/** True once the event exists server-side and changes must be published. */
const isRemote = (event) => event.persisted;

// --- activities ------------------------------------------------------------

export async function addActivity(event, values) {
  const activity = new Activity(values);
  // Every window gets a slot, enabled by default at the activity's default cap.
  for (const win of event.windows) {
    activity.slots.set(win.key, new Slot(activity.key, win.key, {
      enabled: true,
      cap: activity.slotCapDefault,
    }));
  }

  if (isRemote(event)) {
    try {
      const res = await api.addActivity(event.id, activity, event.activities.length);
      activity.id = res.activity?.id ?? null;
      // A newly added activity has no slots server-side until they are set.
      for (const slot of activity.slots.values()) slot.enabled = false;
    } catch (e) {
      toastError(e, "Couldn't add that activity, sorry.");
      return null;
    }
  }

  event.activities = [...event.activities, activity];
  event.clampStep();
  return activity;
}

export async function updateActivity(event, activity, values) {
  if (isRemote(event) && activity.id) {
    const changes = activityChangesToApi(values, activity);
    if (Object.keys(changes).length > 0) {
      try {
        await api.updateActivity(event.id, activity.id, changes);
      } catch (e) {
        toastError(e, "Couldn't update that activity, sorry.");
        return false;
      }
    }
  }
  Object.assign(activity, values);
  return true;
}

export async function removeActivity(event, activity) {
  if (isRemote(event) && activity.id) {
    try {
      await api.removeActivity(event.id, activity.id);
    } catch (e) {
      toastError(e, "Couldn't remove that activity, sorry.");
      return false;
    }
  }
  event.removeActivity(activity);
  return true;
}

// --- windows ---------------------------------------------------------------

export async function addWindow(event, values) {
  const win = new EventWindow(values);

  if (isRemote(event)) {
    try {
      const res = await api.addWindow(event.id, win);
      Object.assign(win, windowFromWrite(res.window ?? {}));
    } catch (e) {
      toastError(e, "Couldn't add that window, sorry.");
      return null;
    }
  }

  // Give every activity a slot for the new window. Enabled locally in the
  // wizard; disabled against a live event until explicitly set.
  for (const activity of event.activities) {
    activity.slots.set(win.key, new Slot(activity.key, win.key, {
      enabled: !isRemote(event),
      cap: activity.slotCapDefault,
    }));
  }

  event.windows = [...event.windows, win];
  return win;
}

export async function updateWindow(event, win, values) {
  if (isRemote(event) && win.id) {
    try {
      await api.updateWindow(event.id, win.id, windowToApi(values));
    } catch (e) {
      toastError(e, "Couldn't update that window, sorry.");
      return false;
    }
  }
  Object.assign(win, values);
  return true;
}

export async function removeWindow(event, win) {
  if (isRemote(event) && win.id) {
    try {
      await api.removeWindow(event.id, win.id);
    } catch (e) {
      toastError(e, "Couldn't remove that window, sorry.");
      return false;
    }
  }
  event.removeWindow(win);
  return true;
}

// --- details ---------------------------------------------------------------

export async function addDetail(event, values) {
  const detail = new Detail(values);

  if (isRemote(event)) {
    try {
      const res = await api.addDetail(event.id, detail, event.details.length);
      detail.id = res.detail?.id ?? null;
    } catch (e) {
      toastError(e, "Couldn't add that field, sorry.");
      return null;
    }
  }

  event.details = [...event.details, detail];
  return detail;
}

export async function updateDetail(event, detail, values) {
  if (isRemote(event) && detail.id) {
    const changes = detailChangesToApi(values, detail);
    if (Object.keys(changes).length > 0) {
      try {
        await api.updateDetail(event.id, detail.id, changes);
      } catch (e) {
        toastError(e, "Couldn't update that field, sorry.");
        return false;
      }
    }
  }
  Object.assign(detail, values);
  return true;
}

export async function removeDetail(event, detail) {
  if (isRemote(event) && detail.id) {
    try {
      await api.removeDetail(event.id, detail.id);
    } catch (e) {
      toastError(e, "Couldn't remove that field, sorry.");
      return false;
    }
  }
  event.details = event.details.filter((d) => d !== detail);
  // Drop any answers that referenced it, as the server's cascade does.
  for (const volunteer of event.volunteers) volunteer.values.delete(detail.key);
  return true;
}

// --- slots -----------------------------------------------------------------

/**
 * Enable, disable or re-cap a single cell.
 *
 * A slot row exists server-side iff it is enabled, so this is a PUT or a DELETE
 * rather than a PATCH.
 */
export async function updateSlot(event, activity, win, { enabled, cap }) {
  const slot = activity.slotFor(win);

  if (isRemote(event) && activity.id && win.id) {
    try {
      if (enabled) await api.setSlot(event.id, activity.id, win.id, cap);
      else await api.unsetSlot(event.id, activity.id, win.id);
    } catch (e) {
      toastError(e, "Couldn't update that slot, sorry.");
      return false;
    }
  }

  slot.enabled = enabled;
  slot.cap = cap;
  return true;
}
