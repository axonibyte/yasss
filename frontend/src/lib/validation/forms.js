/**
 * Form validators — pure, DOM-free, and therefore testable.
 *
 * The legacy validators read the DOM directly, mixed validation with toasting,
 * and signaled failure by returning `null` (sometimes silently, with no toast
 * at all — behavior §3.8). These take plain values and return a verdict; the
 * caller decides how to present it.
 *
 * Every rule mirrors a server-side check so the client fails fast with a
 * specific message instead of surfacing an opaque 400.
 * See docs/legacy/01-behavior.md §3 and 03-api-contract.md §3.
 */
import { DETAIL_TYPES, isKnownType } from './detailTypes.js';
import * as patterns from './patterns.js';
import { getPasswordMinLength } from './policy.js';

/** The server stores caps in TINYINT UNSIGNED and rejects outside this range. */
export const CAP_MIN = 1;
export const CAP_MAX = 255;

/**
 * Every free-text column server-side is `VARCHAR(255)`.
 *
 * Without this the client happily accepts a longer value and the failure
 * arrives from the server — as `malformed argument (string too long: ...)` at
 * best, and for a volunteer's answer to a custom field as a 500, because that
 * one reaches the insert unchecked. Either way it lands as a toast with no
 * field attached to it, and for an organizer it lands at publish, after an
 * entire event has been built on a value that was never going to save.
 */
export const MAX_TEXT = 255;

/** @returns {string|null} */
function lengthError(value, label) {
  return value.length > MAX_TEXT
    ? `The ${label} needs to be ${MAX_TEXT} characters or fewer.`
    : null;
}

/**
 * @typedef {object} Verdict
 * @property {boolean} ok
 * @property {Record<string, string>} errors  field name -> message
 * @property {object} [values]                normalized values, when ok
 */

const ok = (values) => ({ ok: true, errors: {}, values });
const fail = (errors) => ({ ok: false, errors });

/** A cap of 0 means unlimited and skips the range check. */
function capError(value, label) {
  if (value === 0) return null;
  if (!Number.isInteger(value) || value < CAP_MIN || value > CAP_MAX) {
    return `The ${label} needs to be a number between ${CAP_MIN} and ${CAP_MAX}.`;
  }
  return null;
}

// --- event summary ---------------------------------------------------------

/** One year in minutes — the server refuses anything longer. */
export const LEAD_MIN = 1;
export const LEAD_MAX = 525_600;

/**
 * Whether a string is a time zone this browser can actually resolve.
 *
 * Asks the formatter rather than checking membership of
 * `Intl.supportedValuesOf('timeZone')`. That list is the *canonical* set and
 * deliberately omits some zones the engine nonetheless accepts — `UTC` is the
 * one that matters, since it is what `Intl` reports for a browser running in
 * UTC and what the whole test suite pins itself to. Validating against the list
 * therefore rejected the zone the browser had just told us it was in.
 *
 * The formatter probe is also the closer match to the server, whose
 * `ZoneId.getAvailableZoneIds()` does include `UTC`. This exists so a bad zone
 * is reported at the field rather than arriving as a toast after the save.
 */
