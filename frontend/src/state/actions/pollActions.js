/**
 * Everything that changes a poll, local and remote in one place.
 *
 * Written the way `structureActions.js` is written, and for the reason it opens
 * with: splitting these into parallel local and remote paths is what let the
 * legacy's two versions drift apart. Each action mutates the model and, when
 * the poll exists server-side, sends the matching request -- guarded by the
 * same `isRemote` predicate the event side uses, which is also what keeps a
 * tutorial poll from writing anything anywhere.
 */
import * as api from '../../lib/api/index.js';
import { loadPollInto } from '../../lib/api/pollDto.js';
import { pollCreatePayload } from '../serialize/pollPayload.js';
import { PollOption, PollWindow, cellKey } from '../pollEntities.svelte.js';
import { expandRepeat, newOnly } from '../../lib/poll/windows.js';
import { applyToNow } from '../../lib/poll/applyTo.js';
import { isRemote } from './remote.js';
import { toastDanger, toastError, toastSuccess } from '../toast.js';

/**
 * Fetch a poll and load it.
 *
 * @param {object} poll the model to fill
 * @param {string} idOrCode a UUID or a short code
 * @param {string|null} token this browser's edit token, if it holds one
 * @returns {Promise<boolean>} whether it loaded
 */
export async function loadPoll(poll, idOrCode, token = null) {
  try {
    const res = await api.getPoll(idOrCode, token);
    loadPollInto(poll, res.poll);
    return true;
  } catch (e) {
    toastError(e, "Couldn't load that poll... sorry.");
    return false;
  }
}

/** Re-read a poll that is already open, keeping the local display zone. */
export async function refreshPoll(poll, token = null) {
  const zone = poll.displayZone;
  const step = poll.step;
  const editing = poll.editing;
  const ok = await loadPoll(poll, poll.id, token);
  if (ok) {
    // Restored rather than reset: a refresh happens under the reader, and
    // snapping their zone choice and their scroll position back is a change
    // they did not ask for.
    poll.displayZone = zone;
    poll.step = step;
    poll.editing = editing;
  }
  return ok;
}

/**
 * Save the summary.
 *
 * @param {object} poll
 * @param {object} diff the already-computed PATCH body
 */
export async function savePollSummary(poll, diff) {
  if (!isRemote(poll)) return true;
  if (Object.keys(diff).length === 0) return true;
  try {
    await api.updatePoll(poll.id, diff);
    return true;
  } catch (e) {
    toastError(e, "Couldn't save your changes... sorry.");
    return false;
  }
}

/**
 * Add a column.
 *
 * The standing "apply to future days" rule is applied by the server, not here.
 * Locally that means the model has to be re-read rather than guessed at, since
 * the squares it created are the server's business -- guessing would put the
 * grid one refresh away from disagreeing with what people can actually vote for.
 */
export async function addOption(poll, { dayOfWeek = null, date = null, allDay = false }) {
  const option = new PollOption({
    dayOfWeek,
    date,
    allDay,
    priority: poll.options.length,
  });

  if (poll.options.some((o) => sameDay(poll, o, option))) {
    toastError(new Error('dup'), 'That day is already on this poll.');
    return false;
  }

  if (!isRemote(poll)) {
    poll.options = [...poll.options, option];
    // Locally the same rule has to be applied by hand, so a draft behaves the
    // way the published poll will.
    for (const win of poll.windows) if (win.appliesToNewOptions) poll.addCell(option, win);
    if (allDay) poll.addCell(option, null);
    return true;
  }

  try {
    await api.addPollOption(poll.id, {
      ...(poll.scope === 'RELATIVE' ? { dayOfWeek } : { date }),
      allDay,
      priority: poll.options.length,
    });
    await refreshPoll(poll);
    return true;
  } catch (e) {
    toastError(e, "Couldn't add that day... sorry.");
    return false;
  }
}

const sameDay = (poll, a, b) =>
  poll.scope === 'RELATIVE' ? a.dayOfWeek === b.dayOfWeek : a.date === b.date;

