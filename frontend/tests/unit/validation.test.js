/**
 * Validation rules — docs/legacy/01-behavior.md §3, mirrored against the
 * server-side checks in docs/legacy/03-api-contract.md §3.
 *
 * Several cases here exist specifically to pin behavior the legacy got wrong;
 * those are called out inline.
 */
import { describe, it, expect } from 'vitest';
import {
  validateSummary, validateActivity, validateWindow, validateSlot,
  validateDetail, validateVolunteer, validateLogin, validateRegistration,
  MAX_TEXT,
  validateProfileUpdate, validatePasswordReset, CAP_MIN, CAP_MAX,
} from '../../src/lib/validation/forms.js';
import * as patterns from '../../src/lib/validation/patterns.js';
import { DETAIL_TYPES, typeLabel } from '../../src/lib/validation/detailTypes.js';

describe('patterns are anchored', () => {
  // The legacy regexes had no ^ or $, so junk around a valid value passed the
  // client and then 400'd server-side, where Matcher.matches() is implicitly
  // anchored (behavior §3.1).
  it('rejects an email with surrounding text', () => {
    expect(patterns.EMAIL.test('hello foo@bar.com world')).toBe(false);
    expect(patterns.EMAIL.test('foo@bar.com')).toBe(true);
  });

  it('rejects a number with surrounding text', () => {
    expect(patterns.INTEGER.test('abc12')).toBe(false);
    expect(patterns.INTEGER.test('12')).toBe(true);
  });

  it('rejects a phone number with surrounding text', () => {
    expect(patterns.PHONE.test('call me at 555-555-5555 ok')).toBe(false);
    expect(patterns.PHONE.test('555-555-5555')).toBe(true);
  });
});

describe('email case sensitivity', () => {
  // Detail.Type.EMAIL is compiled without CASE_INSENSITIVE, so an uppercase
  // address is a genuine 400. We keep the rule and lowercase on the way in.
  it('rejects uppercase, matching the server', () => {
    expect(patterns.EMAIL.test('BOB@EXAMPLE.COM')).toBe(false);
  });

  it('lowercases account emails rather than rejecting them', () => {
    const v = validateLogin({ email: '  BOB@Example.COM ', password: 'pw' });
    expect(v.ok).toBe(true);
    expect(v.values.email).toBe('bob@example.com');
  });

  it('lowercases EMAIL detail values', () => {
    expect(DETAIL_TYPES.EMAIL.serialize('  Foo@Bar.CO ')).toBe('foo@bar.co');
  });
});

describe('validateSummary', () => {
  it('requires a title', () => {
    expect(validateSummary({ title: '   ' }).ok).toBe(false);
    expect(validateSummary({ title: '   ' }).errors.title)
      .toBe('The title of your event cannot be blank.');
  });

  it('trims and coerces', () => {
    const v = validateSummary({ title: '  Party  ', description: '  fun  ', notifyOnSignup: 1 });
    expect(v.values).toEqual({
      title: 'Party', description: 'fun', notifyOnSignup: true, allowMultiuserSignups: false,
      reminderLeadTime: null, timezone: null,
    });
  });

  it('keeps a recognized time zone and refuses one the engine does not know', () => {
    expect(validateSummary({ title: 'T', timezone: 'America/Chicago' }).values.timezone)
      .toBe('America/Chicago');
    // A blank zone is a real value -- the event renders in each viewer's own --
    // rather than a missing one, so it is not an error.
    expect(validateSummary({ title: 'T', timezone: '' }).values.timezone).toBeNull();
    const bad = validateSummary({ title: 'T', timezone: 'Mars/Olympus_Mons' });
    expect(bad.ok).toBe(false);
    expect(bad.errors.timezone).toMatch(/time zone/i);
  });
});

