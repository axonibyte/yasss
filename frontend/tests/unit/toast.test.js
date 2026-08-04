import { describe, expect, it, vi, beforeEach } from 'vitest';

// bulma-toast writes to the DOM and animates; only the message it is handed
// matters here, so it is replaced wholesale.
const shown = [];
vi.mock('bulma-toast', () => ({
  toast: (opts) => shown.push(opts),
}));

const {
  toastError, toastSuccess, toastDanger, toastWarning, toastInfo,
} = await import('../../src/state/toast.js');
const { ApiError } = await import('../../src/lib/api/errors.js');

beforeEach(() => {
  shown.length = 0;
});

/**
 * Which message a failed operation reports.
 *
 * This used to prefer `error.message` over the caller's fallback, which meant
 * the one failure mode where there is no server message — the network being
 * gone — was reported to the user in the browser's own words. "Failed to fetch"
 * says nothing about what failed or what to do, and it differs per engine, so
 * it was also untestable copy.
 */
describe('toastError', () => {
  it('prefers the server’s own message, which is the specific one', () => {
    toastError(new ApiError('That event has already been published.', 409, {}), 'fallback');
    expect(shown.at(-1).message).toBe('That event has already been published.');
  });

  it('uses the caller’s fallback for a network failure rather than the browser’s wording', () => {
    // What `fetch` rejects with when the network is unreachable.
    toastError(new TypeError('Failed to fetch'), "Couldn't update your event... sorry.");
    expect(shown.at(-1).message).toBe("Couldn't update your event... sorry.");
    expect(shown.at(-1).message).not.toMatch(/failed to fetch/i);
  });

  it('never shows an empty toast', () => {
    toastError(undefined, undefined);
    expect(shown.at(-1).message).toBeTruthy();
  });

  it('reports as a danger toast', () => {
    toastError(new TypeError('Failed to fetch'), 'nope');
    expect(shown.at(-1).type).toBe('is-danger');
  });
});

/**
 * How long a toast stays, and whether anyone is told about it.
 *
 * Toasts are the only channel this app has for reporting a server error, which
 * makes both of these load-bearing rather than cosmetic. Five seconds is fine
 * for "Logged in!" and much too short for a sentence explaining why a save was
 * refused — and once it has gone there is no way to get it back.
 */
describe('duration and dismissal', () => {
  it('gives failures twice as long as confirmations', () => {
    toastSuccess('saved');
    const success = shown.at(-1).duration;
    toastDanger('nope');
    const failure = shown.at(-1).duration;

    expect(failure).toBeGreaterThan(success);
    expect(success).toBe(5000);
    expect(failure).toBe(10_000);
  });

  it('treats a warning as a failure, since it is also unexpected news', () => {
    toastWarning('careful');
    expect(shown.at(-1).duration).toBe(10_000);
  });

  it('lets the pointer hold a failure open, and does not for a success', () => {
    toastDanger('nope');
    expect(shown.at(-1).pauseOnHover).toBe(true);
    // A success toast pinned under the cursor is just something in the way.
    toastSuccess('saved');
    expect(shown.at(-1).pauseOnHover).toBe(false);
  });
});

describe('announcement', () => {
  // bulma-toast sets no ARIA whatsoever, so a screen reader user got no
  // indication that anything had happened at all: the message appeared, sat
  // there for five seconds, and vanished again in silence.

  it('appends into a live region', () => {
    toastSuccess('saved');
    const region = shown.at(-1).appendTo;
    expect(region).toBeInstanceOf(HTMLElement);
    expect(region.getAttribute('aria-live')).toBeTruthy();
    // The whole message, not just whatever changed within it.
    expect(region.getAttribute('aria-atomic')).toBe('true');
  });

  it('interrupts for a failure and waits its turn for a success', () => {
    // The distinction is real: `assertive` cuts across whatever is being read,
    // which is right for "that didn't save" and rude for "logged in".
    toastDanger('nope');
    expect(shown.at(-1).appendTo.getAttribute('aria-live')).toBe('assertive');

    toastInfo('by the way');
    expect(shown.at(-1).appendTo.getAttribute('aria-live')).toBe('polite');
  });

  it('reuses the same regions rather than making one per toast', () => {
    // bulma-toast removes its own container when the last toast in it goes. If
    // the live region went with it, announcements would stop working after the
    // first one -- and a live region has to be in the document before content
    // lands in it to be announced at all.
    toastSuccess('one');
    const first = shown.at(-1).appendTo;
    toastSuccess('two');
    expect(shown.at(-1).appendTo).toBe(first);
    expect(document.body.contains(first)).toBe(true);
  });
});
