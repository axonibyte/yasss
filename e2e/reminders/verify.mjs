/**
 * End-to-end verification of the reminder feature against the real stack.
 *
 * This is the only place the feature is exercised whole: a real MariaDB, a real
 * SMTP conversation with mailpit, and the real ReminderEngine sweeping on its
 * poll interval. Everything else about reminders is tested against a fake that
 * cannot send mail, so a break in the daemon, the finder's SQL, the mail
 * templates, or the SMTP configuration would be invisible without this.
 *
 * Three of these checks are for failures that have actually happened here:
 * a confirmation that silently did not stick because the token column was never
 * hydrated; a signup that 500'd and lost the volunteer because a mailer error
 * escaped the endpoint; and a reminder that was claimed but never sent because
 * the mailer was misconfigured.
 *
 * Env: YASSS_API, YASSS_MAILPIT.
 */
import { makeApi } from '../lib/api.mjs';
import { check, finish, sleep } from '../lib/check.mjs';
import { inbox, linkParams, messageBody, waitForMail } from '../lib/mailpit.mjs';

// Positional rather than the shared client's option object. This driver calls
// it about twenty times and none of those calls authenticate; adapting the
// signature here is less churn, and less risk, than rewriting all of them.
const http = makeApi();
const api = (method, path, body, query = '') => http(method, path, { body, query });

/**
 * Creates an event with one window.
 *
 * `hoursAhead` places the window; `leadMinutes` overrides how far ahead the
 * event wants its reminders. The default window sits inside the global lead.
 */
async function createEvent(title, { hoursAhead = 1, leadMinutes = null } = {}) {
  const begin = Date.now() + hoursAhead * 60 * 60 * 1000;
  const { payload } = await api('POST', '/v1/events', {
    shortDescription: title,
    longDescription: '',
    details: [],
    ...(leadMinutes === null ? {} : { reminderLeadTime: leadMinutes }),
    windows: [{ beginTime: String(begin), endTime: String(begin + 3600_000) }],
    activities: [{ shortDescription: 'Setup', slots: [{ enabled: true, window: 0 }] }],
  });
  const id = payload?.event?.id;
  if (!id) throw new Error(`could not create an event: ${JSON.stringify(payload)}`);

  const read = await api('GET', `/v1/events/${id}`);
  const event = read.payload.event;
  return { id, activity: event.activities[0].id, window: event.windows[0].id };
}

function signUp(event, { name, email, remindersEnabled = true }) {
  return api('POST', `/v1/events/${event.id}/volunteers`, {
    name,
    remindersEnabled,
    ...(email === undefined ? {} : { reminderEmail: email }),
    details: [],
    rsvps: [{ activity: event.activity, window: event.window }],
  });
}

// --- the happy path ---------------------------------------------------------

console.log('signup, double opt-in, and delivery');

const event = await createEvent('Reminder Verification');
const address = `ada-${Date.now()}@example.com`;

const created = await signUp(event, { name: 'Ada', email: address });
check(
  created.status === 201,
  'signing up with reminders succeeds',
  `got ${created.status}: ${JSON.stringify(created.payload)}`,
);
const volunteerId = created.payload?.volunteer?.id;

const prompt = await waitForMail(address, { subject: 'Confirm' });
check(prompt !== null, 'a confirmation email is sent');

let params = null;
if (prompt) {
  const body = await messageBody(prompt.ID);
  params = linkParams(body, 'confirm-reminders');
  check(params !== null, 'the confirmation email carries a confirm link');
  check(
    !body.includes('[['),
    'no template placeholder is left unsubstituted',
    'a literal [[TOKEN]] shipped to the recipient',
  );
}

// Nothing may be delivered before the address is confirmed. Checked before
// confirming, so a daemon ignoring reminder_state is caught here rather than
// looking like a pass below.
await sleep(2000);
const early = (await inbox()).filter(
  (m) => m.To?.some((t) => t.Address === address) && m.Subject.includes('Upcoming'),
);
check(early.length === 0, 'no reminder goes out before the address is confirmed');

if (params) {
  const confirmed = await api(
    'PUT',
    `/v1/events/${params.event}/volunteers/${params.volunteer}/reminders`,
    { token: params.token },
  );
  check(confirmed.status === 200, 'the confirm link is accepted', `got ${confirmed.status}`);

  // The daemon polls once a minute in this configuration.
  const reminder = await waitForMail(address, { subject: 'Upcoming', timeoutMs: 130_000 });
  check(reminder !== null, 'a reminder is delivered once confirmed');

  if (reminder) {
    const body = await messageBody(reminder.ID);
    check(body.includes('Reminder Verification'), 'the reminder names the event');
    check(body.includes('Setup'), "the reminder lists the volunteer's activity");
    check(!body.includes('[['), 'the reminder leaves no placeholder unsubstituted');

    const unsub = linkParams(body, 'unsubscribe-reminders');
    check(unsub !== null, 'the reminder carries an unsubscribe link');

    if (unsub) {
      const gone = await api(
        'DELETE',
        `/v1/events/${unsub.event}/volunteers/${unsub.volunteer}/reminders`,
        undefined,
        `?token=${unsub.token}`,
      );
      check(gone.status === 200, 'the unsubscribe link is accepted', `got ${gone.status}`);
    }
  }

  // At-most-once: a second sweep must not re-send for the same window.
  const before = (await inbox()).filter(
    (m) => m.To?.some((t) => t.Address === address) && m.Subject.includes('Upcoming'),
  ).length;
  await sleep(70_000);
  const after = (await inbox()).filter(
    (m) => m.To?.some((t) => t.Address === address) && m.Subject.includes('Upcoming'),
  ).length;
  check(after === before, 'a later sweep does not re-send the same reminder', `${before} -> ${after}`);
}

