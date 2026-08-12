# BACKEND API CONTRACT

> Derived from `src/main/java/com/crowdease/yasss/` on `release/framework-upgrade`.
> This is the contract the Svelte frontend codes against and the fake test server models.
> Field names are normative.

## 0. Transport basics

| | |
|---|---|
| Route prefix | `/v1` — `Endpoint` builds `String.format("/v%1$d%2$s", version, resource)`; constructors pass only the suffix |
| Path params | Spark style `:name` (e.g. `/v1/events/:event`) |
| Port / host | `api.port` (default `7455`), `api.host` (default `http://127.0.0.1:7455`) |
| CORS origins | `api.allowedOrigins` (default `*`) |
| CORS allowed headers | lib default — `Content-Type, Access-Control-Allow-*, Authorization, X-Requested-With`. **`X-CAPTCHA-TOKEN` is NOT included**, so cross-origin CAPTCHA requests fail preflight. Same-origin is fine |
| CORS exposed headers | `AXB-ACCOUNT`, `AXB-SESSION` (`YasssCore.java:168-170`). **`AXB-ACCESS-LEVEL` is set but not exposed** — cross-origin JS can't read it (bug B-9) |
| Methods | `DELETE, POST, GET, PATCH, PUT, OPTIONS` |
| Success envelope | `{"status":"ok","info":"<msg>", ...payload}` |
| Error envelope | `{"status":"error","info":"<msg>"}` |
| Uncaught | HTTP 500 `{"status":"error","info":"Internal server error."}` |

**`EndpointException(req, msg)` without a code defaults to 500** — this is why several
"malformed argument" cases return 500 instead of 400.

---

## 1. Endpoint table

Auth legend: **none**; **HUMAN** = `Authorization.IS_HUMAN` (CAPTCHA); **owner(x)** =
`auth.atLeast(x)`; **ADMIN** = platform-wide.

> Global override: `Authorization.atLeast()` returns `true` unconditionally when
> `auth.requireSignin = false`. That flag turns the whole permission system off.

