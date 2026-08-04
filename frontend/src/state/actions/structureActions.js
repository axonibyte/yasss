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
import { toastDanger, toastError } from '../toast.js';

/** True once the event exists server-side and changes must be published. */
const isRemote = (event) => event.persisted;

/**
 * Asserts that a write actually came back with an id.
 *
 * Every one of these used to be `res.thing?.id ?? null`, which reads as
 * defensive and is the opposite. An id is what every later operation gates on —
 * `updateActivity`, `removeDetail`, `updateSlot` all check `item.id` and quietly
 * skip the network when it is missing. So a response that did not carry one left
 * an item on screen that looked saved, reported success, and then silently
 * absorbed every subsequent edit to it. Failing here instead routes into the
 * caller's existing catch, which toasts and removes the half-made item.
 *
 * @param {unknown} id the id from the write response
 * @param {string} label what to call the thing in the error
 * @returns {string} the id
 */
function requireId(id, label) {
  if (typeof id !== 'string' || !id) {
    throw new Error(`The server did not say which ${label} it created.`);
  }
  return id;
}

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
      activity.id = requireId(res.activity?.id, 'activity');
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

/**
 * Renumbers a list so `priority` matches display order, and pushes only what
 * actually changed.
 *
 * Priority is the server's sort key while array position is the client's, so
 * the two have to be reconciled after any move. Renumbering everything rather
 * than swapping two values is deliberate: nothing guarantees existing
 * priorities are contiguous — an event built before reordering existed may have
 * every activity at 0 — and swapping within a degenerate set does nothing at
 * all.
 *
 * @returns {Promise<boolean>} false if any push failed, leaving the model alone
 */
async function republishOrder(event, ordered, { push, label }) {
  if (!isRemote(event)) return true;

  const changed = ordered
    .map((item, index) => ({ item, index }))
    .filter(({ item, index }) => item.id && item.priority !== index);

  const applied = [];
  try {
    for (const change of changed) {
      await push(event.id, change.item.id, { priority: change.index });
      applied.push(change);
    }
  } catch (e) {
    toastError(e, `Couldn't reorder that ${label}, sorry.`);

    // Priorities go out one at a time, so a failure partway leaves the server
    // holding some of the new order while the caller abandons the local move
    // entirely. The two then disagree for good — and nothing on screen says so,
    // because every request that did land answered 200. Put back what took.
    //
    // `item.priority` is still the original: callers only renumber the model
    // after this resolves true.
    try {
      for (const { item } of applied.reverse()) {
        await push(event.id, item.id, { priority: item.priority });
      }
    } catch {
      // The rollback failed too, so the server's order is genuinely unknown.
      // Say that plainly rather than leaving the user to discover it later.
      toastDanger(
        `The ${label} order on the server may not match what you see. `
        + 'Reload the page to check.',
      );
    }
    return false;
  }
  return true;
}

/** Moves an item one place within a list, returning the new array or null. */
function reordered(list, item, delta) {
  const from = list.indexOf(item);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= list.length) return null;

  const next = [...list];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/**
 * Moves an activity one column left or right.
 *
 * @param {number} delta -1 or 1
 * @returns {Promise<boolean>} true if the move landed
 */
export async function moveActivity(event, activity, delta) {
  const next = reordered(event.activities, activity, delta);
  if (!next) return false;

  if (!await republishOrder(event, next, { push: api.updateActivity, label: 'activity' })) {
    return false;
  }

  next.forEach((a, i) => { a.priority = i; });
  event.activities = next;
  event.clampStep();
  return true;
}

/**
 * Moves a custom field one place up or down.
 *
 * @param {number} delta -1 or 1
 * @returns {Promise<boolean>} true if the move landed
 */
export async function moveDetail(event, detail, delta) {
  const next = reordered(event.details, detail, delta);
  if (!next) return false;

  if (!await republishOrder(event, next, { push: api.updateDetail, label: 'field' })) {
    return false;
  }

  next.forEach((d, i) => { d.priority = i; });
  event.details = next;
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
  const win = new EventWindow({ ...values, timezone: event.timezone });

  if (isRemote(event)) {
    try {
      const res = await api.addWindow(event.id, win);
      // `res.window ?? {}` was worse than no guard at all: `windowFromWrite({})`
      // returns `{id: undefined, begin: null, end: null}`, and assigning that
      // over the window wiped the dates the user had just picked while leaving
      // it id-less — so the window rendered blank and every later edit to it
      // silently went local-only.
      const written = windowFromWrite(res.window ?? {});
      requireId(written.id, 'window');
      Object.assign(win, written);
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
      detail.id = requireId(res.detail?.id, 'field');
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
