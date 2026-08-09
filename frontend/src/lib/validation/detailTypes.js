/**
 * The five custom-field types, in one registry.
 *
 * Replaces the legacy's parallel switch statements — one in renderFieldTable
 * for display labels (app.js:343), one in renderVolEditModal for input markup
 * (app.js:745-830), and one in validateVolEditModal for validation
 * (app.js:1070-1155) — which is why a type could be handled in one and silently
 * skipped in another (behavior §6.19).
 */
import * as patterns from './patterns.js';

/**
 * @typedef {object} DetailType
 * @property {string}  label     display label, e.g. in the custom-fields table
 * @property {'text'|'number'|'switch'} input
 * @property {RegExp|null} pattern
 * @property {string}  message   shown when `pattern` fails
 * @property {(raw: unknown) => string} serialize  value as the API expects it
 * @property {(raw: unknown) => boolean} isBlank   drives the required check
 * @property {(raw: unknown) => boolean} [isOmittable]  whether to leave the
 *   answer out of the payload entirely; defaults to `isBlank`
 */

/** @type {Record<string, DetailType>} */
export const DETAIL_TYPES = {
  STRING: {
    label: 'Text',
    input: 'text',
    pattern: null,
    message: '',
    serialize: (v) => String(v ?? '').trim(),
    isBlank: (v) => String(v ?? '').trim() === '',
  },
  BOOLEAN: {
    label: 'True/False',
    input: 'switch',
    pattern: patterns.BOOLEAN,
    message: 'This needs to be true or false.',
    serialize: (v) => (v ? 'true' : 'false'),
    // A checkbox always has a value, so "required" was unenforceable in the
    // legacy: it compared against '' and a boolean never equals ''. Required
    // now means "must be ticked", which is what the server enforces when the
    // detail is absent from the payload (behavior §6.19).
    isBlank: (v) => v !== true,
    // ...but "not ticked" is a real answer, not an absent one. Serialization
    // used isBlank too, so an OPTIONAL checkbox answered `false` was dropped
    // and an explicit "no" became indistinguishable from "never answered" in
    // the organizer's data. A boolean is never omittable.
    isOmittable: () => false,
  },
  INTEGER: {
    label: 'Whole Number',
    input: 'number',
    pattern: patterns.INTEGER,
    message: 'This needs to be a number.',
    serialize: (v) => String(v ?? '').trim(),
    isBlank: (v) => String(v ?? '').trim() === '',
  },
  EMAIL: {
    label: 'Email Address',
    input: 'text',
    pattern: patterns.EMAIL,
    message: 'This needs to be an email address.',
    // lowercased to match the server's case-sensitive pattern
    serialize: (v) => String(v ?? '').trim().toLowerCase(),
    isBlank: (v) => String(v ?? '').trim() === '',
  },
  PHONE: {
    label: 'Phone Number',
    input: 'text',
    pattern: patterns.PHONE,
    message: 'This needs to be a phone number.',
    serialize: (v) => String(v ?? '').trim(),
    isBlank: (v) => String(v ?? '').trim() === '',
  },
};

export const DETAIL_TYPE_IDS = Object.keys(DETAIL_TYPES);

/** Unknown types render as INVALID rather than throwing, as the legacy did. */
export const typeLabel = (id) => DETAIL_TYPES[id]?.label ?? 'INVALID';

export const isKnownType = (id) => Object.hasOwn(DETAIL_TYPES, id);

/** Options for the type `<select>`, in the legacy's order. */
export const DETAIL_TYPE_OPTIONS = DETAIL_TYPE_IDS.map((id) => ({
  value: id,
  label: DETAIL_TYPES[id].label,
}));
