/**
 * Text fidelity, end to end, against the real database.
 *
 * The browser suite already asserts that hostile and exotic input can be saved.
 * What it could not assert until now is that what comes back is what went in --
 * a title stored as `????`, truncated mid-character, or double-escaped produces
 * a perfectly green "successfully created your event" every time.
 *
 * There are four separate places a value can be mangled between the browser and
 * the disk, and each is exercised here:
 *
 *   - the Java strip, which does not remove the same whitespace JS `trim()`
 *     does, in either direction;
 *   - the length bound, which counts characters where `String.length()` counted
 *     UTF-16 code units;
 *   - the column's character set, which was never declared and inherited
 *     whatever the server defaulted to (see migration 017 -- run.sh now starts
 *     MariaDB as latin1 specifically so that this stage means something); and
 *   - the JSON serializer, which escapes some ranges and not others.
 *
 * The last of those is why every assertion here compares the *parsed* value.
 * org.json escapes U+0080-U+009F and U+2000-U+20FF as `\uXXXX` on the way out,
 * so a raw-substring check would fail for reasons that have nothing to do with
 * storage.
 *
 * This stage also carries the checks for a handful of adjacent defects that
 * need no fixture of their own -- see "boundaries and edges" below.
 *
 * Env: YASSS_API, YASSS_ADMIN_EMAIL, YASSS_ADMIN_PASSWORD.
 */
import { isUnhandled, makeApi } from '../lib/api.mjs';
import { check, finish } from '../lib/check.mjs';
import { adminAuth } from '../lib/creds.mjs';
import { LENGTH_BOUNDARIES, UNICODE_ROUNDTRIP } from '../lib/corpus.mjs';
import { addVolunteer, createEvent, readEvent } from '../lib/fixtures.mjs';

const api = makeApi();
const auth = await adminAuth();

/** Every response, everywhere, has to clear this. */
function sane(res, what) {
  if (res.status >= 500) {
    return check(false, what, `${res.status}: ${JSON.stringify(res.payload ?? res.text)}`);
  }
  if (isUnhandled(res)) {
    return check(false, `${what} (unhandled exception in the server)`, JSON.stringify(res.payload));
  }
  return true;
}

// --- the round trip ---------------------------------------------------------

console.log('\ntext round-trips through the database');

// One event per case, carrying the value in three different columns at once.
//
// Deliberately not one event with an activity per case: `Event.getActivities`
// returns a `TreeSet` ordered by (priority, shortDescription) case-insensitively,
// so activities come back sorted rather than as sent -- and any two that
// compare equal are silently dropped. Both would make a positional comparison
// here lie about the server.
for (const c of UNICODE_ROUNDTRIP) {
  const created = await createEvent(api, {
    auth,
    title: c.sent,
    longDescription: c.sent,
    activities: [{ label: c.sent }],
  });

  const read = await api('GET', `/v1/events/${created.id}`, { auth });
  if (!sane(read, `reading back ${c.name}`)) continue;
  const event = read.payload.event;

  check(
    event.shortDescription === c.stored,
    `an event title survives: ${c.name}`,
    `sent ${JSON.stringify(c.sent)}\n      want ${JSON.stringify(c.stored)}`
      + `\n      got  ${JSON.stringify(event.shortDescription)}`,
  );
  check(
    event.longDescription === c.stored,
    `an event description survives: ${c.name}`,
    `want ${JSON.stringify(c.stored)}, got ${JSON.stringify(event.longDescription)}`,
  );
  check(
    event.activities[0]?.shortDescription === c.stored,
    `an activity label survives: ${c.name}`,
    `want ${JSON.stringify(c.stored)}, got ${JSON.stringify(event.activities[0]?.shortDescription)}`,
  );
}

// Two activities that differ only in case are one activity by the time they
// come back: `getActivities` collects into a TreeSet whose comparator is
// (priority, shortDescription case-insensitive). Recorded rather than fixed --
// the ordering is what the grid renders from -- but pinned so the day it
// changes is a decision rather than a surprise.
{
  const collided = await createEvent(api, {
    auth,
    title: 'Colliding Labels',
    activities: [{ label: 'Setup' }, { label: 'setup' }, { label: 'Teardown' }],
  });
  check(
    collided.activities.length === 2,
    'activities whose labels differ only in case are deduplicated on read',
    `got ${collided.activities.length}: ${JSON.stringify(collided.activities.map((a) => a.label))}`
      + ' -- if this is now 3, the TreeSet was replaced and remaining-work.md needs updating',
  );
}

// --- the same values through PATCH ------------------------------------------

console.log('\nthe same values survive an edit');

const patchable = await createEvent(api, { auth, title: 'Patch Me' });
for (const c of UNICODE_ROUNDTRIP) {
  const patched = await api('PATCH', `/v1/events/${patchable.id}`, {
    auth,
    body: { shortDescription: c.sent },
  });
  sane(patched, `PATCH with ${c.name}`);
  const read = await api('GET', `/v1/events/${patchable.id}`, { auth });
  check(
    read.payload?.event?.shortDescription === c.stored,
    `a patched title survives: ${c.name}`,
    `want ${JSON.stringify(c.stored)}, got ${JSON.stringify(read.payload?.event?.shortDescription)}`,
  );
}

// --- volunteer name and answers ---------------------------------------------

console.log('\nvolunteer names and custom-field answers survive');

const staffed = await createEvent(api, {
  auth,
  title: 'Staffed',
  details: [{ type: 'STRING', label: 'Notes', required: false }],
});
const detailId = (await api('GET', `/v1/events/${staffed.id}`, { auth }))
  .payload.event.details[0].id;