// --- rejections -------------------------------------------------------------

console.log('validation and disclosure');

const noAddress = await signUp(event, { name: 'Nobody' });
check(
  noAddress.status === 400,
  'opting in anonymously without an address is a 400',
  `got ${noAddress.status}`,
);

const badAddress = await signUp(event, { name: 'Bad', email: 'not-an-address' });
check(
  badAddress.status === 400,
  'a malformed address is a 400, not a 500',
  `got ${badAddress.status}`,
);

const optedOut = await signUp(event, { name: 'Quiet', remindersEnabled: false });
check(
  optedOut.status === 201,
  'signing up without reminders still works',
  `got ${optedOut.status}`,
);

// The address must never come back out. An organiser reading their own event
// learns that reminders are confirmed, not where they go.
const read = await api('GET', `/v1/events/${event.id}`);
const serialized = JSON.stringify(read.payload);
check(!serialized.includes(address), 'the reminder address is never returned to a client');
check(!serialized.includes('reminderToken'), 'the reminder token is never returned to a client');

// A wrong token is accepted with the same 200 as a right one -- confirming or
// denying would let anyone with a volunteer id probe for live subscriptions.
const wrongToken = await api(
  'PUT',
  `/v1/events/${event.id}/volunteers/${volunteerId}/reminders`,
  { token: '00000000-0000-0000-0000-000000000000' },
);
check(wrongToken.status === 200, 'a wrong token answers 200 and reveals nothing');

// --- per-event lead time ----------------------------------------------------

console.log('per-event lead time');

// Three days out. The global lead (1440 minutes) would not make this due; the
// event's own five-day override should. That distinction is the whole feature,
// and it lives in a SQL expression, so nothing below the database can prove it.
const far = await createEvent('Far Event', { hoursAhead: 72, leadMinutes: 7200 });
const farAddress = `far-${Date.now()}@example.com`;

const farSignup = await signUp(far, { name: 'Far', email: farAddress });
check(farSignup.status === 201, 'signing up on a long-lead event succeeds');

const farPrompt = await waitForMail(farAddress, { subject: 'Confirm' });
if (check(farPrompt !== null, 'its confirmation email arrives')) {
  const params = linkParams(await messageBody(farPrompt.ID), 'confirm-reminders');
  if (check(params !== null, 'the confirmation carries a link')) {
    await api('PUT', `/v1/events/${params.event}/volunteers/${params.volunteer}/reminders`,
      { token: params.token });

    const farReminder = await waitForMail(farAddress, { subject: 'Upcoming', timeoutMs: 130_000 });
    check(
      farReminder !== null,
      'a reminder goes out under the per-event lead, not the global one',
      'the event is outside the global horizon, so a global-only bound would never send',
    );
  }
}

// A window beyond even the override stays quiet.
const beyond = await createEvent('Beyond Horizon', { hoursAhead: 24 * 30, leadMinutes: 60 });
const beyondAddress = `beyond-${Date.now()}@example.com`;
await signUp(beyond, { name: 'Beyond', email: beyondAddress });

const beyondPrompt = await waitForMail(beyondAddress, { subject: 'Confirm' });
if (beyondPrompt) {
  const params = linkParams(await messageBody(beyondPrompt.ID), 'confirm-reminders');
  if (params) {
    await api('PUT', `/v1/events/${params.event}/volunteers/${params.volunteer}/reminders`,
      { token: params.token });
  }
}
await sleep(70_000);
const beyondSent = (await inbox()).filter(
  (m) => m.To?.some((t) => t.Address === beyondAddress) && m.Subject.includes('Upcoming'),
);
check(
  beyondSent.length === 0,
  'an event past its own horizon is left alone',
  'a shorter override must narrow the window, not widen it',
);

const badLead = await api('POST', '/v1/events', {
  shortDescription: 'Bad Lead',
  longDescription: '',
  reminderLeadTime: 0,
  details: [],
  windows: [],
  activities: [],
});
check(badLead.status === 400, 'a zero lead time is refused', `got ${badLead.status}`);

finish('reminders');
