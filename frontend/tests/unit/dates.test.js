/**
 * Date rendering, and the zone it renders in.
 *
 * The bug these pin: an instant was never ambiguous — windows travel as epoch
 * milliseconds — but every surface picked its own zone to render it in. The
 * grid used the viewer's browser, the mail templates used the server. A
 * volunteer in another timezone was told two different times for the same
 * shift, and neither said which zone it meant.
 */
import { describe, it, expect } from 'vitest';
import {
  fmtDateTime, fmtDateRangeParts, fmtZoneLabel, localZone, tomorrowAt,
} from '../../src/lib/format/dates.js';

/** 1970-01-01T00:00:00Z — midnight UTC, the previous evening in Chicago. */
const EPOCH = new Date(0);

describe('fmtDateTime', () => {
  it('renders nothing for a null date', () => {
    expect(fmtDateTime(null)).toBe('');
    expect(fmtDateTime(undefined)).toBe('');
  });

  it('renders the same instant differently in different zones', () => {
    expect(fmtDateTime(EPOCH, 'UTC')).toContain('12:00 AM');
    expect(fmtDateTime(EPOCH, 'America/Chicago')).toContain('06:00 PM');
  });

  it('rolls the date across a zone boundary, not just the clock', () => {
    expect(fmtDateTime(EPOCH, 'UTC')).toContain('01/01/70');
    // Six hours behind, so still the previous year.
    expect(fmtDateTime(EPOCH, 'America/Chicago')).toContain('12/31/69');
  });

  it('keeps the legacy format exactly', () => {
    // The option set is load-bearing: these strings are the grid's window
    // headers, so a change here changes the grid's appearance.
    expect(fmtDateTime(EPOCH, 'UTC')).toBe('01/01/70, 12:00 AM');
  });

  it('falls back to the viewer’s own zone when none is given', () => {
    // Which is what every event created before zones existed still does.
    expect(fmtDateTime(EPOCH)).toBe(fmtDateTime(EPOCH, localZone()));
  });
});

describe('fmtDateRangeParts', () => {
  it('renders both halves in the same zone', () => {
    const end = new Date(3_600_000);
    const parts = fmtDateRangeParts(EPOCH, end, 'UTC');
    expect(parts.begin).toContain('12:00 AM');
    expect(parts.end).toContain('01:00 AM');
  });

  it('renders a missing end as empty rather than throwing', () => {
    expect(fmtDateRangeParts(EPOCH, null, 'UTC').end).toBe('');
  });
});

describe('fmtZoneLabel', () => {
  it('says nothing when there is no zone to name', () => {
    // An event with no recorded zone renders in the viewer's own, which needs
    // no announcement.
    expect(fmtZoneLabel(null)).toBeNull();
    expect(fmtZoneLabel('')).toBeNull();
  });

  it('pairs the abbreviation with the IANA name', () => {
    // The abbreviation alone is ambiguous — CST is two different zones.
    expect(fmtZoneLabel('America/Chicago', new Date('2026-01-15T12:00:00Z')))
      .toBe('CST (America/Chicago)');
  });

  it('resolves daylight saving against the event, not today', () => {
    // The whole reason it takes a reference instant: an event in January is
    // CST, whatever the abbreviation happens to be on the day it is rendered.
    const winter = fmtZoneLabel('America/Chicago', new Date('2026-01-15T12:00:00Z'));
    const summer = fmtZoneLabel('America/Chicago', new Date('2026-07-15T12:00:00Z'));
    expect(winter).toContain('CST');
    expect(summer).toContain('CDT');
  });

  it('survives a zone the runtime does not know', () => {
    // The server validates against its own tz database, but a client can be
    // older than the server. Rendering the raw name beats taking the page down.
    expect(fmtZoneLabel('Mars/Olympus_Mons')).toBe('Mars/Olympus_Mons');
  });
});

describe('localZone', () => {
  it('reports an IANA identifier', () => {
    expect(localZone()).toMatch(/^[A-Za-z]+(\/[A-Za-z0-9_+-]+)*$/);
  });
});

describe('tomorrowAt', () => {
  it('lands on the next day at the given time', () => {
    const d = tomorrowAt(9, 30);
    const expected = new Date();
    expected.setDate(expected.getDate() + 1);

    expect(d.getDate()).toBe(expected.getDate());
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(30);
    expect(d.getSeconds()).toBe(0);
  });
});
