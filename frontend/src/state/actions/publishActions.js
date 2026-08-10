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
 * @returns {Promise<{ok: boolean, eventId?: string, redirect?: string, sandbox?: boolean}>}
 */
export async function publishEvent(event, { account = null, captcha = null } = {}) {
  // The tutorial's practice event reaches CREATE mode on the builder track, so
  // the Publish button is genuinely on screen for it. Every other write is
  // gated by `isRemote`, which is false for a draft anyway -- but publishing is
  // the one control whose whole job is to turn a draft into something real, so
  // it needs the sandbox clause of that rule stated separately. Kept here with
  // the rest of the write-gating rather than in the shell.
  if (event.sandbox) return { ok: false, sandbox: true };

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
