/**
 * Wire shapes to poll models, and back.
 *
 * Polls have one projection rather than the event side's three, because
 * `PollView` on the server builds every response from one place. So there is
 * nothing here of the shape `windowFromEventRead` vs `windowFromWrite` -- a
 * poll's window reads the same whichever endpoint answered.
 */
import { PollCell, PollOption, PollResponse, PollWindow, cellKey } from '../../state/pollEntities.svelte.js';

/** @param {object} raw a `poll.options[]` entry */
export const optionFromApi = (raw) =>
  new PollOption({
    id: raw.id,
    dayOfWeek: raw.dayOfWeek ?? null,
    date: raw.date ?? null,
    allDay: Boolean(raw.allDay),
    priority: raw.priority ?? 0,
  });

/** @param {object} raw a `poll.windows[]` entry */
export const windowFromApi = (raw) =>
  new PollWindow({
    id: raw.id,
    startTime: raw.startTime,
    appliesToNewOptions: Boolean(raw.appliesToNewOptions),
  });

/** @param {object} raw a `poll.details[]` entry */
export const detailFromApi = (raw) => ({
  id: raw.id,
  type: raw.type,
  label: raw.label,
  hint: raw.hint ?? '',
  required: Boolean(raw.required),
  priority: raw.priority ?? 0,
});

/**
 * Load a server poll into a model, in place.
 *
 * In place rather than returning a new one, mirroring `EventModel.load`: the
 * app drives a single current poll that other modules hold a reference to, so
 * swapping the object would leave them pointing at the old one.
 *
 * @param {object} poll the model to fill
 * @param {object} raw the `poll` object from the server
 */
export function loadPollInto(poll, raw) {
  poll.reset();

  poll.id = raw.id;
  poll.code = raw.code ?? null;
  poll.admin = raw.admin ?? null;
  poll.title = raw.shortDescription ?? '';
  poll.description = raw.longDescription ?? '';
  poll.scope = raw.scope ?? 'RELATIVE';
  poll.timeMode = raw.timeMode ?? 'WALL_CLOCK';
  poll.timezone = raw.timezone ?? null;
  // Sent as a string because a JSON number is a double and an epoch in
  // milliseconds is past the point where every one is exactly representable.
  poll.deadline = raw.responseDeadline == null ? null : Number(raw.responseDeadline);
  poll.allowMultiAnswers = Boolean(raw.allowMultiAnswers);
  poll.allowAnswerEdits = Boolean(raw.allowAnswerEdits);
  poll.resultVisibility = raw.resultVisibility ?? 'CREATOR_ONLY';
  poll.isPublished = Boolean(raw.isPublished);
  poll.closed = Boolean(raw.closed);
  poll.requiresAuthenticatedAnswers = Boolean(raw.requiresAuthenticatedAnswers);

  poll.options = (raw.options ?? []).map(optionFromApi);
  poll.windows = (raw.windows ?? []).map(windowFromApi);
  poll.details = (raw.details ?? []).map(detailFromApi);

  // Squares arrive as a flat list keyed by server ids; the model keys them by
  // the local keys of the column and row they join, so the grid can look one up
  // without searching.
  const optionByID = new Map(poll.options.map((o) => [o.id, o]));
  const windowByID = new Map(poll.windows.map((w) => [w.id, w]));
  for (const raw_ of raw.cells ?? []) {
    const option = optionByID.get(raw_.option);
    if (!option) continue;
    const win = raw_.window == null ? null : windowByID.get(raw_.window);
    // A square naming a row this poll does not list is skipped rather than
    // keyed under `undefined`, which would collide with the all-day square.
    if (raw_.window != null && !win) continue;
    poll.cells.set(
      cellKey(option.key, win?.key ?? null),
      new PollCell(option.key, win?.key ?? null, { id: raw_.id }),
    );
  }

  if (raw.tally) {
    poll.tally = raw.tally.byCell ?? {};
    poll.respondents = raw.tally.respondents ?? 0;
  }

  poll.responses = (raw.responses ?? []).map(responseFromApi);

  const own = raw.yourResponse ?? null;
  if (own) {
    poll.ownResponse = responseFromApi(own);
    for (const id of own.votes ?? []) poll.votes.add(id);
  }

  return poll;
}

/** @param {object} raw a `poll.responses[]` entry */
export function responseFromApi(raw) {
  const response = new PollResponse({
    id: raw.id,
    name: raw.name,
    submitted: raw.submitted == null ? null : new Date(Number(raw.submitted)),
    votes: raw.votes ?? [],
  });
  for (const answer of raw.details ?? []) response.values.set(answer.detail, answer.value);
  return response;
}
