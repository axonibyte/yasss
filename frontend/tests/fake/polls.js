/**
 * Poll routes for the fake API.
 *
 * Kept out of `server.js` because that file is already long, and because polls
 * are a whole resource rather than a few more endpoints on an existing one.
 *
 * Modeled on the real server rather than on whatever the specs happen to need
 * -- the point of the fake is to catch places where the frontend and the Java
 * server disagree, so the shapes that are easy to get wrong are reproduced
 * faithfully:
 *
 * - PRESENCE ENABLES a square, the opposite of the event side's slot rule.
 * - The tally is ABSENT from the payload when it is not disclosed, rather than
 *   present and zeroed. A spec that asserts a hidden tally has to be able to
 *   tell those apart.
 * - Enums travel as names, and the deadline travels as a string.
 */
import { normalizeCode } from '../../src/lib/eventCode.js';

const ok = (info, payload = {}) => ({ status: 'ok', info, ...payload });
const err = (info) => ({ status: 'error', info });

const nextId = (store, prefix) => `${prefix}-${String(++store.seq).padStart(4, '0')}`;

/** Crockford-ish, and unique within the fake's own namespace. */
function mintCode(store) {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  for (;;) {
    let code = '';
    for (let i = 0; i < 8; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    if (store.codes.has(code)) continue;
    return code;
  }
}

function resolvePoll(store, raw) {
  const direct = store.polls.get(raw);
  if (direct) return direct;
  const code = normalizeCode(raw);
  if (!code) return undefined;
  return [...store.polls.values()].find((p) => normalizeCode(p.code) === code);
}

const isClosed = (poll) => poll.responseDeadline != null && Number(poll.responseDeadline) < Date.now();

/** The real rule, transcribed. See `Poll.tallyVisible`. */
function tallyVisible(poll, owner, responded) {
  if (owner) return true;
  switch (poll.resultVisibility) {
    case 'PUBLIC_ALWAYS': return true;
    case 'PUBLIC_AFTER_CLOSE': return isClosed(poll);
    case 'RESPONDENT_ALL_AFTER_SUBMIT': return responded;
    case 'RESPONDENT_ALL_AFTER_CLOSE': return responded && isClosed(poll);
    default: return false;
  }
}

const votableIds = (poll) => {
  const byId = new Map(poll.options.map((o) => [o.id, o]));
  return new Set(
    poll.cells
      .filter((cell) => byId.get(cell.option)?.allDay === (cell.window == null))
      .map((cell) => cell.id),
  );
};

function serializePoll(poll, { owner, responded, own }) {
  const body = {
    id: poll.id,
    admin: poll.admin,
    shortDescription: poll.shortDescription,
    longDescription: poll.longDescription,
    scope: poll.scope,
    timeMode: poll.timeMode,
    timezone: poll.timezone,
    responseDeadline: poll.responseDeadline == null ? null : String(poll.responseDeadline),
    allowMultiAnswers: poll.allowMultiAnswers,
    allowAnswerEdits: poll.allowAnswerEdits,
    resultVisibility: poll.resultVisibility,
    isPublished: true,
    code: poll.code,
    closed: isClosed(poll),
    requiresAuthenticatedAnswers: poll.resultVisibility === 'RESPONDENT_ALL_AFTER_CLOSE',
    options: poll.options,
    windows: poll.windows,
    details: poll.details,
    cells: poll.cells.map((cell) => ({ ...cell, allDay: cell.window == null })),
  };

  if (tallyVisible(poll, owner, responded)) {
    const byCell = {};
    for (const response of poll.responses) {
      for (const cell of response.votes) byCell[cell] = (byCell[cell] ?? 0) + 1;
    }
    body.tally = { respondents: poll.responses.length, byCell };
  }

  if (owner) {
    body.responses = poll.responses.map((r) => ({
      id: r.id, name: r.name, submitted: String(r.submitted), votes: r.votes, details: r.details,
    }));
  } else if (own) {
    body.yourResponse = {
      id: own.id, name: own.name, submitted: String(own.submitted), votes: own.votes,
      details: own.details,
    };
  }

  return body;
}

/**
 * @param {import('hono').Hono} app
 * @param {object} store
 */
export function registerPollRoutes(app, store) {
  const ownResponse = (c, poll) => {
    const actor = c.get('actor');
    const token = c.req.query('token');
    return poll.responses.find(
      (r) => (actor && r.user === actor.id) || (token && r.editToken === token),
    ) ?? null;
  };
  const isOwner = (c, poll) => {
    const actor = c.get('actor');
    return Boolean(actor && poll.admin && actor.id === poll.admin);
  };

  // --- the shared code box -------------------------------------------------

  app.get('/v1/codes/:code', (c) => {
    const code = normalizeCode(c.req.param('code'));
    if (!code) return c.json(err('code not found'), 404);

    const poll = [...store.polls.values()].find((p) => normalizeCode(p.code) === code);
    if (poll) return c.json(ok('successfully resolved code', { kind: 'poll', id: poll.id }));

    const event = [...store.events.values()].find((e) => normalizeCode(e.code) === code);
    if (event) return c.json(ok('successfully resolved code', { kind: 'event', id: event.id }));

    return c.json(err('code not found'), 404);
  });

  // --- polls ---------------------------------------------------------------

  app.post('/v1/polls', async (c) => {
    const body = await c.req.json();
    if (!body.shortDescription?.trim()) {
      return c.json(err('malformed argument (string: shortDescription)'), 400);
    }
    if (!(body.options ?? []).length) return c.json(err('malformed argument (options)'), 400);
    if (!(body.windows ?? []).length) return c.json(err('malformed argument (windows)'), 400);

    const options = body.options.map((o) => ({
      id: nextId(store, 'option'),
      dayOfWeek: o.dayOfWeek ?? null,
      date: o.date ?? null,
      allDay: Boolean(o.allDay),
      priority: o.priority ?? 0,
    }));
    const windows = body.windows.map((w) => ({
      id: nextId(store, 'pwindow'),
      startTime: w.startTime,
      appliesToNewOptions: Boolean(w.appliesToNewOptions),
    }));
    const details = (body.details ?? []).map((d) => ({
      id: nextId(store, 'pdetail'),
      type: d.type,
      label: d.label,
      hint: d.hint ?? '',
      required: Boolean(d.required),
      priority: d.priority ?? 0,
    }));

    // Presence enables. An unlisted pair is simply not offered -- the opposite
    // of the slot rule a few hundred lines away in server.js.
    const cells = (body.cells ?? []).map((cell) => ({
      id: nextId(store, 'pcell'),
      option: options[cell.option]?.id,
      window: cell.window == null ? null : windows[cell.window]?.id,
    })).filter((cell) => cell.option !== undefined);

    const code = mintCode(store);
    store.codes.add(code);

    const id = nextId(store, 'poll');
    store.polls.set(id, {
      id,
      admin: body.admin ?? null,
      shortDescription: body.shortDescription,
      longDescription: body.longDescription ?? '',
      scope: body.scope ?? 'RELATIVE',
      timeMode: body.timeMode ?? 'WALL_CLOCK',
      timezone: body.timezone ?? null,
      responseDeadline: body.responseDeadline ?? null,
      allowMultiAnswers: body.allowMultiAnswers !== false,
      allowAnswerEdits: body.allowAnswerEdits !== false,
      resultVisibility: body.resultVisibility ?? 'CREATOR_ONLY',
      code,
      options,
      windows,
      details,
      cells,
      responses: [],
    });

    const poll = store.polls.get(id);
    return c.json(
      ok('successfully created poll', {
        poll: serializePoll(poll, { owner: true, responded: false, own: null }),
      }),
      201,
    );
  });

  app.get('/v1/polls/:id', (c) => {
    const poll = resolvePoll(store, c.req.param('id'));
    if (!poll) return c.json(err('poll not found'), 404);
    const own = ownResponse(c, poll);
    return c.json(ok('successfully retrieved poll', {
      poll: serializePoll(poll, { owner: isOwner(c, poll), responded: Boolean(own), own }),
    }));
  });

  app.patch('/v1/polls/:id', async (c) => {
    const poll = resolvePoll(store, c.req.param('id'));
    if (!poll) return c.json(err('poll not found'), 404);
    const body = await c.req.json();

    if (body.shortDescription !== undefined) poll.shortDescription = body.shortDescription;
    if (body.longDescription !== undefined) poll.longDescription = body.longDescription;
    if (body.timeMode !== undefined) poll.timeMode = body.timeMode;
    // An explicit null clears these; `undefined` means untouched.
    if ('timezone' in body) poll.timezone = body.timezone;
    if ('responseDeadline' in body) poll.responseDeadline = body.responseDeadline;
    if (body.allowMultiAnswers !== undefined) poll.allowMultiAnswers = body.allowMultiAnswers;
    if (body.allowAnswerEdits !== undefined) poll.allowAnswerEdits = body.allowAnswerEdits;
    if (body.resultVisibility !== undefined) poll.resultVisibility = body.resultVisibility;
    if (body.scope !== undefined) return c.json(err('unexpected argument (scope)'), 400);

    return c.json(ok('successfully updated poll', {
      poll: serializePoll(poll, { owner: true, responded: false, own: null }),
    }));
  });

  app.delete('/v1/polls/:id', (c) => {
    const poll = resolvePoll(store, c.req.param('id'));
    if (!poll) return c.json(err('poll not found'), 404);
    store.polls.delete(poll.id);
    store.codes.delete(poll.code);
    return c.json(ok('successfully deleted poll'));
  });

  // --- columns, rows, questions, squares -----------------------------------

  app.post('/v1/polls/:id/options', async (c) => {
    const poll = resolvePoll(store, c.req.param('id'));
    if (!poll) return c.json(err('poll not found'), 404);
    const body = await c.req.json();

    const clash = poll.options.some((o) => (
      poll.scope === 'RELATIVE' ? o.dayOfWeek === body.dayOfWeek : o.date === body.date
    ));
    if (clash) return c.json(err('that day is already on this poll'), 409);

    const option = {
      id: nextId(store, 'option'),
      dayOfWeek: body.dayOfWeek ?? null,
      date: body.date ?? null,
      allDay: Boolean(body.allDay),
      priority: body.priority ?? poll.options.length,
    };
    poll.options.push(option);

    // The standing rule, applied by the server as the real one does.
    for (const win of poll.windows) {
      if (!win.appliesToNewOptions) continue;
      poll.cells.push({ id: nextId(store, 'pcell'), option: option.id, window: win.id });
    }
    if (option.allDay) {
      poll.cells.push({ id: nextId(store, 'pcell'), option: option.id, window: null });
    }

    return c.json(ok('successfully created option', { option }), 201);
  });

  app.patch('/v1/polls/:id/options/:option', async (c) => {
    const poll = resolvePoll(store, c.req.param('id'));
    const option = poll?.options.find((o) => o.id === c.req.param('option'));
    if (!option) return c.json(err('option not found'), 404);
    const body = await c.req.json();

    if (body.priority !== undefined) option.priority = body.priority;
    if (body.allDay !== undefined && body.allDay !== option.allDay) {
      option.allDay = body.allDay;
      // Non-destructive: the timed squares stay put, so unticking restores them.
      if (option.allDay) {
        poll.cells.push({ id: nextId(store, 'pcell'), option: option.id, window: null });
      } else {
        poll.cells = poll.cells.filter((cell) => !(cell.option === option.id && cell.window == null));
      }
    }
    return c.json(ok('successfully updated option', { option }));
  });

  app.delete('/v1/polls/:id/options/:option', (c) => {
    const poll = resolvePoll(store, c.req.param('id'));
    if (!poll) return c.json(err('poll not found'), 404);
    const optionId = c.req.param('option');
    poll.options = poll.options.filter((o) => o.id !== optionId);
    poll.cells = poll.cells.filter((cell) => cell.option !== optionId);
    return c.json(ok('successfully deleted option'));
  });

  app.post('/v1/polls/:id/windows', async (c) => {
    const poll = resolvePoll(store, c.req.param('id'));
    if (!poll) return c.json(err('poll not found'), 404);
    const body = await c.req.json();

    if (poll.windows.some((w) => w.startTime === body.startTime)) {
      return c.json(err('that time is already on this poll'), 409);
    }

    const win = {
      id: nextId(store, 'pwindow'),
      startTime: body.startTime,
      appliesToNewOptions: Boolean(body.appliesToNewOptions),
    };
    poll.windows.push(win);
    poll.windows.sort((a, b) => a.startTime.localeCompare(b.startTime));

    // Absent `applyTo` means every column; an explicit empty array means none.
    const wanted = body.applyTo === undefined
      ? poll.options.map((o) => o.id)
      : body.applyTo;
    for (const optionId of wanted) {
      if (!poll.options.some((o) => o.id === optionId)) return c.json(err('option not found'), 404);
      poll.cells.push({ id: nextId(store, 'pcell'), option: optionId, window: win.id });
    }

    return c.json(ok('successfully created window', { window: win }), 201);
  });

  app.patch('/v1/polls/:id/windows/:window', async (c) => {
    const poll = resolvePoll(store, c.req.param('id'));
    const win = poll?.windows.find((w) => w.id === c.req.param('window'));
    if (!win) return c.json(err('window not found'), 404);
    const body = await c.req.json();
    if (body.startTime !== undefined) win.startTime = body.startTime;
    if (body.appliesToNewOptions !== undefined) win.appliesToNewOptions = body.appliesToNewOptions;
    poll.windows.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return c.json(ok('successfully updated window', { window: win }));
  });

  app.delete('/v1/polls/:id/windows/:window', (c) => {
    const poll = resolvePoll(store, c.req.param('id'));
    if (!poll) return c.json(err('poll not found'), 404);
    const windowId = c.req.param('window');
    poll.windows = poll.windows.filter((w) => w.id !== windowId);
    poll.cells = poll.cells.filter((cell) => cell.window !== windowId);
    return c.json(ok('successfully deleted window'));
  });

  app.post('/v1/polls/:id/details', async (c) => {
    const poll = resolvePoll(store, c.req.param('id'));
    if (!poll) return c.json(err('poll not found'), 404);
    const body = await c.req.json();
    const detail = {
      id: nextId(store, 'pdetail'),
      type: body.type,
      label: body.label,
      hint: body.hint ?? '',
      required: Boolean(body.required),
      priority: body.priority ?? poll.details.length,
    };
    poll.details.push(detail);
    return c.json(ok('successfully created detail', { detail }), 201);
  });

  app.patch('/v1/polls/:id/details/:detail', async (c) => {
    const poll = resolvePoll(store, c.req.param('id'));
    const detail = poll?.details.find((d) => d.id === c.req.param('detail'));
    if (!detail) return c.json(err('detail not found'), 404);
    Object.assign(detail, await c.req.json());
    return c.json(ok('successfully updated detail', { detail }));
  });

  app.delete('/v1/polls/:id/details/:detail', (c) => {
    const poll = resolvePoll(store, c.req.param('id'));
    if (!poll) return c.json(err('poll not found'), 404);
    poll.details = poll.details.filter((d) => d.id !== c.req.param('detail'));
    return c.json(ok('successfully deleted detail'));
  });

  app.put('/v1/polls/:id/options/:option/windows/:window', (c) => {
    const poll = resolvePoll(store, c.req.param('id'));
    if (!poll) return c.json(err('poll not found'), 404);
    const optionId = c.req.param('option');
    const windowId = c.req.param('window');
    const option = poll.options.find((o) => o.id === optionId);
    if (!option) return c.json(err('option not found'), 404);
    if (option.allDay) return c.json(err('that day is set to all day'), 409);

    const existing = poll.cells.find((cell) => cell.option === optionId && cell.window === windowId);
    const cell = existing ?? { id: nextId(store, 'pcell'), option: optionId, window: windowId };
    if (!existing) poll.cells.push(cell);
    return c.json(ok('successfully set cell', { cell }), existing ? 200 : 201);
  });

  app.delete('/v1/polls/:id/options/:option/windows/:window', (c) => {
    const poll = resolvePoll(store, c.req.param('id'));
    if (!poll) return c.json(err('poll not found'), 404);
    poll.cells = poll.cells.filter(
      (cell) => !(cell.option === c.req.param('option') && cell.window === c.req.param('window')),
    );
    return c.json(ok('successfully unset cell'));
  });

  // --- answers -------------------------------------------------------------

  app.post('/v1/polls/:id/responses', async (c) => {
    const poll = resolvePoll(store, c.req.param('id'));
    if (!poll) return c.json(err('poll not found'), 404);
    if (isClosed(poll)) return c.json(err('poll closed'), 412);

    const body = await c.req.json();
    if (!body.name?.trim()) return c.json(err('malformed argument (string: name)'), 400);

    const votable = votableIds(poll);
    for (const cellId of body.votes ?? []) {
      if (!votable.has(cellId)) return c.json(err('cell not found'), 404);
    }
    for (const detail of poll.details) {
      if (!detail.required) continue;
      const given = (body.details ?? []).find((d) => d.detail === detail.id);
      if (!given) return c.json(err(`missing argument (details[${detail.id}].value)`), 400);
    }

    const actor = c.get('actor');

    // The identity rule, transcribed: an account is matched on its own, and an
    // anonymous caller on address or fingerprint. The fake has one address, so
    // an anonymous repeat is a repeat.
    if (!poll.allowMultiAnswers && !(actor && poll.admin === actor.id)) {
      const already = poll.responses.some((r) => (
        actor ? r.user === actor.id : (!r.user && (r.fingerprint === body.fingerprint || !body.fingerprint))
      ));
      if (already) return c.json(err('already answered'), 412);
    }

    const response = {
      id: nextId(store, 'presponse'),
      user: actor?.id ?? null,
      name: body.name,
      votes: body.votes ?? [],
      details: body.details ?? [],
      fingerprint: body.fingerprint ?? null,
      editToken: crypto.randomUUID(),
      submitted: Date.now(),
    };
    poll.responses.push(response);

    return c.json(ok('successfully recorded response', {
      response: {
        id: response.id, name: response.name, submitted: String(response.submitted),
        votes: response.votes, details: response.details, editToken: response.editToken,
      },
    }), 201);
  });

  app.patch('/v1/polls/:id/responses/:response', async (c) => {
    const poll = resolvePoll(store, c.req.param('id'));
    const response = poll?.responses.find((r) => r.id === c.req.param('response'));
    if (!response) return c.json(err('response not found'), 404);

    const actor = c.get('actor');
    const token = c.req.query('token');
    const mine = (actor && response.user === actor.id) || (token && response.editToken === token);
    const owner = Boolean(actor && poll.admin && actor.id === poll.admin);
    if (!mine && !owner) return c.json(err('access denied'), 403);
    if (!poll.allowAnswerEdits && !owner) {
      return c.json(err('this poll does not allow answers to be changed'), 403);
    }
    if (isClosed(poll)) return c.json(err('poll closed'), 412);

    const body = await c.req.json();
    if (body.name !== undefined) response.name = body.name;
    if (body.votes !== undefined) response.votes = body.votes;
    if (body.details !== undefined) response.details = body.details;

    return c.json(ok('successfully updated response', {
      response: {
        id: response.id, name: response.name, submitted: String(response.submitted),
        votes: response.votes, details: response.details,
      },
    }));
  });

  app.delete('/v1/polls/:id/responses/:response', (c) => {
    const poll = resolvePoll(store, c.req.param('id'));
    if (!poll) return c.json(err('poll not found'), 404);
    poll.responses = poll.responses.filter((r) => r.id !== c.req.param('response'));
    return c.json(ok('successfully deleted response'));
  });

  app.get('/v1/polls', (c) => {
    const actor = c.get('actor');
    const admin = c.req.query('admin');
    if (!admin || !actor || actor.id !== admin) return c.json(err('access denied'), 403);
    const polls = [...store.polls.values()].filter((p) => p.admin === admin);
    return c.json(ok('successfully retrieved polls', {
      polls: polls.map((p) => ({
        id: p.id, admin: p.admin, shortDescription: p.shortDescription,
        longDescription: p.longDescription, scope: p.scope, code: p.code,
        isPublished: true, closed: isClosed(p),
        responseDeadline: p.responseDeadline == null ? null : String(p.responseDeadline),
      })),
      total: polls.length,
    }));
  });
}
