/**
 * API fuzzer.
 *
 * Aimed squarely at this codebase's failure mode. Almost every bug found during
 * the rewrite was an unguarded dereference reaching the client as a 500: a
 * volunteer UUID belonging to another event, a null actor on an anonymous
 * request, a report row list that was empty, a CAPTCHA validator that was never
 * constructed. None of those are exotic inputs -- they are ordinary requests
 * that nobody tried.
 *
 * So the oracle is not "does it return the right answer" but the far cheaper
 * and more general:
 *
 *   1. no 5xx, ever
 *   2. every response is a well-formed {status, info} envelope
 *   3. the server is still alive afterwards
 *
 * Deterministic: the seed is printed on every run and can be replayed with
 * FUZZ_SEED. A fuzzer you cannot replay is a fuzzer you cannot act on.
 */
import { randomUUID } from 'node:crypto';

const API = process.env.YASSS_API ?? 'http://127.0.0.1:7455';
const ITERATIONS = Number(process.env.FUZZ_ITERATIONS ?? 400);
const SEED = Number(process.env.FUZZ_SEED ?? (Date.now() % 2 ** 31));

/** xorshift32 — small, seedable, adequate for choosing among fixtures. */
let state = SEED || 1;
function rnd() {
  state ^= state << 13; state >>>= 0;
  state ^= state >> 17;
  state ^= state << 5; state >>>= 0;
  return state / 2 ** 32;
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;

/**
 * Values chosen to probe the seams that actually broke: type confusion at the
 * deserializer, unparseable ids, boundary values on TINYINT UNSIGNED columns,
 * and text that is only a problem if something concatenates it into SQL or HTML.
 */
const SCALARS = [
  null, true, false, 0, -1, 1, 255, 256, 65536, -2147483648, 2147483647,
  '', ' ', 'a'.repeat(256), 'a'.repeat(4096),
  '0', '1', 'true', 'false', 'null', 'undefined', 'NaN',
  '../../etc/passwd', "'; DROP TABLE yasss_event; --", "' OR '1'='1",
  '<script>alert(1)</script>', '${jndi:ldap://x/y}', '{{7*7}}',
  '\u0000', '💩', 'é'.repeat(64), '\n\r\t',
  1.5, 1e308, -1e308,
  [], {}, [1, 2, 3], { nested: { deep: true } },
];

const IDS = [
  randomUUID(), '00000000-0000-0000-0000-000000000000',
  'not-a-uuid', '', ' ', '../admin', 'null',
  '1 OR 1=1', 'a'.repeat(300),
];

const DETAIL_TYPES = ['STRING', 'BOOLEAN', 'INTEGER', 'EMAIL', 'PHONE', 'string', 'NOPE', '', null, 7];

const scalar = () => pick(SCALARS);
const id = () => pick(IDS);

/**
 * Values safe to put in a header or a URL path.
 *
 * fetch rejects non-Latin-1 header values and raw NULs in URLs before the
 * request is ever sent, so generating them tests undici rather than the server
 * -- they showed up as "transport" findings that were purely my own doing.
 */
const transportSafe = (v) => String(v).replace(/[^\x20-\x7e]/g, '?');

/** Sometimes a valid-looking body, sometimes garbage, often a mixture. */
function fuzzBody(template) {
  if (chance(0.1)) return undefined;
  if (chance(0.05)) return scalar();
  if (chance(0.05)) return [template];

  const out = {};
  for (const [k, v] of Object.entries(template)) {
    if (chance(0.25)) continue;              // omit a field
    out[k] = chance(0.5) ? v : scalar();     // or corrupt it
  }
  if (chance(0.2)) out[`x${Math.floor(rnd() * 1000)}`] = scalar(); // unexpected key
  return out;
}

const EVENT_TEMPLATE = () => ({
  shortDescription: 'Fuzz Event',
  longDescription: 'described',
  emailOnSubmission: false,
  allowMultiUserSignups: chance(0.5),
  activities: [{
    shortDescription: 'Activity',
    priority: 0,
    maxActivityVolunteers: Math.floor(rnd() * 300),
    maxSlotVolunteersDefault: Math.floor(rnd() * 300),
    slots: [{ enabled: chance(0.5), window: 0, maxSlotVolunteers: Math.floor(rnd() * 300) }],
  }],
  windows: [{ beginTime: String(Date.now() + 86400000), endTime: String(Date.now() + 90000000) }],
  details: [{ type: pick(DETAIL_TYPES), label: 'Field', hint: '',
              priority: Math.floor(rnd() * 300), required: chance(0.5) }],
});

const VOLUNTEER_TEMPLATE = () => ({
  name: 'Fuzz Volunteer',
  remindersEnabled: chance(0.5),
  // Opting in with a hostile or absent address is the interesting half: this
  // field reaches an anchored pattern, a VARCHAR(255), and a mail send.
  reminderEmail: chance(0.4) ? undefined : pick([
    `f${Math.floor(rnd() * 1e9)}@example.com`,
    'not-an-address',
    '',
    `${'a'.repeat(300)}@example.com`,
    'a@b@c.example.com',
  ]),
  details: [],
  rsvps: chance(0.3) ? undefined : [],
});

/** Endpoints, as (method, path, body) generators. */
function operations(ctx) {
  const e = () => (chance(0.6) && ctx.eventId ? ctx.eventId : id());
  const a = () => (chance(0.6) && ctx.activityId ? ctx.activityId : id());
  const w = () => (chance(0.6) && ctx.windowId ? ctx.windowId : id());
  const v = () => (chance(0.6) && ctx.volunteerId ? ctx.volunteerId : id());
  const d = () => (chance(0.6) && ctx.detailId ? ctx.detailId : id());

  return [
    ['GET', () => '/v1'],
    ['GET', () => `/v1/texts/${pick(['coa', 'terms', 'privacy', 'tutorial', 'nope', '', '../x'])}`],

    ['GET', () => `/v1/events?${new URLSearchParams({
      admin: String(id()), volunteer: String(id()),
      limit: String(scalar()), page: String(scalar()), label: String(scalar()),
      earliest: String(scalar()), latest: String(scalar()),
    })}`],
    ['POST', () => '/v1/events', () => fuzzBody(EVENT_TEMPLATE())],
    ['GET', () => `/v1/events/${e()}`],
    ['PATCH', () => `/v1/events/${e()}`, () => fuzzBody({ shortDescription: 'x', longDescription: 'y' })],
    ['DELETE', () => `/v1/events/${e()}`],
    ['GET', () => `/v1/events/${e()}/report`],

    ['POST', () => `/v1/events/${e()}/activities`, () => fuzzBody({
      shortDescription: 'A', longDescription: '', priority: Math.floor(rnd() * 300),
      maxActivityVolunteers: 0, maxSlotVolunteersDefault: 0,
    })],
    ['PATCH', () => `/v1/events/${e()}/activities/${a()}`, () => fuzzBody({
      shortDescription: 'A', maxSlotVolunteersDefault: Math.floor(rnd() * 300),
    })],
    ['DELETE', () => `/v1/events/${e()}/activities/${a()}`],

    ['POST', () => `/v1/events/${e()}/windows`, () => fuzzBody({
      beginTime: String(Date.now()), endTime: String(Date.now() + 3600000),
    })],
    ['PATCH', () => `/v1/events/${e()}/windows/${w()}`, () => fuzzBody({ beginTime: String(Date.now()) })],
    ['DELETE', () => `/v1/events/${e()}/windows/${w()}`],

    ['POST', () => `/v1/events/${e()}/details`, () => fuzzBody({
      type: pick(DETAIL_TYPES), label: 'L', hint: '',
      priority: Math.floor(rnd() * 300), required: false,
    })],
    ['PATCH', () => `/v1/events/${e()}/details/${d()}`,
      () => fuzzBody({ label: 'L', priority: Math.floor(rnd() * 300) })],
    ['DELETE', () => `/v1/events/${e()}/details/${d()}`],

    ['PUT', () => `/v1/events/${e()}/activities/${a()}/windows/${w()}`,
      () => fuzzBody({ maxSlotVolunteers: Math.floor(rnd() * 300) })],
    ['DELETE', () => `/v1/events/${e()}/activities/${a()}/windows/${w()}`],

    ['POST', () => `/v1/events/${e()}/volunteers`, () => fuzzBody(VOLUNTEER_TEMPLATE())],
    ['PATCH', () => `/v1/events/${e()}/volunteers/${v()}`, () => fuzzBody({ name: 'V' })],
    ['DELETE', () => `/v1/events/${e()}/volunteers/${v()}`],

    // Both reminder routes are unauthenticated and gated only by a token
    // compared against stored state, so a malformed one must be a quiet 200
    // rather than a parse failure surfacing as a 500.
    ['PUT', () => `/v1/events/${e()}/volunteers/${v()}/reminders`,
      () => fuzzBody({ token: String(scalar()) })],
    ['DELETE', () => `/v1/events/${e()}/volunteers/${v()}/reminders?token=${encodeURIComponent(String(scalar()))}`],

    ['PUT', () => `/v1/events/${e()}/activities/${a()}/windows/${w()}/volunteers/${v()}`],
    ['DELETE', () => `/v1/events/${e()}/activities/${a()}/windows/${w()}/volunteers/${v()}`],

    ['POST', () => '/v1/users', () => fuzzBody({ email: `f${Math.floor(rnd() * 1e9)}@example.com`, pubkey: 'AAAA', generateMFA: false })],
    ['GET', () => `/v1/users/${id()}`],
    ['PATCH', () => `/v1/users/${id()}`, () => fuzzBody({ email: 'x@y.co' })],
    ['DELETE', () => `/v1/users/${id()}`],
    ['POST', () => `/v1/users/${id()}`, () => fuzzBody({ token: String(scalar()), pubkey: 'AAAA' })],
    ['PUT', () => `/v1/users/${id()}`, () => fuzzBody({ token: String(scalar()) })],
  ];
}

/** Authorization headers, mostly malformed on purpose. */
function fuzzAuthHeader() {
  if (chance(0.6)) return null;
  return pick([
    'AXB-SIG-REQ',
    'AXB-SIG-REQ ',
    'AXB-SIG-REQ not-base64!!',
    `AXB-SIG-REQ ${Buffer.from('{}').toString('base64')}`,
    `AXB-SIG-REQ ${Buffer.from('{"creds":"{}","sig":"AAAA"}').toString('base64')}`,
    `AXB-SIG-REQ ${Buffer.from('{"creds":"{\\"email\\":\\"x@y.co\\",\\"mfa\\":\\"\\"}","sig":"AAAA"}').toString('base64')}`,
    'Bearer something',
    'AXB-SIG-REQ a b c',
    `AXB-SIG-REQ ${'A'.repeat(8192)}`,
  ]);
}

/**
 * Nothing is exempt.
 *
 * There used to be an allow-list here for two documented 500s -- a window
 * beginning after it ends, and a volunteer POST omitting `rsvps`. Both were
 * client errors the server reported as its own fault, and both are now fixed,
 * so the allow-list is gone. Testing against a list of tolerated crashes is a
 * slow way to stop noticing crashes; it also disagreed with the stack-trace
 * check in run.sh, which failed the suite on exactly those responses.
 */

/** Seed one real event so the fuzzer spends most of its time on live ids. */
async function seedContext() {
  const res = await fetch(`${API}/v1/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shortDescription: 'Fuzz Seed Event',
      longDescription: 'seed',
      emailOnSubmission: false,
      allowMultiUserSignups: true,
      activities: [{ shortDescription: 'Seed Activity', priority: 0, slots: [{ enabled: true, window: 0 }] }],
      windows: [{ beginTime: String(Date.now() + 86400000), endTime: String(Date.now() + 90000000) }],
      details: [{ type: 'STRING', label: 'Seed Field', priority: 0, required: false }],
    }),
  });
  if (!res.ok) {
    console.error(`  could not seed a real event (${res.status}); fuzzing with synthetic ids only`);
    return {};
  }
  const body = await res.json();
  const event = body.event ?? {};
  return {
    eventId: event.id,
    activityId: event.activities?.[0]?.id,
    windowId: event.windows?.[0]?.id,
    detailId: event.details?.[0]?.id,
  };
}

async function main() {
  console.log(`  target      ${API}`);
  console.log(`  seed        ${SEED}   (replay with FUZZ_SEED=${SEED})`);
  console.log('  note        seeded ids differ per database, so a replay follows a');
  console.log('              similar but not identical path; findings print their');
  console.log('              full request so any one can be reproduced by hand');
  console.log(`  iterations  ${ITERATIONS}`);

  const ctx = await seedContext();
  if (ctx.eventId) console.log(`  seeded      event ${ctx.eventId}`);

  const ops = operations(ctx);
  const findings = [];
  const statusCounts = new Map();

  for (let i = 0; i < ITERATIONS; i++) {
    const [method, pathFn, bodyFn] = pick(ops);
    const path = pathFn();
    const body = bodyFn ? bodyFn() : undefined;

    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const auth = fuzzAuthHeader();
    if (auth) headers.Authorization = auth;
    if (chance(0.1)) headers['X-CAPTCHA-TOKEN'] = transportSafe(scalar());

    let res;
    let text;
    try {
      res = await fetch(`${API}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      text = await res.text();
    } catch (e) {
      findings.push({ kind: 'transport', method, path, body, detail: e.message });
      continue;
    }

    statusCounts.set(res.status, (statusCounts.get(res.status) ?? 0) + 1);

    // Envelope shape. The report and texts endpoints are deliberately not JSON.
    const expectsJson = !/\/report$|\/texts\//.test(path.split('?')[0]);
    let parsed = null;
    if (expectsJson) {
      try {
        parsed = JSON.parse(text);
      } catch {
        // The application only ever emits JSON, so an HTML body means the
        // container answered before the app was reached: Spark's own 404 when
        // no route matches (an empty path segment, say -- the same missing
        // catch-all that rules out path routing for the frontend), or Jetty
        // rejecting an oversized header with a 431. Both are correct.
        //
        // An HTML 5xx is a different matter: that would be a crash page, and
        // still counts.
        const containerLevel = res.status < 500 && /<h1>|<html>/i.test(text);
        if (!containerLevel) {
          findings.push({ kind: 'non-json', method, path, body, status: res.status, detail: text.slice(0, 200) });
        }
        continue;
      }
      if (typeof parsed?.status !== 'string') {
        findings.push({ kind: 'bad-envelope', method, path, body, status: res.status, detail: text.slice(0, 200) });
      }
    }

    if (res.status >= 500) {
      findings.push({ kind: 'server-error', method, path, body, status: res.status, detail: parsed?.info ?? text.slice(0, 200) });
    }
  }

  console.log('\n  status distribution:');
  for (const [status, n] of [...statusCounts.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`    ${status}  ${'#'.repeat(Math.min(40, Math.ceil(n / 2)))} ${n}`);
  }

  // Liveness: the whole point is that none of the above wedged the server.
  const alive = await fetch(`${API}/v1`).then((r) => r.ok).catch(() => false);
  if (!alive) {
    console.error('\n  the server is no longer responding');
    process.exit(1);
  }

  if (findings.length === 0) {
    console.log(`\n  no findings in ${ITERATIONS} requests; server still healthy`);
    return;
  }

  console.error(`\n  ${findings.length} finding(s):\n`);
  // Group so one systemic bug does not print four hundred times.
  const grouped = new Map();
  for (const f of findings) {
    const key = `${f.kind} ${f.method} ${f.path.split('?')[0].replace(/[0-9a-f-]{8,}/gi, ':id')}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(f);
  }
  for (const [key, items] of grouped) {
    console.error(`  ${key}  (x${items.length})`);
    console.error(`    status: ${items[0].status ?? 'n/a'}  detail: ${String(items[0].detail).slice(0, 160)}`);
    console.error(`    body:   ${JSON.stringify(items[0].body)?.slice(0, 200)}`);
  }
  console.error(`\n  replay with FUZZ_SEED=${SEED} (approximate; see the note above)`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
