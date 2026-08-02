/**
 * Query-parameter routing — docs/legacy/03-api-contract.md §5.
 *
 * These entry points are hardcoded into server-sent email templates, so their
 * shape is a contract, not an implementation detail.
 */
import { describe, it, expect } from 'vitest';
import { parseRoute } from '../../src/state/route.svelte.js';

describe('parseRoute', () => {
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
      eventId: null, action: null, user: null, token: null, share: false,
    });
  });
});
