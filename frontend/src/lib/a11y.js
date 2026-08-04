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

/**
 * Put the first field that failed validation on screen, and in focus.
 *
 * Modal bodies scroll. The volunteer form in particular is as long as the event
 * has custom fields, and Save sits in a footer that is always visible — so
 * pressing it with an error near the top produced no visible change whatsoever.
 * The message was rendered, several hundred pixels above the fold, and the form
 * simply appeared not to work.
 *
 * Keyed off `aria-invalid`, which `fieldAria` already sets, so a field only
 * qualifies if it is properly associated with its message. Focusing rather than
 * only scrolling is what tells a screen reader user which field is wrong, since
 * moving focus reads the label, the value and the description together.
 *
 * Deferred a frame because the caller sets `errors` and the messages do not
 * exist until Svelte has flushed.
 */
export function focusFirstError() {
  if (typeof document === 'undefined') return;
  requestAnimationFrame(() => {
    const invalid = document.querySelector('.modal-card [aria-invalid="true"]');
    if (!(invalid instanceof HTMLElement)) return;
    // `block: 'center'` rather than the default `'start'`, so the label above
    // the field is visible too -- landing with the input flush against the top
    // edge hides the very thing that says what is wrong.
    //
    // Instant, not smooth. A smooth scroll is an animation, and this fires on
    // every rejected submission: correct one field, press Save, get glided to
    // the next one, and the form is moving under the cursor each time. It also
    // leaves the page in motion for as long as the animation lasts, which is
    // long enough for a click aimed at the newly-focused field to land
    // somewhere else.
    invalid.scrollIntoView({ block: 'center' });
    invalid.focus({ preventScroll: true });
  });
}