describe('validateActivity', () => {
  it('requires a label', () => {
    expect(validateActivity({ label: '' }).errors.label)
      .toBe('The label for your activity cannot be blank.');
  });

  it('treats 0 as unlimited and skips the range check', () => {
    const v = validateActivity({ label: 'x', volunteerCap: 0, slotCapDefault: 0 });
    expect(v.ok).toBe(true);
  });

  it.each([
    [CAP_MIN, true], [CAP_MAX, true], [CAP_MAX + 1, false], [-1, false], [1.5, false],
  ])('cap %s -> valid=%s', (cap, valid) => {
    expect(validateActivity({ label: 'x', volunteerCap: cap }).ok).toBe(valid);
  });

  it('reports both cap errors at once', () => {
    const v = validateActivity({ label: 'x', volunteerCap: 999, slotCapDefault: 999 });
    expect(Object.keys(v.errors).sort()).toEqual(['slotCapDefault', 'volunteerCap']);
  });
});

describe('validateWindow', () => {
  const t = (h) => new Date(2030, 0, 1, h);

  it('requires both ends', () => {
    expect(validateWindow({ begin: t(9), end: null }).ok).toBe(false);
    expect(validateWindow({ begin: null, end: t(9) }).errors.range)
      .toBe('Please specify the entire window range.');
  });

  it('rejects an end before the beginning', () => {
    // The legacy had no ordering check; the server rejects it as a 500.
    expect(validateWindow({ begin: t(17), end: t(9) }).ok).toBe(false);
  });

  it('accepts a well-ordered range', () => {
    expect(validateWindow({ begin: t(9), end: t(17) }).ok).toBe(true);
  });

  it('accepts a zero-length range, which the server nulls the end of', () => {
    expect(validateWindow({ begin: t(9), end: t(9) }).ok).toBe(true);
  });
});

describe('validateSlot', () => {
  it('ignores the cap when the slot is disabled', () => {
    const v = validateSlot({ enabled: false, cap: 9999 });
    expect(v.ok).toBe(true);
    expect(v.values).toEqual({ enabled: false, cap: 0 });
  });

  it('enforces the cap when enabled', () => {
    expect(validateSlot({ enabled: true, cap: 256 }).ok).toBe(false);
    expect(validateSlot({ enabled: true, cap: 255 }).ok).toBe(true);
  });

  it('sends 0 only when unlimited was actually asked for', () => {
    const v = validateSlot({ enabled: true, unlimited: true, cap: 12 });
    expect(v.ok).toBe(true);
    expect(v.values).toEqual({ enabled: true, cap: 0 });
  });

  it('refuses an empty or zero cap while the switch is off', () => {
    // Reading a blank box as "unlimited" granted the opposite of what the
    // organizer had just clicked.
    for (const cap of [0, null, undefined, '']) {
      expect(validateSlot({ enabled: true, unlimited: false, cap }).ok, String(cap))
        .toBe(false);
    }
  });
});

describe('text length', () => {
  const long = 'x'.repeat(MAX_TEXT + 1);
  const atLimit = 'x'.repeat(MAX_TEXT);

  it('mirrors the server\'s VARCHAR(255) on every free-text field', () => {
    expect(validateSummary({ title: atLimit }).ok).toBe(true);
    expect(validateSummary({ title: long }).errors.title).toMatch(/255/);
    expect(validateSummary({ title: 'ok', description: long }).errors.description)
      .toMatch(/255/);

    expect(validateActivity({ label: long }).errors.label).toMatch(/255/);
    expect(validateActivity({ label: 'ok', description: long }).errors.description)
      .toMatch(/255/);

    expect(validateDetail({ type: 'STRING', label: long }).errors.label).toMatch(/255/);
    expect(validateDetail({ type: 'STRING', label: 'ok', hint: long }).errors.hint)
      .toMatch(/255/);

    expect(validateVolunteer({ name: long }).errors.name).toMatch(/255/);
  });

  it('refuses an over-long answer to a custom field', () => {
    // This one is not merely an opaque 400 server-side: the volunteer endpoint
    // does not length-check the value, so it reaches the insert and 500s.
    const details = [{ key: 'd1', type: 'STRING', required: false }];
    const v = validateVolunteer({ name: 'Ada', values: { d1: long } }, details);
    expect(v.ok).toBe(false);
    expect(v.errors.d1).toMatch(/255/);

    expect(validateVolunteer({ name: 'Ada', values: { d1: atLimit } }, details).ok)
      .toBe(true);
  });
});

