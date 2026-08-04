/**
 * Toast notifications, with the legacy's defaults (app.js:3204):
 * five seconds, top-center, click to dismiss, no animation.
 */
import { toast as bulmaToast } from 'bulma-toast';

const DEFAULTS = {
  duration: 5000,
  position: 'top-center',
  closeOnClick: true,
  dismissible: false,
  pauseOnHover: false,
};

const show = (message, type) => bulmaToast({ ...DEFAULTS, message, type });

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
