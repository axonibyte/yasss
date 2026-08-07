/**
 * Identity decoding for the fake API.
 *
 * The fake verifies no signatures. `creds.test.js` already owns that, against
 * committed golden vectors, and reproducing Ed25519 here would only test the
 * reproduction — scrypt at N=16384 costs seconds per derivation, so the fake
 * would have to run the KDF just to seed a user.
 *
 * What it must get right is *whose* credentials these are, and that is
 * recoverable from the payload itself. `genCreds` emits
 * `base64(JSON({creds, sig}))` where `creds` is the literal
 * `JSON.stringify({email, mfa})`; the session tokens minted here wrap
 * `base64(JSON({account, sat, iat}))`. The real server decodes exactly this way
 * — try base64 on `creds`, fall back to raw JSON (`AuthToken.java`).
 *
 * The timing claims and the envelope's `kid` are minted but never read here. The
 * fake enforces no session policy at all: expiry, the absolute lifetime and
 * `session_epoch` revocation are decided by `SessionTicket.evaluate`, which is
 * pure and exhaustively covered by `SessionTicketTest`, and the wiring is
 * covered by the live `sessions` stage. What the fake owes is the *shape*, since
 * the client round-trips this through a cookie.
 *
 * Freshness and replay are deliberately NOT enforced here. `SigReqV2Test` owns the
 * boundaries and the `sessions` stage owns the wiring; a fake that expired credentials
 * would make every spec depend on the wall clock.
 *
 * The point is that this is **per request**. What it replaces was a single
 * global `pendingLogin`, armed by a test-control endpoint and consumed
 * destructively, so under `fullyParallel: true` one worker's login could be
 * claimed by another worker's request. That is why no spec ever authenticated.
 */

const decodeJson = (b64) => JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));

/**
 * Recover the identity a credential payload or session token asserts.
 *
 * @param {string} token the value after `AXB-SIG-REQ `
 * @returns {{account: string} | {email: string} | null}
 */
export function identityOf(token) {
  let outer;
  try {
    outer = decodeJson(token);
  } catch {
    return null;
  }
  if (typeof outer?.creds !== 'string') return null;

  let creds;
  try {
    creds = decodeJson(outer.creds);
  } catch {
    // Our credential payloads carry raw JSON here, not base64 — the server
    // tries both in this order, so mirroring it keeps the fake honest.
    try {
      creds = JSON.parse(outer.creds);
    } catch {
      return null;
    }
  }

  // v2 addresses the account differently: the email travels base64url under `sub` so the
  // signed message can stay ASCII, and `acct` carries a UUID. Everything else about the
  // envelope is unchanged, which is the point of putting the version inside `creds`.
  if (creds?.v === 2) {
    if (typeof creds.acct === 'string' && creds.acct) return { account: creds.acct };
    if (typeof creds.sub === 'string' && creds.sub) {
      const padded = creds.sub.replaceAll('-', '+').replaceAll('_', '/');
      const email = Buffer.from(
        padded + '='.repeat((4 - (padded.length % 4)) % 4), 'base64').toString('utf8');
      return { email };
    }
    return null;
  }

  if (typeof creds?.account === 'string') return { account: creds.account };
  if (typeof creds?.email === 'string') return { email: creds.email };
  return null;
}

/**
 * Mint a session token in the shape the real server uses.
 *
 * Deliberately stable for a given user and signer epoch. Ed25519 signatures are
 * deterministic and the real signer only rolls on the ticket engine's refresh
 * interval, so a repeating token is what the server actually does — the
 * incrementing counter this replaces was less faithful, not more. `signerEpoch`
 * models that roll for the one spec that needs to observe a rotation.
 *
 * The shape matters beyond cosmetics: the client round-trips this token through
 * a cookie, so an opaque `session-user-7` string would not catch a client that
 * mangled a base64 token on the way through.
 */
export function sessionToken(store, userId) {
  // `sat` and `iat` are fixed rather than `Date.now()`, which is what keeps the
  // token stable for a given user and signer epoch — the property the spec that
  // observes a rotation depends on. A real ticket restamps `iat` per response;
  // nothing here reads either, so faking the stamp buys nothing and costs
  // determinism.
  const creds = Buffer.from(
    JSON.stringify({ account: userId, sat: 1, iat: 1 }),
  ).toString('base64');
  const sig = `fake-signature-${store.signerEpoch}`;
  const kid = `fake-signer-${store.signerEpoch}`;
  return Buffer.from(JSON.stringify({ creds, sig, kid })).toString('base64');
}