for (const c of UNICODE_ROUNDTRIP) {
  const added = await addVolunteer(api, staffed.id, {
    auth,
    name: c.sent,
    details: [{ detail: detailId, value: c.sent }],
  });
  if (!sane(added, `signing up with ${c.name}`)) continue;
  // Reported separately from the fidelity checks below: a rejected signup and a
  // mangled one are different findings, and conflating them costs a debugging
  // session working out why a name "came back undefined".
  if (!check(
    added.status === 201,
    `a volunteer can be created with: ${c.name}`,
    `got ${added.status}: ${added.payload?.info}`,
  )) continue;

  const read = await readEvent(api, staffed.id, auth);
  const mine = read.volunteers.find((v) => v.id === added.payload?.volunteer?.id);
  check(
    mine?.name === c.stored,
    `a volunteer name survives: ${c.name}`,
    `want ${JSON.stringify(c.stored)}, got ${JSON.stringify(mine?.name)}`,
  );
  const answer = mine?.details?.[0]?.value;
  check(
    answer === c.stored,
    `a custom-field answer survives: ${c.name}`,
    `want ${JSON.stringify(c.stored)}, got ${JSON.stringify(answer)}`,
  );
}

// --- boundaries and edges ---------------------------------------------------

console.log('\nlength bounds are counted in characters, not code units');

for (const c of LENGTH_BOUNDARIES) {
  const res = await api('POST', '/v1/events', {
    auth,
    body: {
      shortDescription: c.sent,
      longDescription: '',
      details: [],
      windows: [],
      activities: [],
    },
  });
  sane(res, `creating an event titled ${c.name}`);

  if (c.accepted) {
    check(res.status === 201, `${c.name} is accepted`, `got ${res.status}: ${res.payload?.info}`);
    if (res.status === 201) {
      const read = await api('GET', `/v1/events/${res.payload.event.id}`, { auth });
      check(
        read.payload?.event?.shortDescription === c.sent,
        `${c.name} comes back whole`,
        `sent ${c.sent.length} code units, got ${read.payload?.event?.shortDescription?.length}`,
      );
    }
  } else {
    check(
      res.status === 400 && /string too long/.test(res.payload?.info ?? ''),
      `${c.name} is refused with a 400`,
      `got ${res.status}: ${res.payload?.info}`,
    );
  }
}

console.log('\nedges that used to be 500s');

// ModifyEventEndpoint bounded longDescription and not shortDescription, so an
// over-long title was a clean 400 on create and a database malfunction on edit.
const longPatch = await api('PATCH', `/v1/events/${patchable.id}`, {
  auth,
  body: { shortDescription: 'x'.repeat(256) },
});
check(
  longPatch.status === 400,
  'an over-long title on PATCH is a 400, not a 500',
  `got ${longPatch.status}: ${longPatch.payload?.info}`,
);

// A reset that supplies a pubkey and no token reaches TicketEngine.verify with
// a null. That is swallowed and answered 403; asserting it here means a
// refactor that removes the swallowing catch shows up as a 500 in this stage
// rather than in production.
const tokenless = await api('POST', `/v1/users/${process.env.YASSS_ADMIN_ID}`, {
  body: { pubkey: Buffer.alloc(32).toString('base64') },
});
check(
  tokenless.status === 403,
  'a reset with a pubkey and no token is a 403, not a 500',
  `got ${tokenless.status}: ${tokenless.payload?.info}`,
);

// reminderEmail is bounded inside ReminderConsent rather than by bounded(), so
// it is easy to lose in a refactor of either.
const longEmail = await addVolunteer(api, staffed.id, {
  auth,
  name: 'Long Email',
  remindersEnabled: true,
  reminderEmail: `${'e'.repeat(250)}@example.com`,
});
check(
  longEmail.status === 400,
  'an over-long reminder address is a 400, not a 500',
  `got ${longEmail.status}: ${longEmail.payload?.info}`,
);

// --- output escaping --------------------------------------------------------

console.log('\nuser text is escaped on the HTML surfaces');

const XSS_NAME = '<img src=x onerror="window.__pwned=1">';
const XSS_ANSWER = '</td></tr><script>window.__pwned=1</script>';

const reported = await createEvent(api, {
  auth,
  title: `Report ${XSS_NAME}`,
  details: [{ type: 'STRING', label: `Label ${XSS_NAME}`, required: false }],
});
const reportedDetail = (await api('GET', `/v1/events/${reported.id}`, { auth }))
  .payload.event.details[0].id;

await addVolunteer(api, reported.id, {
  auth,
  name: XSS_NAME,
  details: [{ detail: reportedDetail, value: XSS_ANSWER }],
  rsvps: [{ activity: reported.activities[0].id, window: reported.windows[0] }],
});

const report = await api('GET', `/v1/events/${reported.id}/report`, { auth });
sane(report, 'fetching the printable report');
check(
  report.status === 200,
  'the report renders',
  `got ${report.status}`,
);
check(
  !/<img src=x onerror/.test(report.text ?? ''),
  'a volunteer name is not injected raw into the report',
  'the report contains an unescaped <img> tag from a volunteer name',
);
check(
  !/<script>window\.__pwned/.test(report.text ?? ''),
  'a custom-field answer is not injected raw into the report',
  'the report contains an unescaped <script> tag from a detail value',
);
check(
  /&lt;img src=x onerror/.test(report.text ?? ''),
  'the volunteer name is present, escaped',
  'the escaped form is missing too -- the name may simply not be rendered',
);

finish('text');
