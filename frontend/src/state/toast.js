/**
 * Toast notifications, with the legacy's look (app.js:3204): top-center, click
 * to dismiss, no animation.
 *
 * Two things changed from the legacy's defaults, both because toasts are the
 * *only* channel this app has for reporting a server error.
 *
 *   - Failures last twice as long and pause while the pointer is over them.
 *     Five seconds is fine for "Logged in!" and much too short for a sentence
 *     explaining why a save was refused — especially since some of them quote
 *     the server and can run long. If it vanishes before it is read there is no
 *     way to get it back.
 *   - Everything is announced. `bulma-toast` sets no ARIA at all, so a screen
 *     reader user got no indication that anything had happened: the message
 *     appeared, sat there, and disappeared again in silence. Toasts are
 *     appended into a live region so they are read out.
 */
import { toast as bulmaToast } from 'bulma-toast';

const DEFAULTS = {
  position: 'top-center',
  closeOnClick: true,
  dismissible: false,
};

/** Confirmations, which the user already knows about. */
const TRANSIENT_MS = 5000;

/** Failures, which they do not, and may need to read twice. */
const FAILURE_MS = 10_000;

/**
 * The live regions toasts are announced through, created once and left in place.
 *
 * Two of them, because the distinction is real: `assertive` interrupts whatever
 * is being read, which is right for "that didn't save" and rude for "logged
 * in". `bulma-toast` builds its own container inside whichever of these it is
 * pointed at, and removes that container when the last toast goes — so the
 * region itself has to outlive it, or announcements stop working after the
 * first one. A live region also has to be in the document *before* content
 * lands in it, which is the other reason these are not created on demand.
 */
let regions = null;

function ensureRegions() {
  if (regions || typeof document === 'undefined') return regions;

  const make = (live) => {
    const el = document.createElement('div');
    el.setAttribute('aria-live', live);
    // Read the whole message, not just the part that changed.
    el.setAttribute('aria-atomic', 'true');
    // The container bulma-toast creates inside is `position: fixed`, so this
    // wrapper never affects layout; it exists only to carry the ARIA.
    document.body.appendChild(el);
    return el;
  };

  regions = { polite: make('polite'), assertive: make('assertive') };
  return regions;
}

const FAILURE_TYPES = new Set(['is-danger', 'is-warning']);

function show(message, type) {
  const failure = FAILURE_TYPES.has(type);
  const region = ensureRegions();

  bulmaToast({
    ...DEFAULTS,
    message,
    type,
    duration: failure ? FAILURE_MS : TRANSIENT_MS,
    // Only failures, and only because they are the ones worth re-reading.
    // Pausing a success toast on hover just leaves it in the way.
    pauseOnHover: failure,
    ...(region ? { appendTo: failure ? region.assertive : region.polite } : {}),
  });
}

export const toastSuccess = (message) => show(message, 'is-success');
export const toastDanger = (message) => show(message, 'is-danger');
export const toastWarning = (message) => show(message, 'is-warning');
export const toastInfo = (message) => show(message, 'is-info');

/**
 * Report a failed operation.
 *
 * Only `info` is consulted, because only `info` is a message anybody wrote for
 * a user to read: `ApiError` always carries one, synthesised by the client if
 * the server did not supply it. `.message` used to be preferred over the
 * caller's fallback, which meant a network failure — a bare `TypeError` — was
 * reported to the user in the browser's own words: "Failed to fetch" in
 * Chromium, "NetworkError when attempting to fetch resource" in Firefox, "Load
 * failed" in WebKit. None of those say which operation failed or what to do
 * about it, and every caller's fallback does.
 */
export function toastError(error, fallback) {
  toastDanger(error?.info || fallback || 'Something went wrong. Sorry about that.');
}
