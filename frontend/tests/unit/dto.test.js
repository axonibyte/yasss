/**
 * Wire <-> domain mapping — the asymmetries in
 * docs/legacy/03-api-contract.md §2, plus two legacy PATCH-key bugs.
 */
import { describe, it, expect } from 'vitest';
import {
  windowFromEventRead, windowFromWrite, windowToApi,
  eventSummaryFromApi, eventSummaryToApi,
  activityFromApi, activityChangesToApi,
  detailFromApi, detailChangesToApi,
} from '../../src/lib/api/dto.js';

describe('window field-name asymmetry', () => {
  it('reads begin/end from GET /events/:id', () => {
    const w = windowFromEventRead({ id: 'w1', begin: 1700000000000, end: 1700003600000 });
    expect(w.begin).toBeInstanceOf(Date);
    expect(w.begin.getTime()).toBe(1700000000000);
    expect(w.end.getTime()).toBe(1700003600000);
  });

  it('reads beginTime/endTime from Add/Modify window responses', () => {
    const w = windowFromWrite({ id: 'w1', beginTime: 1700000000000, endTime: null });
    expect(w.begin.getTime()).toBe(1700000000000);
    expect(w.end).toBeNull();
  });

  it('round-trips through the two different read shapes identically', () => {
    const a = windowFromEventRead({ id: 'w', begin: 123, end: 456 });
    const b = windowFromWrite({ id: 'w', beginTime: 123, endTime: 456 });
    expect(a).toEqual(b);
  });

  it('writes beginTime/endTime as stringified epoch millis', () => {
    const out = windowToApi({ begin: new Date(1700000000000), end: new Date(1700003600000) });
    expect(out).toEqual({ beginTime: '1700000000000', endTime: '1700003600000' });
  });

  it('emits an explicit null end so a PATCH can clear it', () => {
    expect(windowToApi({ begin: new Date(0), end: null }).endTime).toBeNull();
  });

  it('omits the end entirely when asked', () => {
    expect(windowToApi({ begin: new Date(0), end: null }, { includeEnd: false }))
      .not.toHaveProperty('endTime');
  });
});

describe('event summary', () => {
  it('maps the wire names to domain names', () => {
    const s = eventSummaryFromApi({
      id: 'e1', admin: 'u1', shortDescription: 'Title', longDescription: 'Desc',
      emailOnSubmission: true, allowMultiUserSignups: false, isPublished: true,
      volunteersMaxed: false, expired: false,
    });
    expect(s).toEqual({
      id: 'e1', admin: 'u1', title: 'Title', description: 'Desc',
      notifyOnSignup: true, allowMultiuserSignups: false, isPublished: true,
      timezone: null, reminderLeadTime: null,
      volunteersMaxed: false, expired: false,
    });
  });

  it('sends the long description as longDescription, not shortDescription', () => {
    // behavior §6.6: the legacy assigned changes.shortDescription twice, so
    // editing the description clobbered the title server-side and the
    // description itself could never be saved.
    const changes = eventSummaryToApi(
      { title: 'Same', description: 'NEW' },
      { title: 'Same', description: 'old' });
    expect(changes).toEqual({ longDescription: 'NEW' });
    expect(changes).not.toHaveProperty('shortDescription');
  });

  it('sends only what changed', () => {
    const prev = {
      title: 'T', description: 'D', notifyOnSignup: false, allowMultiuserSignups: false,
    };
    expect(eventSummaryToApi({ ...prev }, prev)).toEqual({});
    expect(eventSummaryToApi({ ...prev, title: 'T2' }, prev)).toEqual({ shortDescription: 'T2' });
    expect(eventSummaryToApi({ ...prev, notifyOnSignup: true }, prev))
      .toEqual({ emailOnSubmission: true });
  });
});

describe('activity', () => {
  it('maps caps from the wire', () => {
    const a = activityFromApi({
      id: 'a1', shortDescription: 'Setup', longDescription: 'd',
      maxActivityVolunteers: 10, maxSlotVolunteersDefault: 2, priority: 3,
    });
    expect(a).toEqual({
      id: 'a1', label: 'Setup', description: 'd',
      volunteerCap: 10, slotCapDefault: 2, priority: 3,
    });
  });

  it('sends the slot default under the key the server tokenizes', () => {
    // behavior §6.7: the legacy sent `slotVolunteerCapDefault`, which the
    // server does not tokenize, so the slot default could never be updated.
    const changes = activityChangesToApi({ slotCapDefault: 5 }, { slotCapDefault: 2 });
    expect(changes).toEqual({ maxSlotVolunteersDefault: 5 });
    expect(changes).not.toHaveProperty('slotVolunteerCapDefault');
  });

  it('defaults missing caps to 0 (unlimited)', () => {
    expect(activityFromApi({ id: 'a', shortDescription: 'x' }))
      .toMatchObject({ volunteerCap: 0, slotCapDefault: 0 });
  });
});

describe('detail', () => {
  it('maps from the wire and defaults the type', () => {
    expect(detailFromApi({ id: 'd', label: 'Phone', type: 'PHONE', required: true }))
      .toEqual({ id: 'd', type: 'PHONE', label: 'Phone', hint: '', required: true, priority: 0 });
  });

  it('sends only changed fields', () => {
    const prev = { type: 'STRING', label: 'L', hint: 'H', required: false };
    expect(detailChangesToApi({ ...prev }, prev)).toEqual({});
    expect(detailChangesToApi({ ...prev, required: true }, prev)).toEqual({ required: true });
  });
});
