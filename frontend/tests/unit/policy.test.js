import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PASSWORD_MIN_LENGTH,
  getPasswordMinLength,
  resetPolicy,
  setPasswordMinLength,
} from '../../src/lib/validation/policy.js';
import { validateRegistration } from '../../src/lib/validation/forms.js';

afterEach(resetPolicy);

/**
 * The password minimum is an operator's setting, published by `GET /v1`.
 *
 * It cannot be a server-side check: the password never leaves the browser, only
 * an Ed25519 public key derived from it. So this is a policy the server states
 * and the client applies, and these tests are about the plumbing between the
 * two rather than about any security boundary.
 */
describe('password policy', () => {
  it('starts at the built-in default', () => {
    expect(getPasswordMinLength()).toBe(DEFAULT_PASSWORD_MIN_LENGTH);
  });

  it('adopts what the server reported', () => {
    setPasswordMinLength(12);
    expect(getPasswordMinLength()).toBe(12);
  });

  /**
   * An older server does not report the key at all, and a garbled one should
   * not be able to switch the rule off. Either way the default stands.
   */
  it.each([undefined, null, '', 0, -1, 'eight', 8.5, NaN])(
    'ignores %p and keeps the default',
    (bad) => {
      setPasswordMinLength(bad);
      expect(getPasswordMinLength()).toBe(DEFAULT_PASSWORD_MIN_LENGTH);
    },
  );

  it('accepts a numeric string, which is what JSON sometimes carries', () => {
    setPasswordMinLength('10');
    expect(getPasswordMinLength()).toBe(10);
  });

  /**
   * The assertion that actually proves the value is plumbed through rather than
   * hardcoded somewhere in the validator.
   */
  it('is what the registration validator enforces', () => {
    const eight = { email: 'a@b.co', password: 'hunter78', confirmPassword: 'hunter78' };
    expect(validateRegistration(eight).ok).toBe(true);

    setPasswordMinLength(12);
    expect(validateRegistration(eight).ok).toBe(false);
    expect(validateRegistration(eight).errors.password).toBe(
      'Your password needs to be at least 12 characters.',
    );

    setPasswordMinLength(4);
    expect(validateRegistration({ ...eight, password: 'abcd', confirmPassword: 'abcd' }).ok)
      .toBe(true);
  });
});
