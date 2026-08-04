import { describe, expect, it, vi, beforeEach } from 'vitest';

// bulma-toast writes to the DOM and animates; only the message it is handed
// matters here, so it is replaced wholesale.
const shown = [];
vi.mock('bulma-toast', () => ({
  toast: (opts) => shown.push(opts),
}));

const { toastError } = await import('../../src/state/toast.js');
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
