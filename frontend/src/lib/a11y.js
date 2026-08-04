/**
 * ARIA plumbing that the components cannot do for themselves.
 */

/**
 * Ties an input to the error text `Field` renders beneath it.
 *
 * `Field` owns the label and the message but not the input — that arrives as a
 * snippet from whichever modal is using it — so the association has to be made
 * where the input is written. Spread the result onto the input:
 *
 *     <input id="event-title" {...fieldAria('event-title', errors.title)} />
 *
 * Both attributes are `undefined` when there is no error, which Svelte omits
 * entirely rather than rendering as empty strings. That matters: an
 * `aria-describedby` pointing at an element that is not in the DOM is worse
 * than no `aria-describedby` at all, and `aria-invalid="false"` on every field
 * on the page is noise a screen reader has to read past.
 *
 * @param {string} id the input's id; `Field` renders its message as `${id}-error`
 * @param {string|null|undefined} error the current error, if any
 */
export const fieldAria = (id, error) => ({
  'aria-invalid': error ? 'true' : undefined,
  'aria-describedby': error ? `${id}-error` : undefined,
});
