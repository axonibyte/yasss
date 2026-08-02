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
 * Report a failed operation. Prefers the server's own message, which is
 * usually more specific than anything we would invent.
 */
export function toastError(error, fallback) {
  toastDanger(error?.info || error?.message || fallback);
}