/** Remove a column, and every square and vote on it. */
export async function removeOption(poll, option) {
  if (isRemote(poll) && option.id) {
    try {
      await api.deletePollOption(poll.id, option.id);
    } catch (e) {
      toastError(e, "Couldn't remove that day... sorry.");
      return false;
    }
  }
  poll.options = poll.options.filter((o) => o.key !== option.key);
  for (const key of [...poll.cells.keys()]) {
    if (poll.cells.get(key)?.optionKey === option.key) poll.cells.delete(key);
  }
  poll.clampStep();
  return true;
}

/**
 * Turn All Day on or off for a column.
 *
 * Non-destructive in both directions: the column's timed squares stay exactly
 * where they are, so turning it back off restores the column the organiser
 * built rather than making them build it again.
 */
export async function setAllDay(poll, option, allDay) {
  if (isRemote(poll) && option.id) {
    try {
      await api.updatePollOption(poll.id, option.id, { allDay });
    } catch (e) {
      toastError(e, "Couldn't change that day... sorry.");
      return false;
    }
    option.allDay = allDay;
    await refreshPoll(poll);
    return true;
  }

  option.allDay = allDay;
  if (allDay) poll.addCell(option, null);
  else poll.removeCell(option, null);
  return true;
}

/**
 * Add one or more rows, from the window form's answers.
 *
 * The repeat is expanded here and then forgotten -- nothing about the
 * recurrence is stored, because every read path needs concrete rows anyway.
 *
 * @returns {Promise<boolean>}
 */
export async function addWindows(
  poll,
  { start, repeat, hours, minutes, until = null, mode, selected, future },
) {
  const wanted = newOnly(
    expandRepeat({ start, repeat, hours, minutes, until }),
    poll.windows.map((w) => w.startTime),
  );

  if (wanted.length === 0) {
    toastError(new Error('dup'), 'Those times are already on this poll.');
    return false;
  }

  if (!isRemote(poll)) {
    const applyTo = new Set(applyToNow({ mode, options: poll.options, selected }));
    // Local columns have no ids yet, so "which columns" is answered by key when
    // the poll is a draft and by id once it is not. `applyToNow` speaks ids, so
    // a draft matches on key directly.
    const byKey = mode === 'all'
      ? new Set(poll.options.map((o) => o.key))
      : new Set(selected ?? []);

    const added = wanted.map((startTime) => new PollWindow({ startTime, appliesToNewOptions: future }));
    poll.windows = [...poll.windows, ...added].sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (const win of added) {
      for (const option of poll.options) {
        const wanted_ = mode === 'all' ? byKey.has(option.key) : (byKey.has(option.key) || applyTo.has(option.id));
        if (wanted_) poll.addCell(option, win);
      }
    }
    return true;
  }

  try {
    // One request per row. The server has no bulk route, and a repeat produces
    // a handful of rows rather than hundreds -- the create endpoint caps a poll
    // at 96 in total.
    for (const startTime of wanted) {
      const body = { startTime, appliesToNewOptions: Boolean(future) };
      if (mode !== 'all') body.applyTo = applyToNow({ mode, options: poll.options, selected });
      await api.addPollWindow(poll.id, body);
    }
    await refreshPoll(poll);
    return true;
  } catch (e) {
    toastError(e, "Couldn't add that time... sorry.");
    return false;
  }
}

/** Change a row. */
export async function updateWindow(poll, win, changes) {
  if (isRemote(poll) && win.id) {
    try {
      await api.updatePollWindow(poll.id, win.id, changes);
    } catch (e) {
      toastError(e, "Couldn't save that time... sorry.");
      return false;
    }
  }
  Object.assign(win, changes);
  poll.windows = [...poll.windows].sort((a, b) => a.startTime.localeCompare(b.startTime));
  return true;
}

/** Remove a row, and every square and vote on it. */
export async function removeWindow(poll, win) {
  if (isRemote(poll) && win.id) {
    try {
      await api.deletePollWindow(poll.id, win.id);
    } catch (e) {
      toastError(e, "Couldn't remove that time... sorry.");
      return false;
    }
  }
  poll.windows = poll.windows.filter((w) => w.key !== win.key);
  for (const key of [...poll.cells.keys()]) {
    if (poll.cells.get(key)?.windowKey === win.key) poll.cells.delete(key);
  }
  return true;
}