| Class | Method | Route | Auth | Description |
|---|---|---|---|---|
| `APIInfoEndpoint` | GET | `/v1` | none | Health/version/CAPTCHA site key. **Also the login endpoint** — auth headers come back on it |
| `CreateEventEndpoint` | POST | `/v1/events` | HUMAN if anon; ≥STANDARD if authed; owner(admin) if `admin` set | Create event + activities + windows + details + slots in one shot |
| `ListEventsEndpoint` | GET | `/v1/events` | **ADMIN** (bug B-8 — breaks the dashboard) | Paged/filtered list |
| `RetrieveEventEndpoint` | GET | `/v1/events/:event` | none (403/402 gates inside) | Full event tree |
| `ModifyEventEndpoint` | PATCH | `/v1/events/:event` | owner(event) | Update scalars |
| `RemoveEventEndpoint` | DELETE | `/v1/events/:event` | owner(event) | Delete (cascades) |
| `EventReportEndpoint` | GET | `/v1/events/:event/report` | owner(event) | **Returns `text/html`**, not JSON |
| `AddActivityEndpoint` | POST | `/v1/events/:event/activities` | owner(event) | |
| `ModifyActivityEndpoint` | PATCH | `…/activities/:activity` | owner(event) | |
| `RemoveActivityEndpoint` | DELETE | `…/activities/:activity` | owner(event) | |
| `AddWindowEndpoint` | POST | `/v1/events/:event/windows` | owner(event) | |
| `ModifyWindowEndpoint` | PATCH | `…/windows/:window` | owner(event) | |
| `RemoveWindowEndpoint` | DELETE | `…/windows/:window` | owner(event) | |
| `AddDetailEndpoint` | POST | `/v1/events/:event/details` | owner(event) | |
| `ModifyDetailEndpoint` | PATCH | `…/details/:detail` | owner(event) | |
| `RemoveDetailEndpoint` | DELETE | `…/details/:detail` | owner(event) | **403 omits the code → returns 500** |
| `SetSlotEndpoint` | PUT | `…/activities/:activity/windows/:window` | owner(event) | Enable a cell |
| `UnsetSlotEndpoint` | DELETE | same | owner(event) | Disable a cell |
| `AddVolunteerEndpoint` | POST | `/v1/events/:event/volunteers` | HUMAN if anon; ≥STANDARD if authed; owner(user) if `user` given | **The signup endpoint** |
| `ModifyVolunteerEndpoint` | PATCH | `…/volunteers/:volunteer` | owner(vol's user) OR owner(event) | |
| `RemoveVolunteerEndpoint` | DELETE | `…/volunteers/:volunteer` | owner(vol's user) OR owner(event) | |
| `SetRSVPEndpoint` | PUT | `…/activities/:a/windows/:w/volunteers/:v` | owner(vol's user) OR owner(event) | Add one RSVP |
| `UnsetRSVPEndpoint` | DELETE | same | owner(vol's user) OR owner(event) | Remove one RSVP |
| `ReminderSubscriptionEndpoint` | PUT | `…/volunteers/:volunteer/reminders` | **none** — the token is the credential | *Added by the rewrite.* Confirm a reminder subscription |
| `ReminderSubscriptionEndpoint` | DELETE | same | **none** | *Added by the rewrite.* Unsubscribe |
| `CreateUserEndpoint` | POST | `/v1/users` | HUMAN or ADMIN | Register |
| `ListUsersEndpoint` | GET | `/v1/users` | **ADMIN** | |
| `RetrieveUserEndpoint` | GET | `/v1/users/:user` | owner(user) | |
| `ModifyUserEndpoint` | PATCH | `/v1/users/:user` | owner(user); ADMIN for `accessLevel` | |
| `RemoveUserEndpoint` | DELETE | `/v1/users` ← **route lacks `:user`** | owner(user) | **Always 404s** (bug B-6) |
| `ResetUserEndpoint` | POST | `/v1/users/:user` | `is(IS_HUMAN)` or `is(ADMIN)` | Empty body → email link (202); `{token,pubkey}` → apply |
| `VerifyUserEndpoint` | PUT | `/v1/users/:user` | `is(IS_HUMAN)` or `is(ADMIN)` | No `token` → resend (202); with `token` → verify |
| `RevokeSessionsEndpoint` | DELETE | `/v1/users/:user/sessions` | owner(user) | *Added by the rewrite.* Sign out everywhere; the caller's own device gets a replacement ticket |
| `RevokeSessionsEndpoint` | DELETE | `/v1/sessions` | **ADMIN** | *Added by the rewrite.* Every session on the platform, plus a signing-key wipe |
| `PublicTextEndpoint` | GET | `/v1/texts/:text` | none | `text/markdown`. `:text` ∈ `coa`, `terms`, `privacy` |

---

## 2. Request / response shapes

`JSONDeserializer.check()` **rejects any key not registered via `tokenize()`** with
`400 "unexpected argument (<key>)"`. Send only listed fields.

Type coercion is strict Java casting: `getInt` requires a JSON number (a string `"5"` →
`400 "malformed argument (int: x)"`); `getBool` requires a real boolean.

**Timestamps** (`getTimestamp`) accept a **string** in `yyyy-MM-dd HH:mm:ss.SSS`,
`… HH:mm:ss`, `… HH:mm`, the 12-hour `hh:mm:ss a` variants, `yyyy-MM-dd`, or a **stringified
UNIX epoch millis**. They are *returned* as numeric epoch millis. Parsing uses the server
default timezone.

### `GET /v1` — APIInfo

```json
{ "status":"ok", "uptime": 12345, "version": 1, "debug": false, "captcha": "<site key>" }
```

`captcha` present only when `auth.captcha.required = true`. The frontend uses its absence as
the "CAPTCHA is off" switch.

### `POST /v1/events` → 201

```jsonc
{
  "admin": "<uuid>",                 // optional
  "shortDescription": "string",      // REQUIRED, non-blank after strip
  "longDescription": "string",       // optional, default ""
  "emailOnSubmission": false,
  "allowMultiUserSignups": false,
  "activities": [ {                  // REQUIRED array (may be empty)
      "shortDescription": "string",  // REQUIRED
      "longDescription": "string",
      "maxActivityVolunteers": 0,    // 0 = unlimited
      "maxSlotVolunteersDefault": 0,
      "priority": 0,
      "slots": [ {
          "enabled": true,           // REQUIRED bool
          "window": 0,               // REQUIRED int — INDEX into windows[], not a UUID
          "maxSlotVolunteers": 0
      } ]
  } ],
  "windows": [ { "beginTime": "2026-01-01 09:00", "endTime": "2026-01-01 12:00" } ],  // REQUIRED
  "details": [ {
      "type": "STRING",              // REQUIRED: STRING|BOOLEAN|INTEGER|EMAIL|PHONE (case-insensitive)
      "label": "string",             // REQUIRED
      "hint": "string", "priority": 0, "required": false
  } ]
}
```

**Critical slot semantics** (`CreateEventEndpoint.java:270-289`): for every (activity, window)
pair — if no `slots` entry exists the slot **is created** with `maxSlotVolunteersDefault`; if an
entry exists with `enabled:true` it is created (with the override); **only an explicit
`enabled:false` suppresses it.** Omission enables. The wizard must emit one entry per pair.

Response 201 carries `event` with `activities` (no nested slots), `windows` as
`beginTime`/`endTime`, `details` (**no `type`** — bug B-17), and optionally `paymentRedirect`
when payments are enabled and the actor is not ADMIN.

### `GET /v1/events/:event` → 200 — the fully nested read

```jsonc
{ "event": {
    "id","admin","shortDescription","longDescription",
    "emailOnSubmission","allowMultiUserSignups","isPublished",
    "activities": [ { "id","shortDescription","longDescription",
                      "maxActivityVolunteers","maxSlotVolunteersDefault","priority",
                      "slots": [ { "window": "<window uuid>", "maxSlotVolunteers": 0,
                                   "rsvps": ["<volunteer uuid>"], "rsvpCount": 2 } ] } ],
    "windows":    [ { "id", "begin": <epochMs>, "end": <epochMs|null> } ],
    "details":    [ { "id","type","label","hint","priority","required" } ],
    "timezone": "America/Chicago",  // added by the rewrite; may be null
    "reminderLeadTime": 1440,       // added by the rewrite; may be null
    "volunteers": [ { "id","name","remindersEnabled","reminderConfirmed",
                      "details":[{"detail":"<uuid>","value":"…"}] } ],
    "volunteersMaxed": false, "expired": false } }
```

**Asymmetries a frontend must handle:**

- Slots carry **`window`** (UUID) but **no `activity`** — activity comes from nesting. Slots
  have **no `id`** (composite PK) and **no `enabled` flag** — a slot row exists iff enabled.
- Windows use `begin`/`end` **here**, but `beginTime`/`endTime` in every write and in
  Create/Add/Modify Window *responses*. Isolate this in one DTO module.
- `volunteers` is **filtered** — included only if `auth.atLeast(vol's user)` or
  `auth.atLeast(event)`. For anonymous volunteers that reduces to an ADMIN check. A guest sees
  `volunteers: []` but still sees `rsvps` UUID lists that don't resolve → **the grid must show
  counts, not names, for non-owners.**
- `volunteersMaxed` is `false` if `allowMultiUserSignups` or the caller owns the event; else
  `1 >= countVolunteers(...)` — true only when the count is 0 or 1 (see bug B-2).
- `expired` = the earliest window's `begin_time` is in the past.
- `reminderConfirmed` (*added by the rewrite*) says whether a confirmed reminder address
  exists. **The address itself is never emitted**, on any endpoint, to any caller — an
  organizer reading their own event learns that a volunteer will be reminded, not where.
- `timezone` (*added by the rewrite*) is the IANA zone the event takes place in, or `null`
  for events created before the column existed. Window times travel as epoch milliseconds and
  are therefore unambiguous; this says which zone to *render* them in. A client should render
  in the event's zone when set and its own when not — a physical event starts at the same wall
  clock wherever the reader is. Validated server-side against `ZoneId.getAvailableZoneIds()`,
  so bare offsets and non-canonical spellings are 400s.
- `reminderLeadTime` (*added by the rewrite*) is how many minutes before the event its
  reminders go out, or `null` to use the platform default. Accepted on create and modify,
  bounded 1..525600.

Non-200s: `404 "event not found"`; `402 "event not published"` when unpublished, Stripe
checkout unfulfilled, and caller isn't ADMIN.

### Other resources

| Endpoint | Body | Response payload |
|---|---|---|
| `PATCH /v1/events/:event` | subset of `admin, shortDescription, longDescription, emailOnSubmission, allowMultiUserSignups` | `event` w/o `isPublished` or children |
| `GET /v1/events` | query `admin, volunteer, label, earliest, latest, limit, page` | `{events:[{id,shortDescription,isPublished}], next?}` |
| `POST/PATCH …/activities` | `shortDescription` (req on POST), `longDescription`, `maxActivityVolunteers`, `maxSlotVolunteersDefault`, `priority` | `activity` |
| `POST/PATCH …/windows` | `beginTime` (req on POST), `endTime` (pass `null` on PATCH to clear) | `window: {id, beginTime, endTime}` |
| `POST/PATCH …/details` | `type, label, hint, priority, required` | `detail` |
| `PUT …/activities/:a/windows/:w` | `{maxSlotVolunteers}` optional | `slot: {activity, window, maxSlotVolunteers}` |
| `PUT …/volunteers/:v` (RSVP) | **no body read at all** | `rsvp: {activity, window, volunteer}` |

`ListEvents` gotchas: `page` is used but **never tokenized**, so `?page=2` → `400 "unexpected
argument (page)"`, and `deserializer.has("page")` is always false. Separately, query values
arrive as `String` while `getInt` casts to `Integer`, so **`?limit=` is broken too.**
`latest` + `limit|page` → `400 "argument conflict (latest vs limit/page)"`.

### `POST /v1/events/:event/volunteers` → 201

```jsonc
{
  "name": "string",              // REQUIRED, non-blank
  "remindersEnabled": false,
  "reminderEmail": "a@b.co",     // added by the rewrite; see below
  "user": "<uuid>",              // optional — links to an account
  "details": [ { "detail":"<detail uuid>", "value":"string" } ],   // REQUIRED array
  "rsvps":   [ { "activity":"<uuid>", "window":"<uuid>" } ]
}
```

**`rsvps` is tokenized optional but read unconditionally** — omitting it NPEs into a 500.
**Always send `"rsvps": []` at minimum.**

Response `volunteer: {id, user, event, name, details[]}` — no `remindersEnabled`. Side effect:
if the event has an admin, a `signup-alert` email is sent linking `<api.host>/?event=<uuid>`.

`PATCH` accepts a subset of `name, remindersEnabled, reminderEmail, details, user`; supplying
`details` **replaces the whole set** and re-runs the required-field check.

#### `reminderEmail` — added by the rewrite

Read only when `remindersEnabled` is true; ignored otherwise. Matched against the same
case-sensitive `EMAIL` pattern as a detail value and bounded to 255 characters, so **send it
lowercased or omit it** — `""` is a 400 rather than "no address given".

Omitting it is meaningful: a caller authenticated as at least `STANDARD` falls back to their
account address. An anonymous caller who omits it gets a 400, because there is nothing to
fall back to.

The resulting consent state is not a request parameter. It is derived (`ReminderConsent`):

| Situation | State |
|---|---|
| The address is the caller's own verified account address | `CONFIRMED` |
| The address is already `CONFIRMED` on this volunteer and unchanged | `CONFIRMED` |
| Anything else, including a change of address | `PENDING` |

`PENDING` sends a `signup-prompt` email carrying a stored `reminder_token`. Nothing is ever
delivered to a `PENDING` address. Naming somebody else's address always pends, so being
signed in is not a way to subscribe a stranger.

### `PUT /v1/events/:event/volunteers/:volunteer/reminders` — added by the rewrite

Body `{"token": "<uuid>"}`. Confirms the subscription and lifts any platform-wide suppression
on that address.

### `DELETE /v1/events/:event/volunteers/:volunteer/reminders` — added by the rewrite

Token in the **query string**, not a body, because this is a one-click link from a mail
client. Sets the volunteer to `UNSUBSCRIBED` and suppresses the address platform-wide, not
just on that row.

Both are unauthenticated and **deliberately not CAPTCHA-gated** — bulk-sender rules expect an
unsubscribe to be one click, and a challenge in front of one is a deliverability liability.
Both **always answer 200**, with the same body whatever the token turns out to be: confirming
or denying a token to an anonymous caller would let anyone holding a volunteer id probe for
live subscriptions. A confirmation link cannot resurrect an `UNSUBSCRIBED` volunteer.

### `PUT /v1/users/:user` — verification

Body `{"token": "<uuid>"}`, or an empty body to resend.

*Changed by the rewrite in two ways.* The token was a `TicketEngine` signature and is now a
stored, single-use `verify_token` — the ticket signers rotate on a roughly fifteen-minute
horizon and are lost on restart, so a welcome email was dead long before most recipients
opened it. And a successful verification now **promotes the account from `UNVERIFIED` to
`STANDARD`**; previously it moved the pending address onto `email` — enough to let the user
authenticate — while leaving the access level alone, so every endpoint gated on
`atLeast(STANDARD)` kept refusing them.

Note the ordering this implies: an account cannot authenticate at all until it is verified,
because credentials resolve against the `email` column, which is null while an address is
merely pending.

Resending after verification is a **409**: the pending address is gone, so there is nothing
left to confirm.

### Users

`POST /v1/users` → 201. Body `email` (req), `accessLevel`, `pubkey`, `generateMFA`. `pubkey` is
nominally optional but `new User(...)` throws on null, so it is **effectively required**. The
**first** user ever created is forced to `ADMIN`; otherwise default is `UNVERIFIED` and a
`welcome` email with `?action=verify-user&user=<id>&token=<sig>` is sent.

`POST /v1/users/:user` (Reset): `:user` may be a UUID **or an email address**. Empty body → 202
+ `reset-user` mail with `?action=reset-user&user=<id>&token=<uuid>`. Body `{token, pubkey}` → 200.

*Changed by the rewrite the same way verification was, and for the same reason.* The token was a
`TicketEngine` signature and is now a stored, single-use `reset_token` with its own deadline
(`token.resetTTL`, default one hour) — signed links died with the signer that made them, so a
reset email stopped working within about fifteen minutes and immediately on any deploy. Applying
a reset also **bumps `session_epoch`**, which ends every session established under the old
credential; previously the new password locked nobody out.

A token that matches but has lapsed answers **410**, not 403. The distinction is only ever
reachable on a match, so it cannot be used to ask whether a given account has a reset
outstanding. The same applies to the verification link (`token.verifyTTL`, default a day).

`PUT /v1/users/:user` (Verify): `{}` → 202 resend; `{token}` → 200 verified / already verified.

---

## 3. Server-side validation — mirror these client-side

Deserializer-level (all **400**):
`malformed object` · `null object` · `unexpected argument (<key>)` · `missing argument (<token>)` ·
`malformed argument (string|int|bool|decimal|array: <token>)` · `malformed argument (uuid: <token>)` ·
`malformed argument (timestamp: <token>)` · `malformed object in array (<token>)`

Endpoint-level highlights:

| Check | Code | Message |
|---|---|---|
| blank `shortDescription` / activity label / detail label | 400 | `malformed argument (string: …)` |
| `maxActivityVolunteers`, `maxSlotVolunteersDefault`, `priority`, `maxSlotVolunteers` outside 0–255 | 400 | `malformed argument (int: …)` |
| `beginTime` after `endTime` | **500** | `malformed arguments (timestamp: …)` |
| blank volunteer `name` | 400 | `malformed argument (name)` |
| `details[].detail` not an event detail | 404 | `detail not found` |
| detail value fails its regex | 400 | `malformed argument (details[].value)` |
| a `required` detail omitted | 400 | `missing required detail` |
| per-user/IP volunteer cap | 412 | `volunteer cap reached` |
| SetRSVP activity or slot cap reached | **409** | `volunteer cap exceeded` |
| bad email regex / blank | 400 | `malformed argument (email)` |
| email already taken | 409 | `conflicting email address found` |
| bad `accessLevel` (**case-sensitive**) | 400 | `malformed argument (accessLevel)` |
| bad reset/verify token | 403 | `access denied` |
| lapsed reset/verify token (matching) | **410** | `reset link has expired` / `verification link has expired` |
| `limit`/`page` < 1 | 400 | `malformed argument (limit)` / `(page)` |
| earliest window in the past (most event writes, skipped for ADMIN) | 412 | `event expired` |
| DB / Stripe failure | 500 | `database malfunction` / `stripe malfunction` |

**Detail type regexes** (`model/Detail.java:63-65`), applied with `matcher.matches()` — i.e.
**implicitly fully anchored**, and with **no `CASE_INSENSITIVE`**:

| Type | Pattern | Note |
|---|---|---|
| `STRING` | `.*` | |
| `BOOLEAN` | `^(true\|false)` | fully matched |
| `INTEGER` | `\d+(\.\d{0,9})?` | non-negative; despite the name it permits 9 decimals |
| `EMAIL` | RFC-ish, **lowercase-only character class** | `Foo@Bar.com` **fails** — genuine server behavior |
| `PHONE` | `(\+?( \|-\|\.)?\d{1,2}( \|-\|\.)?)?(\(?\d{3}\)?\|\d{3})( \|-\|\.)?(\d{3}( \|-\|\.)?\d{4})` | |

The legacy client regexes were **unanchored**, so client and server disagreed. Anchoring them in
the rewrite is not merely a bug fix — it makes the two tiers agree exactly.

---

## 4. Auth scheme

### Header

```
Authorization: AXB-SIG-REQ <base64url-of-payload>
```

`AuthToken.process()`: split on whitespace → require `AXB-SIG-REQ` + payload → base64-decode to
`{creds, sig}` → `creds` is either base64-of-JSON or raw JSON (our plain JSON contains `{`, `"`,
`@`, so the raw-JSON fallback always fires — **do not "clean up" `creds` into something
base64-shaped**) → yields `{email, mfa}` or `{account: "<uuid>"}` → look up the user → verify
**Ed25519** via `Credentialed.verifySig(creds, sig)` (BouncyCastle, over `creds.getBytes()`),
**or** `TicketEngine.verify` (the session-token path).

**On failure the exception is caught, logged, and `user` stays null — the request proceeds as
anonymous.** It is not rejected with 401.

### Session issuance and rotation

Every successful auth mints a fresh token and returns three headers:

| Header | Value |
|---|---|
| `AXB-ACCESS-LEVEL` | `BANNED` \| `UNVERIFIED` \| `STANDARD` \| `ADMIN` |
| `AXB-ACCOUNT` | user UUID |
| `AXB-SESSION` | the next session token |

```
creds   = base64({"account":"<uuid>", "sat":<epoch ms>, "iat":<epoch ms>})
session = base64({"creds": creds, "sig": <signature>, "kid": "<signer uuid>"})
```

**It rotates on every request** — the client must read `axb-session` from each response and
replace its stored token. Lookup is case-insensitive in browsers. The token is opaque to the
client; nothing outside `AuthToken` and `SessionTicket` reads its claims.

`kid` names the signer, so verification is a lookup and one Ed25519 check rather than a scan of
the whole key history. It sits in the envelope rather than in `creds` because `creds` is what
gets signed — the signer would otherwise have to be chosen before the thing naming it exists.
It needs no integrity protection: a wrong value simply fails to verify.

*Changed substantially by the rewrite.* Previously: `creds` was `{"account":"<uuid>"}` and
nothing else, the `TicketEngine` kept its Ed25519 keypairs **in memory only**, and with the
shipped `ticket.refreshInterval: 1` × `ticket.maxHistory: 15` a session died after **≈15 minutes
of inactivity** and every restart signed out the entire user base. There was no way to end a
session from the server at all, so a password change left whoever had the old credential signed
in and a ban left the banned party's session working.

Now:

- Signers are persisted (`ticket_signer`, migration 021), encrypted under `ticket.globalSecret`.
  **Without a real secret the engine refuses to persist them** and says so loudly — the crypto
  helper is the identity function when the secret is unset, so writing them would put raw signing
  keys in a table. `ticket.refreshInterval` now defaults to 1440.
- `sat` is the session start, copied forward unchanged; `iat` is restamped on every response.
  A session ends after `session.idleTimeout` untouched (default 7 days) or `session.absoluteTimeout`
  outright (default 30 days). Key retention is *derived* to cover the latter, not configured.
- `session_epoch` on `user` (migration 022) is a revocation watermark: a session that began at or
  before it is refused, in force on the very next request. Bumped by a credential reset, a ban,
  `DELETE /v1/users/:user/sessions`, and `DELETE /v1/sessions`. Deliberately **not** applied to
  the password branch, or a platform-wide revoke would be an outage rather than a forced re-login.
- A ticket carrying no `sat`/`iat` is treated as expired — a **one-time logout on upgrade**.

There is still no CSRF protection (the TODO in `AuthToken` remains). There is still no logout
endpoint in the "end my one session" sense; the client drops the token, which is the only copy.

### Login flow

There is no `/login`. The client signs a fresh credential payload and sends it to **`GET /v1`**,
then harvests `axb-account` / `axb-session` / `axb-access-level` from the response.

### CAPTCHA

- Header: **`X-CAPTCHA-TOKEN`**.
- Enabled by `auth.captcha.required` (**default `false`**). Also `cloudProject`, `keyFile`,
  `siteKey`, `minScore` (0.7), `gracePeriod` (10000 ms).
- Google reCAPTCHA Enterprise; the site key reaches clients via `GET /v1`'s `captcha` field.
- `verify` short-circuits `true` if the caller's IP is cached; on a pass the IP is cached for
  `gracePeriod`.
- Required (`IS_HUMAN`) for: **CreateEvent (anon), AddVolunteer (anon), CreateUser, ResetUser,
  VerifyUser**.

### The guest path

`AddVolunteerEndpoint` gates:

```java
if(!auth.is(IS_AUTHENTICATED) && !auth.atLeast(IS_HUMAN)      // anon must pass CAPTCHA
   || auth.is(IS_AUTHENTICATED) && !auth.atLeast(STANDARD)    // authed must be >= STANDARD
   || null != user && !auth.atLeast(user))                    // linking requires ownership
  throw 403;
```

Anonymous volunteers store `user = NULL` and `ip_addr = req.ip()`; anti-abuse is per-IP counting
when `allow_multiuser_signups = 0`.

| `requireSignin` | `captcha.required` | Anonymous RSVP |
|---|---|---|
| `true` | `true` | works with a valid CAPTCHA token |
| `true` | `false` | 403 — **and everything NPEs** (bug B-1) |
| `false` | either | works, and *all* auth is bypassed (dev mode) |

Guests cannot later edit their volunteer entry — only the event owner or a platform ADMIN can.

### 4b. The signing algorithm

The legacy vendored `axb-sig-req.min.js` (74 KB browserify bundle over `scrypt-js` +
`@noble/ed25519@1.x`) exposes exactly one global, `window.genCreds`:

```js
window.genCreds = async function (email, password, mfa, salt) {
  const creds = JSON.stringify({ email, mfa }).normalize('NFKC');
  const privkey = await scrypt.scrypt(Buffer.from(password.normalize('NFKC')),
                                      Buffer.from(salt.normalize('NFKC')),
                                      16384, 8, 1, 32, null);
  const pubkey = Buffer.from(await ed.getPublicKey(privkey)).toString('base64');
  const signature = await ed.sign(Buffer.from(creds), privkey);
  const payload = Buffer.from(JSON.stringify({ creds, sig: Buffer.from(signature).toString('base64') })
                                  .normalize('NFKC')).toString('base64');
  return { payload, pubkey };
};
```

1. NFKC-normalize password and salt.
2. **scrypt(password, salt, N=16384, r=8, p=1, dkLen=32)** → the Ed25519 private key seed. The
   password never leaves the browser; the server only ever sees the public key.
3. `pubkey` = base64 of the Ed25519 public key → posted to `/v1/users`, stored in
   `yasss_user.pubkey BINARY(32)`.
4. `creds` = `JSON.stringify({email, mfa})`, NFKC. **Key order `{"email":…,"mfa":…}` is
   normative** — the server verifies the signature over this literal string.
5. `sig` = base64(Ed25519 signature over the UTF-8 bytes of `creds`).
6. `payload` = base64(`JSON.stringify({creds, sig})`).

**All call sites pass `mfa=''` and `salt=''`.** An empty scrypt salt means the derived keypair is
a pure function of the password. This cannot be changed without invalidating every existing
account. `accountReset` additionally passes `email=''`, which is fine — the pubkey does not
depend on the email.

**Replacement is verified.** `docs/legacy/creds-golden-vectors.json` holds vectors produced by
the legacy bundle and independently reproduced by `node:crypto`/OpenSSL
(`scryptSync` → PKCS#8 prefix `302e020100300506032b657004220420` + seed → `createPrivateKey`
→ `createPublicKey`, last 32 bytes of the SPKI DER). Both oracles agree on ASCII, empty-password,
unicode/NFKC, long-password, and empty-email cases. The npm `@noble/ed25519` + `scrypt-js`
implementation is the third oracle and must match all three.

---

## 5. Static file serving and routing

`YasssCore.java:160-164` builds `APIDriver` with `.setPublicFolder("/public")`, which becomes
`Spark.staticFiles.location("/public")` — a **classpath** location, i.e.
`src/main/resources/public/` packed into the shadow jar. That directory is now the Vite output
(`outDir: '../src/main/resources/public'`, `emptyOutDir: true`).

**There is no SPA fallback.** No `Spark.notFound`, no catch-all, no redirect. Spark serves `/` →
`/public/index.html` and any literal file path; anything else hits Spark's default 404 page.

Consequences:

- **Path-based client routing is not viable.** `/event/abc-123` 404s on refresh or a shared link.
- The app uses **query params on `/`**: `?event=<uuid>`, `?action=verify-user|reset-user|terms|
  privacy|payment-success|payment-canceled`, `&share`. Email templates
  (`CreateUserEndpoint.java:107-113`, `ModifyUserEndpoint.java:124-130`,
  `ResetUserEndpoint.java:110-116`, `VerifyUserEndpoint.java:75-81`) and share links
  (`AddVolunteerEndpoint.java:242`) **hardcode this form**, so those entry points must keep
  working regardless of any future routing change.
- Path routing would require a `Spark.notFound` catch-all in the Java layer, a reverse proxy, or
  hash routing.

---

## 6. Database schema

`src/main/resources/db/*.sql`, applied in filename order. `${prefix}` defaults to `yasss_`. All
IDs `BINARY(16)`; every table has `last_update TIMESTAMP … ON UPDATE CURRENT_TIMESTAMP`.

```
user (id PK, pubkey BINARY(32) NOT NULL, mfakey VARBINARY(255),
      email VARCHAR(255), pending_email VARCHAR(255),
      access_level TINYINT UNSIGNED NOT NULL)   -- 0=BANNED 1=UNVERIFIED 2=STANDARD 3=ADMIN

event (id PK, admin_user → user.id [ON DELETE SET NULL],
       short_description, long_description, first_draft DATETIME NOT NULL,
       email_on_submission BIT, allow_multiuser_signups BIT, published BIT)

activity (id PK, event → event.id [CASCADE], short_description, long_description,
          max_activity_volunteers TINYINT UNSIGNED,     -- 0..255, 0 = unlimited
          max_slot_volunteers_default TINYINT UNSIGNED,
          priority TINYINT UNSIGNED)

event_window (id PK, event → event.id [CASCADE],
              begin_time DATETIME NOT NULL, end_time DATETIME NOT NULL)
              -- NOT NULL in DDL, but the model writes NULL

detail (id PK, event → event.id [CASCADE],
        detail_type TINYINT UNSIGNED,   -- 0=STRING 1=BOOLEAN 2=INTEGER 3=EMAIL 4=PHONE
        label, hint, priority TINYINT UNSIGNED, required BIT)

slot (activity → activity.id [CASCADE], event_window → event_window.id [CASCADE],
      max_slot_volunteers TINYINT UNSIGNED,
      PRIMARY KEY (activity, event_window))          -- no surrogate id

volunteer (id PK, user → (no FK; nullable), event → event.id [CASCADE],
           name, reminders_enabled BIT,
           ip_addr INT UNSIGNED)                     -- IPv4-only; see the IPv6 migration

volunteer_detail (volunteer → [CASCADE], detail_field → detail.id [CASCADE],
                  detail_value, PRIMARY KEY (volunteer, detail_field))

rsvp (activity → [CASCADE], event_window → [CASCADE], volunteer → [CASCADE],
      PRIMARY KEY (activity, event_window, volunteer))

checkout_session (event → [CASCADE], session_id VARCHAR(255))   -- Stripe
```

### Relationships

- An **event** owns N **activities** (rows), N **windows** (columns), N **details** (form fields).
  Activities × windows form the grid.
- A **slot** is one grid cell, existing only if that pair is offered. Its PK is the pair, so slots
  have **no UUID** and the API addresses them positionally.
- A **volunteer** belongs to one event, optionally linked to a `user` (NULL = guest, identified
  only by `ip_addr`).
- An **rsvp** is a volunteer claiming a slot; PK `(activity, event_window, volunteer)`, so
  re-`PUT`ting is naturally idempotent. It references activity and window directly rather than
  the slot composite, so an RSVP could theoretically exist without a slot row — the API guards by
  resolving through `activity.getSlot(window)` first.
- Deleting an event cascades to everything. Deleting a user only NULLs `event.admin_user`;
  `volunteer.user` has **no FK**, so it dangles.

### Ordering

`priority` is `TINYINT UNSIGNED` (0–255), validated at the endpoint layer for activities but
**not for details** — out-of-range there fails at the DB as a 500.

Ordering is **ASC on `priority`, then alphabetical tiebreak**, in both SQL and the Java
`Comparable`s:

| Entity | Order |
|---|---|
| Details | `priority ASC, label ASC` |
| Activities | `priority ASC, short_description ASC` |
| Windows | **no priority column** — `begin_time ASC` |
| Volunteers | `name ASC` |
| RSVPs within a slot | `last_update ASC` (signup order) |

Getters return sorted `TreeSet`-backed sets, so **the array order in `GET /v1/events/:event` is
already the intended display order.** A future drag-to-reorder UI would write back `priority`;
identical priorities silently fall back to alphabetical, so it should assign distinct increasing
values.

`Event.isExpired()` = the earliest `begin_time` is in the past; it drives the
`412 "event expired"` guard on nearly every mutating event-scoped endpoint.

---

# 9. Polls

Added after the rewrite, so nothing in the sections above describes them. A
poll is a sibling of an event, not a mode of one: same grid, same short-code
lifecycle, different meaning underneath.

|            | Event                          | Poll                                |
|------------|--------------------------------|-------------------------------------|
| columns    | activities                     | days of the week, or dates          |
| rows       | windows (`begin`..`end`)       | windows (a start time, no end)      |
| who answers| many volunteers per submission | exactly one person                  |
| a square   | `slot`, keyed by its parents   | `poll_cell`, with an id of its own  |

## 9.1 Routes

```
POST   /v1/polls                                         create the whole graph
GET    /v1/polls                                         scoped listing, else 403
GET    /v1/polls/:poll                  [?token=]        read
PATCH  /v1/polls/:poll                                   settings only
DELETE /v1/polls/:poll
POST   /v1/polls/:poll/options                           add a column
PATCH  /v1/polls/:poll/options/:option                   incl. the All Day flag
DELETE /v1/polls/:poll/options/:option
POST   /v1/polls/:poll/windows                           add a row (+ applyTo)
PATCH  /v1/polls/:poll/windows/:window
DELETE /v1/polls/:poll/windows/:window
POST   /v1/polls/:poll/details                           custom questions
PATCH  /v1/polls/:poll/details/:detail
DELETE /v1/polls/:poll/details/:detail
PUT    /v1/polls/:poll/options/:option/windows/:window   offer a square
DELETE /v1/polls/:poll/options/:option/windows/:window   withdraw one
POST   /v1/polls/:poll/responses                         answer
PATCH  /v1/polls/:poll/responses/:response  [?token=]    revise
DELETE /v1/polls/:poll/responses/:response  [?token=]    withdraw
GET    /v1/codes/:code                                   what does this code name
```

`:poll` accepts a UUID or a short code, exactly as `:event` does.

## 9.2 PRESENCE ENABLES

**The single most important line in this section, because it is the opposite of
§2.** For an event, `CreateEventEndpoint` commits a slot for every (activity,
window) pair *unless* an explicit `{enabled: false}` suppresses it — omission
enables, which is why `eventPayload.js` emits one entry per pair.

For a poll, a `poll_cell` row exists **if and only if** the square is offered.
`cells` in the create body lists only the squares that are, naming its column
and row by array index; an unlisted pair is withheld. `window` absent means the
all-day square.

Anyone who has read one of these payload builders and then the other will
assume the wrong rule. Both files say so at the top.

## 9.3 Shared short codes

Codes are one namespace across both kinds, allocated by `access_code`
(migration 032). `event.code` and `poll.code` remain as display copies; the
registry is the uniqueness authority, and it is claimed *before* the row is
written so that a failure between the two burns a code rather than letting two
things answer to one.

`GET /v1/codes/:code` exists because the entry box resolves both kinds and the
visitor does not know which they hold.

## 9.4 Answering

One row per submission. `POST .../responses` takes `name`, `votes` (cell ids),
`details`, and — only when the poll allows one answer each — a `fingerprint`.

The duplicate rule is asymmetric on purpose: a signed-in caller is matched on
their **account alone**, an anonymous one on **address OR fingerprint**. The
fingerprint is written either way, which is what stops answering and then
signing out from buying a second vote. See `docs/fingerprinting.md`.

The 201 carries `editToken` **once**. It is the only thing an anonymous
respondent can present to prove an answer is theirs; neither the address nor
the fingerprint authorizes an edit.

## 9.5 Result visibility

Six settings, enforced server-side in `RetrievePollEndpoint`: the `tally` key is
**absent from the payload** when it is not disclosed, rather than present and
hidden. `CREATOR_ONLY`, `PUBLIC_ALWAYS`, `PUBLIC_AFTER_CLOSE`,
`RESPONDENT_OWN`, `RESPONDENT_ALL_AFTER_SUBMIT`, `RESPONDENT_ALL_AFTER_CLOSE`.

Two of them require a deadline; the last also forces authenticated answering,
because a browser-held token is not an identity that survives the gap between
submitting and the deadline. Both are checked at create and at modify by
`PollRules`, which the two endpoints share so neither can be reached around.

## 9.6 Things that will surprise you

- **Scope cannot be patched.** `PATCH /v1/polls/:poll` answers 400 for it. A
  weekday poll's columns hold no dates; changing it would invalidate the grid
  and every vote on it.
- **All Day is non-destructive.** Setting it adds the whole-day square and
  leaves the timed squares in place, so unsetting restores the column. While it
  is set, those squares are not votable — `PollAnswers.votable` is what decides.
- **A poll with no deadline never closes.** A relative poll has no dates that
  could pass, so a deadline is the only thing that can ever close one.
- **`applyTo` absent means every column; an empty array means none.** A row
  offered on no column is a legitimate half-built state.
- **`appliesToNewOptions` is a standing rule, not a list.** It is applied by
  `AddPollOptionEndpoint` when a column is added later.

