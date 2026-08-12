# Remaining work

Everything known to be outstanding on `release/framework-upgrade`, verified against the
source rather than recalled.

The previous revision's backlog has since been implemented — see §4 for what that turned up,
including two entries that were simply wrong. What is left below is genuinely open.

One former entry has since been fixed upstream rather than worked around: `axb-lib-db` 0.4.1
repairs `Database.setup`. It is struck through in §1 rather than deleted, because the
constraint it describes shaped every migration in `db/`.

---

## 1. Open items

| Issue | Detail |
|---|---|
| ~~**Sessions die after ~15 minutes idle**~~ | **Fixed.** The signing keys are persisted (`ticket_signer`, migration 021) and encrypted under `ticket.globalSecret` — the engine refuses to write them without a real one. (That clause used to read "because the crypto helper is the identity function when it is unset"; since `axb-lib-auth-java` 0.1.0 it fails closed instead, and `ticket.globalSecret` is now **mandatory** — see the row below.) A session now lasts `session.idleTimeout` (7 days) or `session.absoluteTimeout` (30 days), survives a restart, and can be ended server-side: `session_epoch` on `user` (migration 022) is bumped by a credential reset, a ban, `DELETE /v1/users/:user/sessions` and `DELETE /v1/sessions`. `ticket.refreshInterval` moved from 1 to 1440; key retention is now derived from the absolute timeout rather than configured. |
| ~~**`Database.setup` joins SQL lines with no separator**~~ | **Fixed upstream in `axb-lib-db` 0.4.1**, which this project now depends on. A `--` comment no longer swallows the rest of a script, and a file may hold several statements. See `docs/upstream-axb-lib-db.md`. The existing migrations were deliberately not rewritten: they work and are idempotent, so churning 21 files to change comment syntax buys nothing. |
| ~~**Credential material was encrypted with a reused GCM nonce**~~ | **Fixed by upgrading `axb-lib-auth-java` from 0.0.2 to 0.2.0.** Under 0.0.2 the GCM IV was the account UUID — fixed, public, and the same for a user's private key and their TOTP secret, which leaks the XOR of the two and permits GHASH subkey recovery. Also silent plaintext storage with no secret, and an XOR-folded key that collapsed to all zeros for a repeated 32-byte block. **`ticket.globalSecret` is now mandatory and the server refuses to start without it** — a breaking configuration change, and deliberate: without it the process would start, report healthy, and fail every authenticated request. 0.1.0 was skipped because it could not read legacy records written under a non-ASCII secret on a non-UTF-8 host. Legacy records are swept and rewritten at boot by `CredentialMigrator`. See `docs/upstream-axb-lib-auth.md`. |
| **Operators must set `ticket.globalSecret` before deploying this release** | Not a code defect; an upgrade action. A deployment currently running without one will refuse to boot, with an error naming the parameter. Worth knowing which deployments are in that state *before* shipping. Such a deployment also has TOTP secrets stored in the clear (0.0.2 returned credential material unencrypted when no secret was set); the boot sweep detects those by length and encrypts them, logging one warning per account. |
| **WebKit cannot run under FreeBSD's linuxulator** | `tests/e2e/compat.spec.js` is tagged `@compat` and the config defines firefox, webkit and mobile-chromium projects. Chromium, Firefox and Mobile Chromium all run in the Playwright container on FreeBSD; WebKit launches and then immediately loses its target process. Not investigated — CI and Arch WSL are real Linux and run all four. On FreeBSD, pass `--project=chromium --project=firefox --project=mobile-chromium`. |
| ~~**The connection pool is never closed at shutdown**~~ | **Fixed upstream, and applied.** `axb-lib-db` 0.5.0 makes `Database` an `AutoCloseable` with a no-argument `close()` that shuts the pool down; the shutdown hook calls it, after both daemon joins so a draining reminder batch keeps the pool it is writing through. Note that 0.5.0 also made the pool *settings* take effect for the first time — they were being passed to the JDBC driver, which ignores them — so this deployment now gets the 3-minute `maxLifetime` and 30-second `idleTimeout` its defaults always claimed, and therefore more connection turnover than before. |
| ~~**Storage is server-local wall clock**~~ | **Fixed, by pinning rather than converting.** The JVM's default zone is forced to UTC before the first connection, so the zone that `DATETIME` storage is interpreted in can no longer drift when a base image, host or `TZ` changes. No data was rewritten: the shipped container has always been UTC, so the values on disk were already right — they were right by accident, and are now right on purpose. The e2e suite runs its app container in `America/Chicago` to prove it. A conversion script was deliberately *not* written, because `Database.setup` replays every script on every boot and a `CONVERT_TZ` is not idempotent — it would shift every timestamp again on each restart. See `docs/utc-storage.md`, which also carries the one-time manual conversion for a deployment that was genuinely running in another zone. |

