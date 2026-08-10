/**
 * Query-parameter routing — docs/legacy/03-api-contract.md §5.
 *
 * These entry points are hardcoded into server-sent email templates, so their
 * shape is a contract, not an implementation detail.
 */
import { describe, it, expect } from 'vitest';
import { parseRoute } from '../../src/state/route.svelte.js';

describe('parseRoute', () => {
  it('reads a poll id, and keeps it separate from an event id', () => {
    expect(parseRoute('?poll=p-1').pollId).toBe('p-1');
    expect(parseRoute('?poll=p-1').eventId).toBeNull();
    // Two parameters rather than one that carries either kind: mail templates
    // hardcode `?event=`, and one parameter would make every link ambiguous
    // until the app had asked the server what it was holding.
    expect(parseRoute('?event=e-1').pollId).toBeNull();
  });

  it('reads an event id', () => {
    expect(parseRoute('?event=abc-123').eventId).toBe('abc-123');
  });

  it('reads the share flag as presence, not value', () => {
    expect(parseRoute('?event=a&share').share).toBe(true);
    expect(parseRoute('?event=a').share).toBe(false);
  });

  it('reads the verify-user link the welcome email sends', () => {
    const r = parseRoute('?action=verify-user&user=u1&token=t1');
    expect(r).toMatchObject({ action: 'verify-user', user: 'u1', token: 't1' });
  });

  it('restores + characters that email clients turn into spaces', () => {
    // The signed token is base64 and travels through mail clients that decode
    // '+' to ' '; the legacy re-encoded it the same way (app.js:2752).
    expect(parseRoute('?action=reset-user&user=u&token=a b+c').token).toBe('a+b+c');
  });

  it('reads the payment round-trip actions', () => {
    expect(parseRoute('?action=payment-success').action).toBe('payment-success');
    expect(parseRoute('?action=payment-canceled').action).toBe('payment-canceled');
  });

  it('yields nulls for a bare URL', () => {
    expect(parseRoute('')).toEqual({
      eventId: null, pollId: null, action: null, user: null, volunteer: null, token: null,
      share: false, tutorial: null,
    });
  });

  describe('the tutorial parameter', () => {
    it('reads a named track', () => {
      expect(parseRoute('?tutorial=organizer').tutorial).toBe('organizer');
      expect(parseRoute('?tutorial=volunteer').tutorial).toBe('volunteer');
    });

    it('distinguishes a bare ?tutorial from an absent one', () => {
      // `''` opens the chooser and `null` does nothing at all, so these cannot
      // collapse into one falsy value -- which is what `params.get` alone
      // returns for both.
      expect(parseRoute('?tutorial').tutorial).toBe('');
      expect(parseRoute('?tutorial=').tutorial).toBe('');
      expect(parseRoute('?event=abc').tutorial).toBeNull();
    });

    it('passes an unrecognized track through for the caller to reject', () => {
      // Validated where it is used rather than here: `parse` reports the URL,
      // and deciding that 'nonsense' means "ask which track" is App's business.
      expect(parseRoute('?tutorial=nonsense').tutorial).toBe('nonsense');
    });
  });
});
