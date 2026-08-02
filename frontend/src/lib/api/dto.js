/**
 * Wire <-> domain mapping.
 *
 * This module exists for one reason: `GET /v1/events/:event` returns windows as
 * `begin`/`end`, but every write — and every other endpoint's window response —
 * uses `beginTime`/`endTime` (docs/legacy/03-api-contract.md §2). Rather than
 * let that asymmetry leak into components, it is absorbed here.
 *
 * It also fixes two legacy PATCH-key bugs:
 *   - the event summary PATCH wrote `shortDescription` twice, so editing the
 *     long description clobbered the title and the long description could never
 *     be saved at all (app.js:1933-1936)
 *   - the activity PATCH sent `slotVolunteerCapDefault`, but the server
 *     tokenizes `maxSlotVolunteersDefault`, so the slot default never saved
 *     (app.js:2015)
 */

// --- windows ---------------------------------------------------------------

/** Read shape from `GET /events/:id` — `begin`/`end`, epoch millis. */
export function windowFromEventRead(w) {
  return {
    id: w.id,
    begin: w.begin == null ? null : new Date(w.begin),
    end: w.end == null ? null : new Date(w.end),
  };
}

/** Read shape from Add/Modify window responses — `beginTime`/`endTime`. */
export function windowFromWrite(w) {
  return {
    id: w.id,
    begin: w.beginTime == null ? null : new Date(w.beginTime),
    end: w.endTime == null ? null : new Date(w.endTime),
  };
}

/**
 * Write shape. Timestamps go out as stringified epoch millis, which
 * `JSONDeserializer.getTimestamp` accepts.
 *
 * `endTime` is only included when explicitly provided; pass `null` to clear it
 * on a PATCH. Note the server silently nulls `endTime` when it equals
 * `beginTime`.
 */
export function windowToApi({ begin, end }, { includeEnd = true } = {}) {
  const out = {};
  if (begin != null) out.beginTime = String(begin.getTime());
  if (includeEnd) out.endTime = end == null ? null : String(end.getTime());
  return out;
}

// --- events ----------------------------------------------------------------

export function eventSummaryFromApi(e) {
  return {
    id: e.id,
    admin: e.admin ?? null,
    title: e.shortDescription ?? '',
    description: e.longDescription ?? '',
    notifyOnSignup: Boolean(e.emailOnSubmission),
    allowMultiuserSignups: Boolean(e.allowMultiUserSignups),
    isPublished: Boolean(e.isPublished),
    volunteersMaxed: Boolean(e.volunteersMaxed),
    expired: Boolean(e.expired),
  };
}

/**
 * Only the fields that actually changed, so a PATCH never touches anything the
 * user did not edit.
 *
 * @param {object} next     current local summary
 * @param {object} previous last-known server state
 */
export function eventSummaryToApi(next, previous = {}) {
  const changes = {};
  if (next.title !== previous.title) changes.shortDescription = next.title;
  if (next.description !== previous.description) changes.longDescription = next.description;
  if (next.notifyOnSignup !== previous.notifyOnSignup) {
    changes.emailOnSubmission = next.notifyOnSignup;
  }
  if (next.allowMultiuserSignups !== previous.allowMultiuserSignups) {
    changes.allowMultiUserSignups = next.allowMultiuserSignups;
  }
  return changes;
}

// --- activities ------------------------------------------------------------

export function activityFromApi(a) {
  return {
    id: a.id,
    label: a.shortDescription ?? '',
    description: a.longDescription ?? '',
    volunteerCap: a.maxActivityVolunteers ?? 0,
    slotCapDefault: a.maxSlotVolunteersDefault ?? 0,
    priority: a.priority ?? 0,
  };
}

export function activityToApi(a, { priority } = {}) {
  const out = {
    shortDescription: a.label,
    longDescription: a.description ?? '',
    maxActivityVolunteers: a.volunteerCap ?? 0,
    maxSlotVolunteersDefault: a.slotCapDefault ?? 0,
  };
  if (priority !== undefined) out.priority = priority;
  return out;
}

/** Changed fields only. */
export function activityChangesToApi(next, previous = {}) {
  const changes = {};
  if (next.label !== previous.label) changes.shortDescription = next.label;
  if (next.description !== previous.description) changes.longDescription = next.description;
  if (next.volunteerCap !== previous.volunteerCap) {
    changes.maxActivityVolunteers = next.volunteerCap;
  }
  if (next.slotCapDefault !== previous.slotCapDefault) {
    changes.maxSlotVolunteersDefault = next.slotCapDefault;
  }
  return changes;
}

// --- details ---------------------------------------------------------------

export function detailFromApi(d) {
  return {
    id: d.id,
    type: d.type ?? 'STRING',
    label: d.label ?? '',
    hint: d.hint ?? '',
    required: Boolean(d.required),
    priority: d.priority ?? 0,
  };
}

export function detailToApi(d, { priority } = {}) {
  const out = {
    type: d.type,
    label: d.label,
    hint: d.hint ?? '',
    required: Boolean(d.required),
  };
  if (priority !== undefined) out.priority = priority;
  return out;
}

export function detailChangesToApi(next, previous = {}) {
  const changes = {};
  if (next.type !== previous.type) changes.type = next.type;
  if (next.label !== previous.label) changes.label = next.label;
  if (next.hint !== previous.hint) changes.hint = next.hint;
  if (next.required !== previous.required) changes.required = next.required;
  return changes;
}

// --- volunteers ------------------------------------------------------------

export function volunteerFromApi(v) {
  return {
    id: v.id,
    user: v.user ?? null,
    name: v.name ?? '',
    remindersEnabled: Boolean(v.remindersEnabled),
    // [{detail: <uuid>, value}] — callers map detail ids to client keys
    details: Array.isArray(v.details) ? v.details : [],
  };
}
