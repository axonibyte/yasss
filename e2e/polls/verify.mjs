/**
 * Polls, end to end, against the real server and the real database.
 *
 * The browser suite covers what the UI does with a poll. This covers what only
 * the real stack can answer, which is where polls differ most sharply from
 * events:
 *
 *   - the schema, which is where the all-day square lives and where a composite
 *     key would silently have permitted duplicates (migration 029);
 *   - the shared short-code namespace, which no unit test can exercise because
 *     the guarantee is a unique index across two tables (032);
 *   - the duplicate-answer rule, which is a lock, a count and an insert in one
 *     transaction and is decorative if any of the three is wrong;
 *   - result visibility, which must omit the tally from the payload rather than
 *     rely on a client not to render it.
 *
 * Env: YASSS_API, YASSS_ADMIN_EMAIL, YASSS_ADMIN_PASSWORD.
 */
import { isUnhandled, makeApi } from '../lib/api.mjs';
import { check, finish } from '../lib/check.mjs';
import { adminAuth } from '../lib/creds.mjs';

const api = makeApi();
const auth = await adminAuth();

/**
 * The bootstrap administrator, exported by run.sh.
 *
 * Needed because CREATOR_ONLY is refused on a poll with no owner -- there would
 * be nobody the results were ever visible to -- so the visibility case has to
 * create an owned poll rather than an anonymous one.
 */
const adminID = process.env.YASSS_ADMIN_ID ?? null;

function sane(res, what) {
  if (res.status >= 500) {
    return check(false, what, `${res.status}: ${JSON.stringify(res.payload ?? res.text)}`);
  }
  if (isUnhandled(res)) {
    return check(false, `${what} (unhandled exception)`, JSON.stringify(res.payload));
  }
  return true;
}

const inAWeek = () => String(Date.now() + 7 * 86400_000);

/** A relative poll with two days, one time, and both squares offered. */
async function createPoll(overrides = {}) {
  const body = {
    shortDescription: 'When shall we meet?',
    longDescription: 'Pick every time that works.',
    scope: 'RELATIVE',
    resultVisibility: 'PUBLIC_ALWAYS',
    options: [{ dayOfWeek: 1 }, { dayOfWeek: 3 }],
    windows: [{ startTime: '09:00' }],
    cells: [{ option: 0, window: 0 }, { option: 1, window: 0 }],
    ...overrides,
  };
  const res = await api('POST', '/v1/polls', { body, auth });
  return res;
}

// --- the graph --------------------------------------------------------------

console.log('\nthe whole graph in one request');

{
  const res = await createPoll();
  sane(res, 'create a poll');
  check(res.status === 201, 'a poll is created', `status ${res.status}`);

  const poll = res.payload?.poll;
  check(poll?.code?.length === 8, 'it is given an eight-character code', poll?.code);
  check(poll?.options?.length === 2, 'both days landed');
  check(poll?.windows?.length === 1, 'the time landed');
  check(poll?.cells?.length === 2, 'both squares landed', JSON.stringify(poll?.cells));
}

// PRESENCE ENABLES. The opposite of the event slot rule, and the assertion that
// would have caught it being implemented the other way round.
{
  const res = await createPoll({ cells: [{ option: 0, window: 0 }] });
  const poll = res.payload?.poll;
  check(poll?.cells?.length === 1,
    'a square that is not sent is not offered', `got ${poll?.cells?.length}`);
}

// --- the all-day square -----------------------------------------------------

console.log('\nthe all-day square');

{
  const res = await createPoll({
    options: [{ dayOfWeek: 1, allDay: true }],
    cells: [{ option: 0 }],
  });
  const poll = res.payload?.poll;
  const allDay = poll?.cells?.filter((c) => c.window === null) ?? [];
  check(allDay.length === 1, 'an all-day column has exactly one all-day square');

  // The trap migration 029 exists for: with a composite key over a nullable
  // column, this second one would be accepted and the tally would inflate.
  const again = await api('POST', `/v1/polls/${poll.id}/options`, {
    body: { dayOfWeek: 1, allDay: true }, auth,
  });
  check(again.status === 409, 'a duplicate weekday is refused', `status ${again.status}`);
}

// --- the shared code namespace ----------------------------------------------

console.log('\none namespace for every short code');

{
  const poll = (await createPoll()).payload?.poll;
  const res = await api('GET', `/v1/codes/${poll.code}`);
  sane(res, 'resolve a poll code');
  check(res.payload?.kind === 'poll', 'a poll code resolves as a poll', res.payload?.kind);
  check(res.payload?.id === poll.id, 'and names the right poll');

  // Hyphenated and lower case, the way a human types one off a flyer.
  const pretty = `${poll.code.slice(0, 4)}-${poll.code.slice(4)}`.toLowerCase();
  const spelled = await api('GET', `/v1/codes/${pretty}`);
  check(spelled.payload?.id === poll.id, 'any spelling of it resolves the same');

  const missing = await api('GET', '/v1/codes/ZZZZZZZZ');
  check(missing.status === 404, 'a code nobody holds is a 404', `status ${missing.status}`);
}

// --- one answer each --------------------------------------------------------

console.log('\none answer each');

