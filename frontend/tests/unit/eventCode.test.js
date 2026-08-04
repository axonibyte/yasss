import { describe, expect, it } from 'vitest';
import { CODE_LENGTH, formatCode, isCode, normalizeCode } from '../../src/lib/eventCode.js';

/**
 * The mirror of `EventCodeTest.java`.
 *
 * The corpus below is the same table, row for row. Two implementations of one
 * normalisation rule is a drift hazard, and the failure mode is nasty in both
 * directions: the client refusing a code the server would resolve, or accepting
 * one it then cannot find.
 */
const CORPUS = [
  // spelling,                  canonical
  ['ABCD-EFGH', 'ABCDEFGH'],
  ['ABCDEFGH', 'ABCDEFGH'],
  ['abcd-efgh', 'ABCDEFGH'],
  ['AbCd-EfGh', 'ABCDEFGH'],
  ['ABCD EFGH', 'ABCDEFGH'],
  ['  ABCD-EFGH  ', 'ABCDEFGH'],
  ['a.b.c.d.e.f.g.h', 'ABCDEFGH'],
  ['ABCD_EFGH', 'ABCDEFGH'],
  ['A-B-C-D-E-F-G-H', 'ABCDEFGH'],

  // The ambiguity folding, which is the point of the alphabet.
  ['O0O0-1111', '00001111'],
  ['o0o0-illi', '00001111'],
  ['I1I1-L1L1', '11111111'],
  ['0OoO-1IiL', '00001111'],

  // Not codes.
  ['', null],
  ['ABCDEFG', null],
  ['ABCDEFGHJ', null],
  ['ABCDEFGU', null],
  ['--------', null],
  ['f81d4fae-7dec-11d0-a765-00a0c91e6bf6', null],
];

describe('event code normalisation', () => {
  it.each(CORPUS)('normalises %j', (spelling, canonical) => {
    expect(normalizeCode(spelling)).toBe(canonical);
  });

  it('agrees with isCode', () => {
    for (const [spelling, canonical] of CORPUS) {
      expect(isCode(spelling)).toBe(canonical !== null);
    }
  });

  it('rejects anything that is not a string', () => {
    for (const bad of [null, undefined, 12345678, {}, [], true]) {
      expect(normalizeCode(bad)).toBeNull();
    }
  });

  /**
   * U is in neither the alphabet nor the ambiguity table, so it is dropped like
   * any other stray and the result comes up short — which fails rather than
   * silently resolving to a different event.
   */
  it('treats a stray U as invalid rather than as something else', () => {
    expect(normalizeCode('ABCDEFGU')).toBeNull();
    expect(normalizeCode('ABCDEFGH')).not.toBe(normalizeCode('ABCDEFGU'));
  });

  it('formats with a hyphen, idempotently', () => {
    expect(formatCode('ABCDEFGH')).toBe('ABCD-EFGH');
    expect(formatCode('ABCD-EFGH')).toBe('ABCD-EFGH');
    expect(formatCode('abcd efgh')).toBe('ABCD-EFGH');
    expect(formatCode('nope')).toBeNull();
  });

  it('is eight symbols', () => {
    expect(CODE_LENGTH).toBe(8);
    expect(normalizeCode('ABCD-EFGH')).toHaveLength(CODE_LENGTH);
  });
});