describe('validateDetail', () => {
  it('rejects an unselected type', () => {
    expect(validateDetail({ type: undefined, label: 'x' }).errors.type)
      .toBe('Please make sure to select a detail type.');
    expect(validateDetail({ type: 'NOPE', label: 'x' }).ok).toBe(false);
  });

  it('requires a label', () => {
    expect(validateDetail({ type: 'STRING', label: '  ' }).errors.label)
      .toBe("The field label can't be empty.");
  });
});

describe('validateVolunteer', () => {
  const details = [
    { key: 'd1', type: 'STRING', required: false },
    { key: 'd2', type: 'EMAIL', required: false },
    { key: 'd3', type: 'BOOLEAN', required: true },
    { key: 'd4', type: 'INTEGER', required: false },
    { key: 'd5', type: 'PHONE', required: false },
  ];

  it('requires a name', () => {
    const v = validateVolunteer({ name: '  ', values: new Map([['d3', true]]) }, details);
    expect(v.errors.name).toBe('Please provide a name.');
  });

  it('enforces required BOOLEAN details', () => {
    // behavior §6.19: the legacy compared a boolean against '' so an unticked
    // required checkbox always passed. "Required" now means "must be ticked",
    // which is what the server enforces when the detail is absent.
    const unticked = validateVolunteer({ name: 'A', values: new Map([['d3', false]]) }, details);
    expect(unticked.ok).toBe(false);
    expect(unticked.errors.d3).toBe('This field is required.');

    const ticked = validateVolunteer({ name: 'A', values: new Map([['d3', true]]) }, details);
    expect(ticked.ok).toBe(true);
  });

  it('omits blank optional details rather than sending empty strings', () => {
    const v = validateVolunteer({
      name: 'A', values: new Map([['d1', ''], ['d3', true]]),
    }, details);
    expect(v.ok).toBe(true);
    expect(v.values.details.map((d) => d.detailKey)).toEqual(['d3']);
  });

  it('validates each type against its pattern', () => {
    const v = validateVolunteer({
      name: 'A',
      values: new Map([['d2', 'not-an-email'], ['d3', true], ['d4', 'abc'], ['d5', 'xyz']]),
    }, details);
    expect(v.errors.d2).toBe('This needs to be an email address.');
    expect(v.errors.d4).toBe('This needs to be a number.');
    expect(v.errors.d5).toBe('This needs to be a phone number.');
  });

  it('serializes booleans as strings, as the API expects', () => {
    const v = validateVolunteer({ name: 'A', values: new Map([['d3', true]]) }, details);
    expect(v.values.details).toEqual([{ detailKey: 'd3', value: 'true' }]);
  });

  it('skips details of an unrecognized type instead of throwing', () => {
    // The legacy threw here and returned null with no toast at all — a form
    // that could not be submitted and gave no reason (behavior §6.19).
    const v = validateVolunteer(
      { name: 'A', values: new Map() },
      [{ key: 'bad', type: 'MYSTERY', required: true }]);
    expect(v.ok).toBe(true);
  });

  it('accepts a plain object as well as a Map', () => {
    const v = validateVolunteer({ name: 'A', values: { d3: true } }, details);
    expect(v.ok).toBe(true);
  });
});