{
  const poll = (await createPoll({ allowMultiAnswers: false })).payload?.poll;
  const cell = poll.cells[0].id;

  // Anonymous, so the address and fingerprint branch applies. The admin is
  // exempt, which is why these go unauthenticated.
  const first = await api('POST', `/v1/polls/${poll.id}/responses`, { body: { name: 'Ada', votes: [cell] } });
  sane(first, 'first anonymous answer');
  check(first.status === 201, 'the first answer is recorded', `status ${first.status}`);

  const second = await api('POST', `/v1/polls/${poll.id}/responses`, { body: { name: 'Ada again', votes: [cell] } });
  check(second.status === 412, 'the second is refused', `status ${second.status}`);
  check(second.payload?.info === 'already answered', 'and says why', second.payload?.info);
}

{
  const poll = (await createPoll({ allowMultiAnswers: true })).payload?.poll;
  const cell = poll.cells[0].id;
  const a = await api('POST', `/v1/polls/${poll.id}/responses`, { body: { name: 'One', votes: [cell] } });
  const b = await api('POST', `/v1/polls/${poll.id}/responses`, { body: { name: 'Two', votes: [cell] } });
  check(a.status === 201 && b.status === 201,
    'a poll that permits several accepts several', `${a.status}/${b.status}`);
}

// A browser that produces no digest must still be able to answer.
{
  const poll = (await createPoll({ allowMultiAnswers: false })).payload?.poll;
  const res = await api('POST', `/v1/polls/${poll.id}/responses`, { body: { name: 'No canvas', votes: [], fingerprint: '' } });
  check(res.status === 201, 'a blank fingerprint is "none", not malformed',
    `status ${res.status}`);

  const bad = await api('POST', `/v1/polls/${poll.id}/responses`, { body: { name: 'Nonsense', votes: [], fingerprint: 'wat' } });
  check(bad.status === 400, 'but nonsense is refused', `status ${bad.status}`);
}

// --- deadlines --------------------------------------------------------------

console.log('\ndeadlines');

{
  const past = String(Date.now() - 3600_000);
  const poll = (await createPoll({
    responseDeadline: past, resultVisibility: 'PUBLIC_AFTER_CLOSE',
  })).payload?.poll;
  check(poll?.closed === true, 'a poll past its deadline reports closed');

  const late = await api('POST', `/v1/polls/${poll.id}/responses`, { body: { name: 'Late', votes: [] } });
  check(late.status === 412, 'answering it is refused', `status ${late.status}`);

  // The organiser must still be able to extend it, or a closed poll could never
  // be reopened -- which is why ModifyPollEndpoint has no closed check.
  const reopen = await api('PATCH', `/v1/polls/${poll.id}`, { body: { responseDeadline: inAWeek() }, auth });
  check(reopen.status === 200 && reopen.payload?.poll?.closed === false,
    'but the organiser can extend the deadline', `status ${reopen.status}`);
}

// --- result visibility ------------------------------------------------------

console.log('\nresult visibility is enforced in the payload');

{
  const created = await createPoll({ resultVisibility: 'CREATOR_ONLY', admin: adminID });
  sane(created, 'create a creator-only poll');
  const poll = created.payload?.poll;
  check(Boolean(poll), 'an owned poll may be creator-only', JSON.stringify(created.payload));
  await api('POST', `/v1/polls/${poll.id}/responses`, { body: { name: 'Ada', votes: [poll.cells[0].id] } });

  const stranger = await api('GET', `/v1/polls/${poll.id}`);
  check(stranger.payload?.poll?.tally === undefined,
    'CREATOR_ONLY omits the tally entirely for a stranger',
    JSON.stringify(stranger.payload?.poll?.tally));

  const owner = await api('GET', `/v1/polls/${poll.id}`, { auth });
  check(owner.payload?.poll?.tally !== undefined, 'and gives it to the organiser');
}

{
  const poll = (await createPoll({ resultVisibility: 'PUBLIC_ALWAYS' })).payload?.poll;
  const stranger = await api('GET', `/v1/polls/${poll.id}`);
  check(stranger.payload?.poll?.tally !== undefined, 'PUBLIC_ALWAYS discloses it');
}

// --- settings that contradict each other ------------------------------------

console.log('\ncombinations that cannot mean anything');

for (const [label, body] of [
  ['after-close results with no deadline', { resultVisibility: 'PUBLIC_AFTER_CLOSE' }],
  ['creator-only results with no creator', { resultVisibility: 'CREATOR_ONLY' }],
  ['a zone on a wall-clock poll', { timezone: 'America/Chicago' }],
  ['zoned with no zone', { timeMode: 'ZONED' }],
]) {
  const res = await createPoll(body);
  check(res.status === 400, `refused: ${label}`, `status ${res.status}`);
}

// --- deletion ---------------------------------------------------------------

console.log('\ndeleting a poll takes everything with it');

{
  const poll = (await createPoll({ allowMultiAnswers: false })).payload?.poll;
  await api('POST', `/v1/polls/${poll.id}/responses`, { body: { name: 'Ada', votes: [poll.cells[0].id] } });

  const gone = await api('DELETE', `/v1/polls/${poll.id}`, { auth });
  check(gone.status === 200, 'the poll is deleted', `status ${gone.status}`);

  const read = await api('GET', `/v1/polls/${poll.id}`);
  check(read.status === 404, 'and is gone', `status ${read.status}`);

  // The code is released rather than stranded, which is what stops the
  // namespace leaking one entry per deleted poll.
  const code = await api('GET', `/v1/codes/${poll.code}`);
  check(code.status === 404, 'and its code is released', `status ${code.status}`);
}

finish('polls');