### Not a defect, recorded so it is not re-raised

**CSRF.** `AuthToken.java:116` carries a TODO and a previous revision of this document listed
it as an open vulnerability. It is not reachable. Credentials are read **only** from the
`Authorization` header (`AuthToken.java:60`) — never from a cookie. The cookie is client-side
storage that the app's own JS reads and copies into the header, so a cross-origin form post or
`<img>` cannot authenticate, and a `fetch` that tries triggers a CORS preflight. The adjacent
real issue — `api.allowedOrigins` defaulting to `*` — has been fixed; it now defaults to
same-origin.

---

## 2. Quality of life

### 2.1 Volunteer-facing timezone display

Times render in the event's zone, which is right for a physical event. A volunteer in another
zone sees a note naming it but has to do the conversion themselves. Showing both ("9:00 AM CST
— 3:00 PM your time") is a genuine improvement and purely additive.

### 2.2 Reordering windows

Activities and details reorder; windows deliberately do not, because they have no `priority`
column and are ordered by `begin_time`. Reordering them means editing their times, which is
already possible. Listed only so the asymmetry is not mistaken for an oversight.

### 2.3 "Sign out everywhere" has no button

`DELETE /v1/users/:user/sessions` exists, is authorized for the account itself and for an
administrator, and hands the device that asked a replacement ticket so it stays signed in. The
frontend does not call it. Nothing is broken by its absence — a password reset already revokes
every session automatically, which is the case that matters — but it is the natural home for a
profile-screen control and is deliberately left for the accessibility and QoL pass rather than
bolted on here.

Same for `DELETE /v1/sessions`, the platform-wide form. That one is arguably better left to
`curl`: it is a break-glass lever for a suspected key compromise, and putting it one misclick
away in an admin screen is its own hazard.

### 2.4 Two accessibility gaps the QoL pass narrowed but did not close

**Activity descriptions on touch.** They now reach a screen reader (the tile's `title` is its
accessible description) and a keyboard user (`:focus-within` reveals the same tooltip focus
gives). A touch device has neither hover nor focus, so the description is still unreachable
there. Closing it properly means an affordance in the tile — a disclosure, or making the header
open a read-only detail view — and that changes the grid's markup, whose class strings the
aesthetic conformance suite asserts exactly. Worth doing deliberately rather than as a side
effect.

**Non-interactive slots are still unnamed.** A slot tile is only a button when there is something
to do with it: in edit mode, or in view mode once a volunteer is selected. Those carry a full
name — "Setup, Saturday 9:00 AM – 12:00 PM: Available". A tile that is not interactive is plain
text reading "Available", and which row and column it sits in is conveyed by CSS grid position
alone. Fixing that means real table semantics or an explicit `role="grid"` with row and column
headers, which is a larger change than the rest of this pass and wants its own look.

### 2.5 Smaller items

- **Aesthetic verification is one layer of the four planned.** Class-string conformance
  exists; the structural diff against `main` and the human side-by-side do not.
- **`report.html` has had a design pass but no proofing.** It has been checked as HTML and for
  its zone handling, not printed. Worth someone printing once.
- **Dark mode is untested visually.** The variables are emitted and the theme is no longer
  pinned, so the page follows the OS. Nothing asserts it *looks* right.

---

## 3. Verification inventory

Counts are from the release pass of August 2026, measured on a clean run.

| Suite | Count | What it proves |
|---|---|---|
| Vitest | 358 | Pure logic: payloads, validation, session, dates and zones, credential vectors, toast precedence and announcement, the unsaved-work truth table, the published password policy, the structural-write id guards and reorder rollback |
| Playwright (fake API) | 173 | Every user-facing flow, plus accessibility with axe, failure injection, history and the unload guard, paste paths, the picker's default window across zones and DST boundaries, destructive-action confirmations, Enter-to-submit and modal focus |
| Playwright (`@compat`, x3 engines) | 18 | The places where the browser is the variable: switch labels, bulma-calendar, modal dismissal, grid layout, time formatting, touch targets. Six of these run in the chromium count above; the three-engine total is 185 |
| Playwright (live stack) | 70 | The real server, real Ed25519 in a browser, real database - including account-field fuzzing and read-back fidelity |
| Java | 234 | Authorization matrix, detail types, query params, consent rules, expiring tokens, session-ticket verdicts, ticket-signer codec and retention, the health probe's deadline, zone and lead-time validation, the text bound in code points, markup escaping, and the model's natural orderings |
| Fuzzer | 3,000+ requests | No 5xx and no stack trace from hostile input |
| Accounts stage | 14 checks | Registration -> email -> link -> promotion -> first event, against real SMTP |
| Text stage | 149 checks | Every text surface round-tripped through a latin1-defaulted server, the length bound in code points, and output escaping on the printable report |
| Concurrency stage | 102 checks | Slot, activity and per-identity caps under 16 simultaneous claims, five rounds each |
| Reminders stage | 25 checks | Real SMTP, real daemon, real sweep, per-event lead times |
| Regressions stage | 45 checks | Specific defects pinned: the wrong-table delete, the missing RSVP foreign key, pagination overflow, short codes, and clearing a nullable field |
| Sessions stage | 25 + 4 checks | Revocation at both granularities, single-use reset tokens, and — across an application restart — that a ticket issued beforehand still authenticates |
| Health stage | 5 + 3 checks | The readiness check against a live stack, then with the database stopped: a 503 rather than a green lie, answered promptly rather than hanging on the pool timeout, and green again once it returns |

The `--coverage` figure this section used to quote is stale and has deliberately not been
replaced with a guess: the reporter emits nothing on the FreeBSD host, so it needs recomputing
on Linux. The reasoning behind it still holds — the number reads low largely because it counts
every `.svelte` component, which the Vitest run never imports. Components are covered by the
Playwright specs, which are not instrumented. The modules holding decisions rather than markup
are covered directly.

The remaining gaps are deliberate, and one fewer than before. `structureActions` is now unit
tested directly, because two of its defects — a write response with no id, and a reorder that
fails partway — are invisible end to end: every request involved answers 200 and the damage
only shows on the *next* edit. The other action modules are still covered end to end only, on
the original reasoning that a mocked unit test there pins the implementation rather than the
behavior. The `window.history` half of `route.svelte.js` is likewise untested directly.

Java unit tests stop where the database begins: almost every endpoint's second statement opens
JDBC through a static `YasssCore.getDB()`. Threading a repository seam through 30-odd endpoints
and 14 model classes is a larger and riskier change than the tests it would buy — the
containerized suite covers those paths against a real database instead. What is unit tested is
everything that can be made pure, and this pass deliberately extracted more of it:
`SessionTicket.evaluate`, `ExpiringToken.check`, `TicketEngine.signerCount` and
`YasssCore.within` are all static functions taking their clock or their probe as an argument,
precisely so the matrix around them can be walked without a database or a wait.

---

## 4. What working the backlog turned up

Four defects that were not in the backlog, found while implementing it. Each is recorded
because in every case the *symptom* had been cataloged and the *cause* guessed wrong.

**Verifying your email never granted access.** `VerifyUserEndpoint` moved the pending address
onto the account — which is what authentication resolves against, so the user could suddenly
log in — but never promoted `access_level` past `UNVERIFIED`. Every endpoint gated on
`atLeast(STANDARD)` kept refusing them, so a self-registered user could never create an event
without an ADMIN promoting them by hand. This is the real cause of the symptom the backlog
filed as "unverified accounts are invisible"; the banner-and-resend fix it proposed would have
had nowhere to appear, since an unverified account cannot authenticate at all.

**Verification links expired in ~15 minutes.** They were signed by the `TicketEngine`, whose
signers rotate on a `refreshInterval × maxHistory` horizon and are lost on restart. A welcome
email was effectively dead on arrival. Now a stored, single-use token.

**`Volunteer.commit` emitted `NOT IN ()`.** Pre-existing on `main`. Re-committing a volunteer
on an event with no custom fields was a syntax error, so `ModifyVolunteerEndpoint` was simply
broken for those events.

**`Slot.java` read the wrong IP column.** It selected the legacy `ip_addr` while wrapping it in
`INET6_NTOA`, which expects `VARBINARY` — so every volunteer's address came back NULL from
those two queries. Surfaced only because dropping the legacy column broke the build.

And one infidelity in the test double: the fake API returned activities and details in
insertion order while the real server sorts both by `priority`. A purely local reorder would
have looked correct in every browser spec and reverted against the real server.
