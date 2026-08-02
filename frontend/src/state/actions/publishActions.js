/**
 * Publishing a wizard-built event.
 *
 * The whole graph goes in one `POST /v1/events`. On success the server may hand
 * back a Stripe checkout URL, in which case the browser is redirected there and
 * comes back via `?action=payment-success`.
 *
 * See docs/legacy/01-behavior.md §1.5.
 */
import * as api from '../../lib/api/index.js';
import { eventCreatePayload } from '../serialize/eventPayload.js';
import { toastError, toastSuccess } from '../toast.js';

/**
 * @returns {Promise<{ok: boolean, eventId?: string, redirect?: string}>}
 */
export async function publishEvent(event, { account = null, captcha = null } = {}) {
  const payload = eventCreatePayload(event, { account });

  try {
    const res = await api.createEvent(payload, captcha);
    toastSuccess('Successfully created your event!');
    return {
      ok: true,
      eventId: res.event?.id ?? null,
      redirect: res.paymentRedirect ?? null,
    };
  } catch (e) {
    toastError(e, "Couldn't create your event... sorry.");
    return { ok: false };
  }
}
