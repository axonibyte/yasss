/**
 * A minimal HTTP client for the drivers.
 *
 * Built on global `fetch` with no dependencies, because these run in a bare
 * node:22-slim container with only the repo mounted -- there is no install step
 * and nothing to install from.
 *
 * `text` is returned alongside `payload` because not every endpoint answers
 * JSON: `GET /v1/events/:id/report` returns HTML, and the escaping assertions
 * need the bytes rather than a parse of them.
 */

/** Binds a base URL and returns the request helper. */
export function makeApi(base = process.env.YASSS_API ?? 'http://127.0.0.1:7455') {
  return async function api(method, path, { body, auth, session, query = '', headers = {} } = {}) {
    const hdrs = { ...headers };
    if (body !== undefined) hdrs['Content-Type'] = 'application/json';
    // A password credential. Static once derived -- but only GET /v1 accepts one now,
    // so a driver that sends it anywhere else gets an anonymous response rather than an
    // authenticated one. Sign in first and pass `session` instead.
    if (auth) hdrs.Authorization = `AXB-SIG-REQ ${auth}`;
    // A session ticket goes in the same header; the server tells the two apart
    // by which one verifies. Passed separately so a driver cannot accidentally
    // send both and not know which one it is actually testing.
    else if (session) hdrs.Authorization = `AXB-SIG-REQ ${session}`;

    const res = await fetch(`${base}${path}${query}`, {
      method,
      headers: hdrs,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await res.text();
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      // Not JSON. That is legitimate for the report endpoint and interesting
      // everywhere else, which is why `text` is returned either way.
    }

    return {
      status: res.status,
      payload,
      text,
      contentType: res.headers.get('content-type'),
      accessLevel: res.headers.get('axb-access-level'),
      account: res.headers.get('axb-account'),
      // The rotated ticket. Present on every authenticated response and null on
      // anonymous ones, which is what makes it the signal for "this credential
      // was accepted".
      session: res.headers.get('axb-session'),
    };
  };
}

/**
 * True when a response is the library's generic unhandled-exception catch.
 *
 * Worth distinguishing from an endpoint-authored 500 like "database
 * malfunction": this exact string, capital I and trailing period, is what
 * `Endpoint.onRequest` produces when something threw that nobody anticipated.
 * It is the reliable signal of a genuine backend bug.
 */
export const isUnhandled = (res) => res.payload?.info === 'Internal server error.';
