/**
 * The `POST /v1/polls` body: an entire poll graph in one request.
 *
 * READ THIS BEFORE COMPARING IT WITH `eventPayload.js`. The two files describe
 * the same-looking grid under opposite rules, and the difference is the single
 * most dangerous thing in either contract:
 *
 *   - For an EVENT, omission ENABLES. `CreateEventEndpoint` commits a slot for
 *     every (activity, window) pair unless an explicit `{enabled: false}` says
 *     otherwise, so that payload emits one entry per pair, always.
 *   - For a POLL, presence ENABLES. A `poll_cell` row exists if and only if the
 *     square is offered, so this payload sends only the squares that are, and
 *     sending nothing for a pair is how a square is withheld.
 *
 * Anyone who has read one of these and then the other will assume the wrong
 * one, which is why it is stated at both ends rather than in a commit message.
 *
 * Columns and rows are referenced by array index, since nothing has an id yet.
 */

/**
 * @param {object} poll the poll model
 * @param {string|null} account set as the poll's admin when signed in
 */
export function pollCreatePayload(poll, { account = null } = {}) {
  const optionIndex = new Map(poll.options.map((o, i) => [o.key, i]));
  const windowIndex = new Map(poll.windows.map((w, i) => [w.key, i]));

  const payload = {
    ...(account ? { admin: account } : {}),
    shortDescription: poll.title,
    longDescription: poll.description ?? '',
    scope: poll.scope,
    timeMode: poll.timeMode,
    // Sent only on a zoned poll. The server refuses a zone on a wall-clock one
    // rather than storing a value nothing reads -- see PollRules.
    ...(poll.timeMode === 'ZONED' && poll.timezone ? { timezone: poll.timezone } : {}),
    // Stringified epoch millis, as the event payload sends window times.
    ...(poll.deadline ? { responseDeadline: String(poll.deadline) } : {}),
    allowMultiAnswers: Boolean(poll.allowMultiAnswers),
    allowAnswerEdits: Boolean(poll.allowAnswerEdits),
    resultVisibility: poll.resultVisibility,

    options: poll.options.map((option, i) => ({
      // Exactly one of these, decided by the scope. Sending both is a 400, and
      // the database CHECK would refuse it even if the endpoint did not.
      ...(poll.scope === 'RELATIVE' ? { dayOfWeek: option.dayOfWeek } : { date: option.date }),
      allDay: Boolean(option.allDay),
      // Array position is the display order, as it is for activities.
      priority: i,
    })),

    windows: poll.windows.map((win) => ({
      startTime: win.startTime,
      appliesToNewOptions: Boolean(win.appliesToNewOptions),
    })),

    details: poll.details.map((detail, i) => ({
      type: detail.type,
      label: detail.label,
      ...(detail.hint ? { hint: detail.hint } : {}),
      required: Boolean(detail.required),
      priority: i,
    })),

    // Only the squares that are offered. A square whose column or row is not in
    // the payload is dropped rather than sent with a dangling index -- that can
    // only happen mid-edit, and an index the server cannot resolve is a 400
    // where silence is harmless.
    cells: [...poll.cells.values()]
      .map((cell) => {
        const option = optionIndex.get(cell.optionKey);
        if (option === undefined) return null;
        if (cell.windowKey === null) return { option };
        const win = windowIndex.get(cell.windowKey);
        return win === undefined ? null : { option, window: win };
      })
      .filter(Boolean),
  };

  return payload;
}

/**
 * The `PATCH /v1/polls/:id` body: only what changed.
 *
 * A diff rather than the whole summary, for the reason the event side sends
 * one: a PATCH carrying every field overwrites concurrent edits with values the
 * user never looked at.
 *
 * @param {object} values the form's answers
 * @param {object} previous what the poll held before
 */
export function pollSummaryDiff(values, previous) {
  const diff = {};
  const set = (key, wire = key) => {
    if (values[key] !== previous[key]) diff[wire] = values[key];
  };

  if (values.title !== previous.title) diff.shortDescription = values.title;
  if (values.description !== previous.description) diff.longDescription = values.description;
  set('timeMode');
  set('allowMultiAnswers');
  set('allowAnswerEdits');
  set('resultVisibility');

  // Both of these are explicitly nullable, and the server reads a JSON null as
  // "clear it" -- which is how a poll moves from zoned back to wall clock, and
  // how a deadline is removed to reopen a poll. `undefined` would be dropped by
  // JSON.stringify and the change would silently not happen.
  if (values.timezone !== previous.timezone) diff.timezone = values.timezone ?? null;
  if (values.deadline !== previous.deadline) {
    diff.responseDeadline = values.deadline == null ? null : String(values.deadline);
  }

  return diff;
}
