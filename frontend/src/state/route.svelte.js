/**
 * Query-parameter routing.
 *
 * The Java server registers no SPA fallback — Spark serves `/` and literal file
 * paths, and anything else hits its default 404 page. So `?event=<uuid>` is not
 * a stylistic choice; path routing would break on refresh and on every shared
 * link. Email templates hardcode the `?action=` forms too, so these entry
 * points must keep working regardless.
 *
 * Parsed synchronously at module load. The legacy assigned `urlParams` inside
 * loadSite, which ran only after a network round-trip, while the reCAPTCHA
 * onload callback that consumed it fired independently — so if reCAPTCHA won
 * the race, inbound verify-user and reset-user email links silently did nothing
 * (behavior §6.16).
 *
 * See docs/legacy/03-api-contract.md §5.
 */

/** @typedef {'verify-user'|'reset-user'|'terms'|'privacy'|'payment-success'|'payment-canceled'} Action */

function parse(search = window.location.search) {
  const params = new URLSearchParams(search);
  return {
    eventId: params.get('event'),
    action: /** @type {Action|null} */ (params.get('action')),
    user: params.get('user'),
    // The legacy re-encoded spaces to '+' because the signed token travels
    // through email clients that mangle it (app.js:2752).
    token: params.get('token')?.replace(/ /g, '+') ?? null,
    share: params.has('share'),
  };
}

class Route {
  eventId = $state(null);
  action = $state(null);
  user = $state(null);
  token = $state(null);
  share = $state(false);

  constructor() {
    Object.assign(this, parse());
  }

  /** Drop a consumed one-shot action so it cannot fire twice. */
  clearAction() {
    this.action = null;
    this.user = null;
    this.token = null;
  }

  clearShare() {
    this.share = false;
  }

  /** Canonical link to an event, as used by share and by server-sent emails. */
  eventUrl(eventId) {
    return `${window.location.origin}?event=${eventId}`;
  }

  /** Navigate to an event without a full reload. */
  goToEvent(eventId, { share = false } = {}) {
    const url = `${this.eventUrl(eventId)}${share ? '&share' : ''}`;
    window.history.pushState({}, '', url);
    this.eventId = eventId;
    this.share = share;
  }

  goHome() {
    window.history.pushState({}, '', window.location.origin);
    this.eventId = null;
    this.share = false;
  }
}

export const route = new Route();
export { parse as parseRoute };
