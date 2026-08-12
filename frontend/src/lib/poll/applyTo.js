/**
 * The "apply to" control, and the difference between its two halves.
 *
 * An organizer adding a row chooses which columns it is offered on. That choice
 * has two parts and they behave differently, which is the whole of this file:
 *
 * - the columns picked now, which is a list resolved immediately;
 * - "and every day I add later", which is not a list at all. It is a standing
 *   rule stored on the row, and the server applies it when a column is added.
 *   A one-time expansion cannot do that job, because the columns it would have
 *   to cover do not exist yet.
 *
 * Keeping them separate here means the payload says exactly what was meant,
 * rather than a set of ids that happens to be complete on the day it was sent.
 */

/** Every column, which is what "all" means and what saying nothing means. */
export const ALL = 'all';

/**
 * The column ids a new row should be offered on right now.
 *
 * @param {object} args
 * @param {string} args.mode `'all'` or `'some'`
 * @param {Array<{id: string|null}>} args.options the poll's columns
 * @param {Iterable<string>} [args.selected] the chosen column ids, when `'some'`
 * @returns {string[]} column ids
 */
export function applyToNow({ mode, options, selected = [] }) {
  if (mode === ALL) return options.map((o) => o.id).filter(Boolean);
  const wanted = new Set(selected);
  return options.map((o) => o.id).filter((id) => id && wanted.has(id));
}

/**
 * The body of an add-window request.
 *
 * `applyTo` is omitted when every column is wanted, because the server reads
 * absence as "all" -- and an explicitly empty array is honored as empty, which
 * is a legitimate half-built state and must not be confused with saying
 * nothing.
 *
 * @param {object} args
 * @param {string} args.startTime as `HH:mm`
 * @param {string} args.mode `'all'` or `'some'`
 * @param {Array<{id: string|null}>} args.options
 * @param {Iterable<string>} [args.selected]
 * @param {boolean} [args.future] the standing rule
 */
export function windowPayload({ startTime, mode, options, selected = [], future = false }) {
  const body = { startTime, appliesToNewOptions: Boolean(future) };
  if (mode !== ALL) body.applyTo = applyToNow({ mode, options, selected });
  return body;
}