/** Offer or withdraw one square. */
export async function toggleCell(poll, option, win) {
  const offered = poll.offers(option, win);

  if (isRemote(poll) && option.id && win.id) {
    try {
      if (offered) await api.unsetPollCell(poll.id, option.id, win.id);
      else await api.setPollCell(poll.id, option.id, win.id);
    } catch (e) {
      toastError(e, "Couldn't change that square... sorry.");
      return false;
    }
  }

  if (offered) poll.removeCell(option, win);
  else poll.addCell(option, win);
  return true;
}

// --- custom questions ------------------------------------------------------

export async function addDetail(poll, detail) {
  if (!isRemote(poll)) {
    poll.details = [...poll.details, { ...detail, id: null, priority: poll.details.length }];
    return true;
  }
  try {
    const res = await api.addPollDetail(poll.id, { ...detail, priority: poll.details.length });
    poll.details = [...poll.details, { ...detail, id: res.detail?.id ?? null }];
    return true;
  } catch (e) {
    toastError(e, "Couldn't add that question... sorry.");
    return false;
  }
}

export async function updateDetail(poll, detail, changes) {
  if (isRemote(poll) && detail.id) {
    try {
      await api.updatePollDetail(poll.id, detail.id, changes);
    } catch (e) {
      toastError(e, "Couldn't save that question... sorry.");
      return false;
    }
  }
  Object.assign(detail, changes);
  poll.details = [...poll.details];
  return true;
}

export async function removeDetail(poll, detail) {
  if (isRemote(poll) && detail.id) {
    try {
      await api.deletePollDetail(poll.id, detail.id);
    } catch (e) {
      toastError(e, "Couldn't remove that question... sorry.");
      return false;
    }
  }
  poll.details = poll.details.filter((d) => d !== detail);
  return true;
}

/**
 * Delete the whole poll.
 *
 * The sandbox clause is not decoration. Every other write in this module runs
 * through `isRemote`, which is false for a practice poll; this one did not,
 * because "Delete Poll" is owner-only and a practice poll had no owner, so the
 * button could never be reached. It can be now -- the tutorial's practice poll
 * is owned by the learner looking at it, which is what lets the poll track show
 * the organiser's own surface -- and without this the button would DELETE
 * against an id the server has never heard of.
 */
export async function deletePoll(poll) {
  if (poll.sandbox) {
    toastDanger('This is a practice poll, so there is nothing to delete.');
    return false;
  }
  try {
    await api.deletePoll(poll.id);
    toastSuccess('Deleted your poll.');
    return true;
  } catch (e) {
    toastError(e, "Couldn't delete your poll... sorry.");
    return false;
  }
}

/**
 * Publish a draft: the whole graph in one `POST /v1/polls`.
 *
 * The sandbox clause belongs here rather than in the shell, with the rest of
 * the `isRemote` gating. A tutorial poll carries no id, so nothing else in this
 * file would write anything for it -- but Publish is the one control that
 * creates an id, and without this the tutorial's practice poll would become a
 * real one.
 *
 * @returns {Promise<{ok: boolean, pollId?: string, sandbox?: boolean}>}
 */
export async function publishPoll(poll, { account = null, captcha = null } = {}) {
  if (poll.sandbox) return { ok: false, sandbox: true };

  // Checked here as well as by the server, because the server's 400 names a
  // field and this can name the thing the organiser has to go and do.
  if (poll.options.length === 0) {
    toastError(new Error('empty'), 'Add at least one day before publishing.');
    return { ok: false };
  }
  if (poll.windows.length === 0) {
    toastError(new Error('empty'), 'Add at least one time before publishing.');
    return { ok: false };
  }

  try {
    const res = await api.createPoll(pollCreatePayload(poll, { account }), captcha);
    toastSuccess('Successfully created your poll!');
    return { ok: true, pollId: res.poll?.id ?? null };
  } catch (e) {
    toastError(e, "Couldn't create your poll... sorry.");
    return { ok: false };
  }
}