describe('credential forms', () => {
  it('rejects a mistyped registration confirmation', () => {
    const v = validateRegistration({
      email: 'a@b.co', password: 'hunter22', confirmPassword: 'hunter23',
    });
    expect(v.errors.confirmPassword)
      .toBe('Oops! You might have mistyped your password confirmation.');
  });

  it('requires a registration password of at least the configured length', () => {
    const v = validateRegistration({ email: 'a@b.co', password: '', confirmPassword: '' });
    expect(v.errors.password).toBe('Your password needs to be at least 8 characters.');
    expect(validateRegistration({
      email: 'a@b.co', password: 'hunter7', confirmPassword: 'hunter7',
    }).ok).toBe(false);
    expect(validateRegistration({
      email: 'a@b.co', password: 'hunter78', confirmPassword: 'hunter78',
    }).ok).toBe(true);
  });

  it('treats an entirely empty profile update as a valid no-op', () => {
    const v = validateProfileUpdate({ email: '', password: '', confirmPassword: '' });
    expect(v.ok).toBe(true);
    expect(v.values).toEqual({ email: null, password: null });
  });

  it('only checks the profile confirmation when a password was entered', () => {
    expect(validateProfileUpdate({ email: 'a@b.co', password: '', confirmPassword: 'junk' }).ok)
      .toBe(true);
    expect(validateProfileUpdate({ password: 'hunter78', confirmPassword: 'nope1234' }).ok)
      .toBe(false);
  });

  it('validates a password reset without an email', () => {
    // accountReset signs with an empty email; only the password matters.
    expect(validatePasswordReset({ password: 'hunter78', confirmPassword: 'hunter78' }).ok)
      .toBe(true);
    expect(validatePasswordReset({ password: 'hunter78', confirmPassword: 'nope1234' }).ok)
      .toBe(false);
  });

  // The one flow that checks a password rather than setting one. An account
  // made before the policy existed, or under a lower one, has to stay usable --
  // a minimum applied here would lock people out of their own accounts.
  it('never applies the minimum length when logging in', () => {
    expect(validateLogin({ email: 'a@b.co', password: 'x' }).ok).toBe(true);
    expect(validateLogin({ email: 'a@b.co', password: '' }).errors.password)
      .toBe('Please enter your password.');
  });

  it('bounds an account email at the column width', () => {
    const long = `${'a'.repeat(250)}@example.com`;
    expect(validateLogin({ email: long, password: 'x' }).errors.email).toMatch(/255/);
    expect(validateRegistration({ email: long, password: 'hunter78', confirmPassword: 'hunter78' })
      .errors.email).toMatch(/255/);
  });
});

describe('detail type registry', () => {
  it('maps ids to the legacy display labels', () => {
    expect(typeLabel('STRING')).toBe('Text');
    expect(typeLabel('BOOLEAN')).toBe('True/False');
    expect(typeLabel('INTEGER')).toBe('Whole Number');
    expect(typeLabel('EMAIL')).toBe('Email Address');
    expect(typeLabel('PHONE')).toBe('Phone Number');
  });

  it('falls back to INVALID for unknown ids, as the legacy did', () => {
    expect(typeLabel('WHATEVER')).toBe('INVALID');
  });

  it('accepts decimals for INTEGER, matching the server pattern', () => {
    // Named "Whole Number" but the server permits 9 decimal places, hence the
    // message says "number" rather than "integer".
    expect(DETAIL_TYPES.INTEGER.pattern.test('1.5')).toBe(true);
    expect(DETAIL_TYPES.INTEGER.pattern.test('-1')).toBe(false);
  });
});

describe('cross-tier corpus', () => {
  /**
   * The mirror of `DetailTypeTest.corpus()` in the Java suite.
   *
   * These patterns exist twice — once in Java, once here — so the user gets an
   * inline message instead of an opaque 400. Two copies of a rule drift, and
   * the failure is nasty either way: the client refusing input the server would
   * take, or accepting input the server then rejects with a message that names
   * a field rather than a reason.
   *
   * Keep these rows in step with
   * `src/test/java/com/crowdease/yasss/model/DetailTypeTest.java`.
   */
  it.each([
    ['bob@example.com', 'EMAIL', true],
    ['Bob@Example.com', 'EMAIL', false],
    ['hello bob@example.com x', 'EMAIL', false],
    ['not-an-email', 'EMAIL', false],
    ['', 'EMAIL', false],

    ['42', 'INTEGER', true],
    ['1.5', 'INTEGER', true],
    ['-1', 'INTEGER', false],
    ['abc12', 'INTEGER', false],
    ['', 'INTEGER', false],

    ['555-555-5555', 'PHONE', true],
    ['(555) 555-5555', 'PHONE', true],
    ['call me at 5555555555', 'PHONE', false],
    ['', 'PHONE', false],

    ['true', 'BOOLEAN', true],
    ['false', 'BOOLEAN', true],
    ['TRUE', 'BOOLEAN', false],
    ['yes', 'BOOLEAN', false],

    ['anything', 'STRING', true],
    ['', 'STRING', true],
  ])('%s as %s -> %s', (value, type, valid) => {
    const spec = DETAIL_TYPES[type];
    // STRING has no pattern: anything is acceptable.
    expect(spec.pattern ? spec.pattern.test(value) : true).toBe(valid);
  });
});

