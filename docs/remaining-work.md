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
| **Sessions die after ~15 minutes idle** | `ticket.refreshInterval` (1 min) × `ticket.maxHistory` (15) bounds the window, and every session dies on restart because the signing keys live in memory. The knock-on for emailed links is now fixed — verification and reminder links carry stored tokens — but a signed-in user is still logged out after a quarter-hour of inactivity. Worth confirming against how the service is actually operated before changing; the fix is either persisting the signers or lengthening the ring. |
| ~~**`Database.setup` joins SQL lines with no separator**~~ | **Fixed upstream in `axb-lib-db` 0.4.1**, which this project now depends on. A `--` comment no longer swallows the rest of a script, and a file may hold several statements. See `docs/upstream-axb-lib-db.md`. The existing migrations were deliberately not rewritten: they work and are idempotent, so churning 21 files to change comment syntax buys nothing. |
| **Storage is server-local wall clock** | Events now carry an IANA zone and every surface renders in it, so the user-facing half is fixed. Underneath, `DATETIME` columns still store whatever instant the JDBC driver converted using the JVM's zone. Instants round-trip correctly and consistently, but *relocating the server or changing the container's `TZ` would silently shift every stored time*. Converting to UTC storage is a one-shot data migration, and `Database.setup` replays every script on every boot — so it needs a guard this schema has no natural place for. Worth doing deliberately, not incidentally. |

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

### 2.3 Smaller items

- **Aesthetic verification is one layer of the four planned.** Class-string conformance
  exists; the structural diff against `main` and the human side-by-side do not.
- **`report.html` has had a design pass but no proofing.** It has been checked as HTML and for
  its zone handling, not printed. Worth someone printing once.
- **Dark mode is untested visually.** The variables are emitted and the theme is no longer
  pinned, so the page follows the OS. Nothing asserts it *looks* right.

---

## 3. Verification inventory

| Suite | Count | What it proves |
|---|---|---|
| Vitest | 283 | Pure logic: payloads, validation, session, dates and zones, credential vectors |
| Playwright (fake API) | 98 | Every user-facing flow: auth, edit mode, reminders, verification, reordering, timezones, narrow viewports |
| Playwright (live stack) | 14 | The real server, real Ed25519 in a browser, real database |
| Java | 120 | Authorization matrix, detail types, query params, consent rules, verify tokens, zone and lead-time validation |
| Fuzzer | 3,000+ requests | No 5xx and no stack trace from hostile input |
| Accounts stage | 14 checks | Registration → email → link → promotion → first event, against real SMTP |
| Reminders stage | 25 checks | Real SMTP, real daemon, real sweep, per-event lead times |

`npm run test:coverage` reports **31.8% statements** over `src/**` (824/2594). That number
reads low and largely is not: it counts every `.svelte` component, which the Vitest run never
imports — components are covered by the 98 Playwright specs, which are not instrumented. The
modules holding decisions rather than markup are covered directly.

Three gaps remain, all deliberate: `state/actions/*` (covered end to end; a mocked unit test
there would pin the implementation and would not have caught either bug that module's own
docstring describes), `toast.js` (a thin wrapper over `bulma-toast`), and the
`window.history` half of `route.svelte.js`.

Java stops at 120 because almost every endpoint's second statement opens JDBC through a static
`YasssCore.getDB()`. Threading a repository seam through 32 endpoints and 14 model classes is
a larger and riskier change than the tests it would buy — the containerised suite covers those
paths against a real database instead.

---

## 4. What working the backlog turned up

Four defects that were not in the backlog, found while implementing it. Each is recorded
because in every case the *symptom* had been catalogued and the *cause* guessed wrong.

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
