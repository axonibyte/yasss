/**
 * The two halves of "apply to", and why only one of them is a list.
 */
import { describe, it, expect } from 'vitest';
import { ALL, applyToNow, windowPayload } from '../../src/lib/poll/applyTo.js';

const options = [{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }];

describe('applyToNow', () => {
  it('means every column', () => {
    expect(applyToNow({ mode: ALL, options })).toEqual(['o1', 'o2', 'o3']);
  });

  it('keeps only the columns that were picked, in grid order', () => {
    expect(applyToNow({ mode: 'some', options, selected: ['o3', 'o1'] })).toEqual(['o1', 'o3']);
  });

  it('ignores a column that is not on this poll', () => {
    expect(applyToNow({ mode: 'some', options, selected: ['nope'] })).toEqual([]);
  });

  it('skips columns the server has not seen yet', () => {
    expect(applyToNow({ mode: ALL, options: [{ id: null }, { id: 'o1' }] })).toEqual(['o1']);
  });
});

describe('windowPayload', () => {
  it('says nothing about columns when it wants all of them', () => {
    // The server reads absence as "all". Sending the list instead would work
    // today and would freeze the answer at the moment it was sent.
    const body = windowPayload({ startTime: '09:00', mode: ALL, options });
    expect(body).toEqual({ startTime: '09:00', appliesToNewOptions: false });
  });

  it('sends an empty list rather than nothing when nothing was picked', () => {
    // A row offered on no column is a legitimate half-built state, and reading
    // it as "all" would be the surprising answer.
    const body = windowPayload({ startTime: '09:00', mode: 'some', options, selected: [] });
    expect(body.applyTo).toEqual([]);
  });

  it('carries the standing rule separately from the list', () => {
    const body = windowPayload({
      startTime: '09:00',
      mode: 'some',
      options,
      selected: ['o1'],
      future: true,
    });
    // The list is resolved now; the flag is the thing that reaches forward to
    // columns that do not exist yet, and it is not a list of anything.
    expect(body.applyTo).toEqual(['o1']);
    expect(body.appliesToNewOptions).toBe(true);
  });
});