describe('validateVolunteer — reminder opt-in', () => {
  const base = { name: 'Ada', values: new Map() };

  it('ignores the address entirely when reminders are off', () => {
    const v = validateVolunteer({ ...base, remindersEnabled: false, reminderEmail: 'junk' }, []);
    expect(v.ok).toBe(true);
  });

  it('requires an address from an anonymous volunteer', () => {
    // The server would answer 400 with nothing naming the field, so the
    // volunteer would see a failure they cannot act on.
    const v = validateVolunteer({ ...base, remindersEnabled: true, reminderEmail: '' }, []);
    expect(v.ok).toBe(false);
    expect(v.errors.reminderEmail).toBeTruthy();
  });

  it('allows a blank address when the server has one to fall back to', () => {
    const v = validateVolunteer(
      { ...base, remindersEnabled: true, reminderEmail: '' },
      [],
      { accountEmail: 'ada@example.com' },
    );
    expect(v.ok).toBe(true);
  });

  it('rejects a malformed address', () => {
    const v = validateVolunteer(
      { ...base, remindersEnabled: true, reminderEmail: 'not-an-address' },
      [],
    );
    expect(v.ok).toBe(false);
    expect(v.errors.reminderEmail).toBeTruthy();
  });

  it('normalizes the address it returns', () => {
    const v = validateVolunteer(
      { ...base, remindersEnabled: true, reminderEmail: '  Ada@Example.COM  ' },
      [],
    );
    expect(v.ok).toBe(true);
    expect(v.values.reminderEmail).toBe('ada@example.com');
  });

  it('still reports a blank name alongside a bad address', () => {
    const v = validateVolunteer(
      { name: '', values: new Map(), remindersEnabled: true, reminderEmail: 'nope' },
      [],
    );
    expect(Object.keys(v.errors).sort()).toEqual(['name', 'reminderEmail']);
  });
});

describe('validateSummary — reminder lead time', () => {
  const base = { title: 'Party', description: '', notifyOnSignup: true, allowMultiuserSignups: false };

  it('treats blank as "use the platform default"', () => {
    // A real choice rather than a missing value, so it is not an error.
    for (const blank of ['', '   ', null, undefined]) {
      const v = validateSummary({ ...base, reminderLeadTime: blank });
      expect(v.ok).toBe(true);
      expect(v.values.reminderLeadTime).toBeNull();
    }
  });

  it('accepts a whole number of minutes', () => {
    const v = validateSummary({ ...base, reminderLeadTime: '2880' });
    expect(v.ok).toBe(true);
    expect(v.values.reminderLeadTime).toBe(2880);
  });

  it('rejects zero, which is not a reminder', () => {
    expect(validateSummary({ ...base, reminderLeadTime: '0' }).ok).toBe(false);
  });

  it('rejects more than a year', () => {
    // An unbounded lead makes every future event permanently due, so the next
    // sweep mails the whole backlog at once.
    expect(validateSummary({ ...base, reminderLeadTime: '525601' }).ok).toBe(false);
    expect(validateSummary({ ...base, reminderLeadTime: '525600' }).ok).toBe(true);
  });

  it('rejects fractions and non-numbers', () => {
    for (const bad of ['1.5', 'soon', '-30']) {
      expect(validateSummary({ ...base, reminderLeadTime: bad }).ok).toBe(false);
    }
  });

  it('still reports a blank title alongside a bad lead time', () => {
    const v = validateSummary({ ...base, title: '', reminderLeadTime: '0' });
    expect(Object.keys(v.errors).sort()).toEqual(['reminderLeadTime', 'title']);
  });
});
