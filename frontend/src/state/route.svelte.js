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

/**
 * @typedef {'verify-user'|'reset-user'|'confirm-reminders'|'unsubscribe-reminders'
 *   |'terms'|'privacy'|'payment-success'|'payment-canceled'} Action
 */

function parse(search = window.location.search) {
  const params = new URLSearchParams(search);
  return {
    eventId: params.get('event'),
    // A second parameter rather than an overload of `event`. Server-sent mail
    // templates hardcode `?event=`, and one parameter carrying either kind
    // would make a poll link indistinguishable from an event link at parse
    // time -- so opening any link would need a resolver round trip before the
    // app knew what it was looking at.
    pollId: params.get('poll'),
    action: /** @type {Action|null} */ (params.get('action')),
    user: params.get('user'),
    // Reminder links identify a volunteer rather than an account -- an
    // anonymous signup has no account to identify.
    volunteer: params.get('volunteer'),
    // The legacy re-encoded spaces to '+' because the signed token travels
    // through email clients that mangle it (app.js:2752).
    token: params.get('token')?.replace(/ /g, '+') ?? null,
    share: params.has('share'),
    // `?tutorial`, or `?tutorial=<track>` for any of the four. The bare form
    // opens the chooser. Linkable on purpose: it is the only entry point that
    // can be *sent* to somebody, and the people who most need the participant
    // tracks arrive from a shared link and never see the landing page the other
    // entry points live on.
    //
    // Not validated here. `parseRoute` reports the URL and App decides what a
    // name means -- including resolving one that has since been folded into
    // another track.
    tutorial: params.has('tutorial') ? (params.get('tutorial') || '') : null,
  };
}

class Route {
  eventId = $state(null);
  pollId = $state(null);
  action = $state(null);
  user = $state(null);
  volunteer = $state(null);
  token = $state(null);
  share = $state(false);
  tutorial = $state(null);

  constructor() {
    Object.assign(this, parse());
  }

  /** Drop a consumed one-shot action so it cannot fire twice. */
  clearAction() {
    this.action = null;
    this.user = null;
    this.volunteer = null;
    this.token = null;
  }

  clearShare() {
    this.share = false;
  }

  /**
   * Drop a consumed tutorial request, and take it out of the address bar.
   *
   * Left in the URL it would restart the tour on every reload, and -- worse --
   * exiting the tutorial navigates home, which would put the visitor straight
   * back into it.
   */
  clearTutorial() {
    this.tutorial = null;
    const url = new URL(window.location.href);
    url.searchParams.delete('tutorial');
    window.history.replaceState({}, '', url);
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
    // Cleared, not merely left: the two are mutually exclusive, and a stale
    // poll id would keep the poll view on screen against an address naming an
    // event -- the same class of bug `listen` exists to prevent.
    this.pollId = null;
    this.share = share;
  }

  /** Canonical link to a poll, as used by share. */
  pollUrl(pollId) {
    return `${window.location.origin}?poll=${pollId}`;
  }

  /** Navigate to a poll without a full reload. */
  goToPoll(pollId, { share = false } = {}) {
    const url = `${this.pollUrl(pollId)}${share ? '&share' : ''}`;
    window.history.pushState({}, '', url);
    this.eventId = null;
    this.pollId = pollId;
    this.share = share;
  }

  goHome() {
    window.history.pushState({}, '', window.location.origin);
    this.eventId = null;
    this.pollId = null;
    this.share = false;
  }

  /**
   * Re-read the URL when the browser navigates within our own history.
   *
   * `parse()` ran once, at module load, which was right while every navigation
   * was a full page load. It stopped being right when `goToEvent` and `goHome`
   * started pushing entries: pressing Back after publishing rewound the URL and
   * the app did not notice, so the event view stayed on screen against an
   * address that no longer named it — and a reload or a shared link then showed
   * something else entirely.
   *
   * A registered callback rather than an effect on `eventId`. An effect would
   * also fire on our own `goToEvent`, which the caller already follows with its
   * own load, so every navigation would fetch twice; and an async effect that
   * writes state it also reads is where re-entrancy loops come from. This fires
   * only on genuine browser navigation and cannot loop.
   *
   * @param {(previousEventId: string|null, previousPollId: string|null) => void} onNavigate
   */
  listen(onNavigate) {
    window.addEventListener('popstate', () => {
      const previousEvent = this.eventId;
      const previousPoll = this.pollId;
      Object.assign(this, parse());
      onNavigate?.(previousEvent, previousPoll);
    });
  }
}

export const route = new Route();
export { parse as parseRoute };
