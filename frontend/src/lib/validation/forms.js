/**
 * Form validators — pure, DOM-free, and therefore testable.
 *
 * The legacy validators read the DOM directly, mixed validation with toasting,
 * and signalled failure by returning `null` (sometimes silently, with no toast
 * at all — behavior §3.8). These take plain values and return a verdict; the
 * caller decides how to present it.
 *
 * Every rule mirrors a server-side check so the client fails fast with a
 * specific message instead of surfacing an opaque 400.
 * See docs/legacy/01-behavior.md §3 and 03-api-contract.md §3.
 */
import { DETAIL_TYPES, isKnownType } from './detailTypes.js';
import * as patterns from './patterns.js';

/** The server stores caps in TINYINT UNSIGNED and rejects outside this range. */
export const CAP_MIN = 1;
export const CAP_MAX = 255;

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

export function validateSummary({ title, description, notifyOnSignup, allowMultiuserSignups }) {
  const trimmed = String(title ?? '').trim();
  if (trimmed === '') {
    return fail({ title: 'The title of your event cannot be blank.' });
  }
  return ok({
    title: trimmed,
    description: String(description ?? '').trim(),
    notifyOnSignup: Boolean(notifyOnSignup),
    allowMultiuserSignups: Boolean(allowMultiuserSignups),
  });
}

// --- activity --------------------------------------------------------------

export function validateActivity({ label, description, volunteerCap, slotCapDefault }) {
  const errors = {};
  const trimmed = String(label ?? '').trim();
  if (trimmed === '') errors.label = 'The label for your activity cannot be blank.';

  const cap = Number(volunteerCap ?? 0);
  const def = Number(slotCapDefault ?? 0);

  const capMsg = capError(cap, 'activity volunteer cap');
  if (capMsg) errors.volunteerCap = capMsg;

  const defMsg = capError(def, 'default slot volunteer cap');
  if (defMsg) errors.slotCapDefault = defMsg;

  if (Object.keys(errors).length) return fail(errors);
  return ok({
    label: trimmed,
    description: String(description ?? '').trim(),
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

export function validateSlot({ enabled, cap }) {
  // The cap only matters when the slot is enabled.
  if (!enabled) return ok({ enabled: false, cap: 0 });

  const n = Number(cap ?? 0);
  const msg = capError(n, 'volunteer cap');
  if (msg) return fail({ cap: msg });
  return ok({ enabled: true, cap: n });
}

// --- detail (custom field) -------------------------------------------------

export function validateDetail({ type, label, hint, required }) {
  const errors = {};
  if (!isKnownType(type)) errors.type = 'Please make sure to select a detail type.';

  const trimmed = String(label ?? '').trim();
  if (trimmed === '') errors.label = "The field label can't be empty.";

  if (Object.keys(errors).length) return fail(errors);
  return ok({
    type,
    label: trimmed,
    hint: String(hint ?? '').trim(),
    required: Boolean(required),
  });
}

// --- volunteer -------------------------------------------------------------

/**
 * @param {object}   input
 * @param {string}   input.name
 * @param {Map|object} input.values  detail key -> raw value
 * @param {Array}    details         the event's details, each {key, type, required}
 */
export function validateVolunteer({ name, values }, details = []) {
  const errors = {};
  const read = (key) => (values instanceof Map ? values.get(key) : values?.[key]);

  const trimmedName = String(name ?? '').trim();
  if (trimmedName === '') errors.name = 'Please provide a name.';

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
    serialized.push({ detailKey: detail.key, value });
  }

  if (Object.keys(errors).length) return fail(errors);
  return ok({ name: trimmedName, details: serialized });
}

// --- account credentials ---------------------------------------------------

export function validateLogin({ email, password }) {
  const errors = {};
  const trimmed = String(email ?? '').trim().toLowerCase();
  if (!patterns.ACCOUNT_EMAIL.test(trimmed)) {
    errors.email = 'Please specify a valid email address.';
  }
  if (String(password ?? '').length === 0) {
    errors.password = 'Please enter your password.';
  }
  if (Object.keys(errors).length) return fail(errors);
  return ok({ email: trimmed, password });
}

export function validateRegistration({ email, password, confirmPassword }) {
  const errors = {};
  const trimmed = String(email ?? '').trim().toLowerCase();
  if (!patterns.ACCOUNT_EMAIL.test(trimmed)) {
    errors.email = 'Please specify a valid email address.';
  }
  if (String(password ?? '').length === 0) {
    errors.password = 'Your password should be at least one character in length.';
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

  if (trimmed !== '' && !patterns.ACCOUNT_EMAIL.test(trimmed)) {
    errors.email = 'Please specify a valid email address.';
  }
  if (String(password ?? '').length > 0 && password !== confirmPassword) {
    errors.confirmPassword = 'Oops! You might have mistyped your password confirmation.';
  }
  if (Object.keys(errors).length) return fail(errors);

  return ok({
    email: trimmed === '' ? null : trimmed,
    password: String(password ?? '').length > 0 ? password : null,
  });
}

export function validatePasswordReset({ password, confirmPassword }) {
  const errors = {};
  if (String(password ?? '').length === 0) {
    errors.password = 'Your password should be at least one character in length.';
  } else if (password !== confirmPassword) {
    errors.confirmPassword = 'Oops! You might have mistyped your password confirmation.';
  }
  if (Object.keys(errors).length) return fail(errors);
  return ok({ password });
}