export function isValidTimezone(zone) {
  if (typeof zone !== 'string' || zone === '') return false;
  try {
    // Throws a RangeError for anything it cannot resolve.
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function validateSummary({
  title, description, notifyOnSignup, allowMultiuserSignups, reminderLeadTime, timezone,
}) {
  const errors = {};
  const trimmed = String(title ?? '').trim();
  if (trimmed === '') errors.title = 'The title of your event cannot be blank.';
  else {
    const tooLong = lengthError(trimmed, 'title of your event');
    if (tooLong) errors.title = tooLong;
  }

  const trimmedDescription = String(description ?? '').trim();
  const descriptionTooLong = lengthError(trimmedDescription, 'description');
  if (descriptionTooLong) errors.description = descriptionTooLong;

  // Blank means "use the platform default", which is a real choice rather than
  // a missing value — so it is only validated when something was typed.
  let lead = null;
  const rawLead = String(reminderLeadTime ?? '').trim();
  if (rawLead !== '') {
    lead = Number(rawLead);
    if (!Number.isInteger(lead) || lead < LEAD_MIN || lead > LEAD_MAX) {
      errors.reminderLeadTime =
        `Reminder lead time needs to be a whole number of minutes between ${LEAD_MIN} and ${LEAD_MAX}.`;
    }
  }

  // Null is a real value here: an event that recorded no zone renders in each
  // viewer's own, which is the pre-timezone behavior and still correct.
  const zone = timezone == null || timezone === '' ? null : String(timezone);
  if (zone !== null && !isValidTimezone(zone)) {
    errors.timezone = 'That is not a time zone this browser recognizes.';
  }

  if (Object.keys(errors).length) return fail(errors);
  return ok({
    title: trimmed,
    description: trimmedDescription,
    notifyOnSignup: Boolean(notifyOnSignup),
    allowMultiuserSignups: Boolean(allowMultiuserSignups),
    reminderLeadTime: lead,
    timezone: zone,
  });
}

// --- activity --------------------------------------------------------------

export function validateActivity({ label, description, volunteerCap, slotCapDefault }) {
  const errors = {};
  const trimmed = String(label ?? '').trim();
  if (trimmed === '') errors.label = 'The label for your activity cannot be blank.';
  else {
    const tooLong = lengthError(trimmed, 'label for your activity');
    if (tooLong) errors.label = tooLong;
  }

  const trimmedDescription = String(description ?? '').trim();
  const descriptionTooLong = lengthError(trimmedDescription, 'description');
  if (descriptionTooLong) errors.description = descriptionTooLong;

  const cap = Number(volunteerCap ?? 0);
  const def = Number(slotCapDefault ?? 0);

  const capMsg = capError(cap, 'activity volunteer cap');
  if (capMsg) errors.volunteerCap = capMsg;

  const defMsg = capError(def, 'default slot volunteer cap');
  if (defMsg) errors.slotCapDefault = defMsg;

  if (Object.keys(errors).length) return fail(errors);
  return ok({
    label: trimmed,
    description: trimmedDescription,
    volunteerCap: cap,
    slotCapDefault: def,
  });
}

// --- window ----------------------------------------------------------------

export function validateWindow({ begin, end }) {
  if (!begin || !end) {
    return fail({ range: 'Please specify the entire window range.' });
  }
  // The legacy had no ordering check; the server rejects begin > end (as a 500,
  // because the EndpointException omits a status code), so catch it here.
  if (begin.getTime() > end.getTime()) {
    return fail({ range: 'The window has to end after it begins.' });
  }
  return ok({ begin, end });
}

// --- slot ------------------------------------------------------------------

export function validateSlot({ enabled, unlimited = false, cap }) {
  // The cap only matters when the slot is enabled.
  if (!enabled) return ok({ enabled: false, cap: 0 });
  // "Unlimited" is the organizer saying so; the server spells it 0.
  if (unlimited) return ok({ enabled: true, cap: 0 });

  // With the switch off, 0 is not a policy — it is an empty or mistyped box.
  // Reading it as "unlimited" silently granted the opposite of what was asked
  // for, and clearing the field was enough to do it.
  const n = Number(cap ?? 0);
  if (!Number.isInteger(n) || n < CAP_MIN || n > CAP_MAX) {
    return fail({ cap: `The volunteer cap needs to be a number between ${CAP_MIN} and ${CAP_MAX}.` });
  }
  return ok({ enabled: true, cap: n });
}

// --- detail (custom field) -------------------------------------------------

export function validateDetail({ type, label, hint, required }) {
  const errors = {};
  if (!isKnownType(type)) errors.type = 'Please make sure to select a detail type.';

  const trimmed = String(label ?? '').trim();
  if (trimmed === '') errors.label = "The field label can't be empty.";
  else {
    const tooLong = lengthError(trimmed, 'field label');
    if (tooLong) errors.label = tooLong;
  }

  const trimmedHint = String(hint ?? '').trim();
  const hintTooLong = lengthError(trimmedHint, 'description');
  if (hintTooLong) errors.hint = hintTooLong;

  if (Object.keys(errors).length) return fail(errors);
  return ok({
    type,
    label: trimmed,
    hint: trimmedHint,
    required: Boolean(required),
  });
}

// --- volunteer -------------------------------------------------------------

/**
 * @param {object}   input
 * @param {string}   input.name
 * @param {Map|object} input.values  detail key -> raw value
 * @param {boolean}  [input.remindersEnabled]
 * @param {string}   [input.reminderEmail]
 * @param {Array}    details         the event's details, each {key, type, required}
 * @param {object}   [ctx]
 * @param {string|null} [ctx.accountEmail] address the server would fall back to
 */
export function validateVolunteer(
  { name, values, remindersEnabled = false, reminderEmail = '' },
  details = [],
  { accountEmail = null } = {},
) {
  const errors = {};
  const read = (key) => (values instanceof Map ? values.get(key) : values?.[key]);

  const trimmedName = String(name ?? '').trim();
  if (trimmedName === '') errors.name = 'Please provide a name.';
  else {
    const tooLong = lengthError(trimmedName, 'name');
    if (tooLong) errors.name = tooLong;
  }

  const serialized = [];

  for (const detail of details) {
    const spec = DETAIL_TYPES[detail.type];
    // An unrecognized type produced no input at all in the legacy, which then
    // threw inside the required sweep and returned null with no toast — a
    // silently unsubmittable form. Skip it instead.
    if (!spec) continue;

    const raw = read(detail.key);
    const blank = spec.isBlank(raw);

    if (blank) {
      if (detail.required) errors[detail.key] = 'This field is required.';
      // Blank optional values are omitted entirely — the server rejects a value
      // that fails the type pattern, and '' fails most of them.
      continue;
    }

    const value = spec.serialize(raw);
    if (spec.pattern && !spec.pattern.test(value)) {
      errors[detail.key] = spec.message;
      continue;
    }
    // `yasss_volunteer_detail.detail_value` is VARCHAR(255) and the endpoint
    // does not check the length, so an over-long answer reaches the insert and
    // comes back as a 500 — on the one endpoint an anonymous volunteer uses.
    const tooLong = lengthError(value, 'answer');
    if (tooLong) {
      errors[detail.key] = tooLong;
      continue;
    }
    serialized.push({ detailKey: detail.key, value });
  }

  // Opting in needs an address the server will accept. Leaving it blank is only
  // valid when the server has one to fall back to -- otherwise it answers 400
  // and the volunteer sees a failure with no field to blame.
  const trimmedEmail = String(reminderEmail ?? '').trim().toLowerCase();
  if (remindersEnabled) {
    if (trimmedEmail === '') {
      if (!accountEmail) errors.reminderEmail = 'Please provide an email address.';
    } else if (!DETAIL_TYPES.EMAIL.pattern.test(trimmedEmail)) {
      errors.reminderEmail = DETAIL_TYPES.EMAIL.message;
    } else {
      const tooLong = lengthError(trimmedEmail, 'email address');
      if (tooLong) errors.reminderEmail = tooLong;
    }
  }

  if (Object.keys(errors).length) return fail(errors);
  return ok({ name: trimmedName, details: serialized, reminderEmail: trimmedEmail });
}

// --- account credentials ---------------------------------------------------

/**
 * The message for a password that is too short.
 *
 * The minimum is an operator's setting rather than a constant — see
 * `policy.js`, and note that the server cannot enforce it because the password
 * never leaves the browser.
 */
function passwordLengthError(password) {
  const min = getPasswordMinLength();
  return password.length < min
    ? `Your password needs to be at least ${min} characters.`
    : null;
}

/**
 * Bounds an account email the way every other text field is bounded.
 *
 * The column is `VARCHAR(255)` and the server refuses anything longer, so
 * without this a 300-character address was accepted here and came back as an
 * opaque toast with no field attached to it.
 */
function accountEmailError(trimmed) {
  if (!patterns.ACCOUNT_EMAIL.test(trimmed)) return 'Please specify a valid email address.';
  return lengthError(trimmed, 'email address');
}

export function validateLogin({ email, password }) {
  const errors = {};
  const trimmed = String(email ?? '').trim().toLowerCase();
  const emailError = accountEmailError(trimmed);
  if (emailError) errors.email = emailError;
  // Deliberately no minimum length here. This is the only account flow that
  // checks a password rather than sets one, and an account created before the
  // policy existed — or under a lower one — must still be able to log in.
  // Applying it here would lock people out of their own accounts.
  if (String(password ?? '').length === 0) {
    errors.password = 'Please enter your password.';
  }
  if (Object.keys(errors).length) return fail(errors);
  return ok({ email: trimmed, password });
}

export function validateRegistration({ email, password, confirmPassword }) {
  const errors = {};
  const trimmed = String(email ?? '').trim().toLowerCase();
  const emailError = accountEmailError(trimmed);
  if (emailError) errors.email = emailError;
  const tooShort = passwordLengthError(String(password ?? ''));
  if (tooShort) {
    errors.password = tooShort;
  } else if (password !== confirmPassword) {
    errors.confirmPassword = 'Oops! You might have mistyped your password confirmation.';
  }
  if (Object.keys(errors).length) return fail(errors);
  return ok({ email: trimmed, password });
}

/** Both fields are optional; an empty form is a no-op rather than an error. */
export function validateProfileUpdate({ email, password, confirmPassword }) {
  const errors = {};
  const trimmed = String(email ?? '').trim().toLowerCase();

  if (trimmed !== '') {
    const emailError = accountEmailError(trimmed);
    if (emailError) errors.email = emailError;
  }
  // Both fields are optional, so the minimum applies only once something has
  // been typed — leaving the box empty means "keep the password I have".
  if (String(password ?? '').length > 0) {
    const tooShort = passwordLengthError(String(password));
    if (tooShort) errors.password = tooShort;
    else if (password !== confirmPassword) {
      errors.confirmPassword = 'Oops! You might have mistyped your password confirmation.';
    }
  }
  if (Object.keys(errors).length) return fail(errors);

  return ok({
    email: trimmed === '' ? null : trimmed,
    password: String(password ?? '').length > 0 ? password : null,
  });
}

export function validatePasswordReset({ password, confirmPassword }) {
  const errors = {};
  const tooShort = passwordLengthError(String(password ?? ''));
  if (tooShort) {
    errors.password = tooShort;
  } else if (password !== confirmPassword) {
    errors.confirmPassword = 'Oops! You might have mistyped your password confirmation.';
  }
  if (Object.keys(errors).length) return fail(errors);
  return ok({ password });
}
