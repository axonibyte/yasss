# Rewrite deltas

Every deliberate departure from what shipped on `main`, so each one can be reviewed and
vetoed individually. Requirement (c)/(d) of the rewrite is to duplicate main's **intended**
behavior and aesthetics — this file is where "intended" gets pinned down.

Grouped by kind. References to `app.js` and the legacy `index.html` point at sources that
were removed once the rewrite reached parity; they are fully described by `docs/legacy/`
and remain in git history (see `frontend/.reference/README.md`).

---

## Copy changes

Decision: normalize typos, grammar, and punctuation; list every change here.

| Where | Was | Now |
|---|---|---|
| `validateActivityModal` error | "The activity volunteer cap needs to be number between 1 and 255" | "The activity volunteer cap needs to be a number between 1 and 255." |
| Dashboard heading | "Your Upcoming RSVPS" | "Your Upcoming RSVPs" |
| Terms/Privacy modal title | *(never populated — empty header bar)* | "Terms of Service" / "Privacy Policy" |
| `validateVolEditModal` integer error | "This needs to be an integer." | "This needs to be a number." (the pattern permits up to 9 decimals) |
| `registerUser` error | "Your password should be at least one character in length" | …"in length." |
| Activity modal label | "Acitvity Volunteer Cap" | "Activity Volunteer Cap" |
| Toasts generally | inconsistent trailing periods | consistent |

---

## Markup changes

| Where | Was | Now | Why |
|---|---|---|---|
| `index.html` | no `<!DOCTYPE html>`, no `<meta charset>` | both present | Legacy rendered in quirks mode. This is also why old-vs-new pixel diffing is not viable — see the plan. |
| `index.html` | no `<link rel="icon">` | `<link rel="icon" href="/favicon.ico">` | `favicon.ico` shipped but was never linked. |
| `index.html` | reCAPTCHA `<script>` loaded unconditionally at boot | loaded on demand by `lib/captcha.js`, only when `GET /v1` reports a site key | Legacy called `grecaptcha.enterprise.reset()` on a never-rendered widget when CAPTCHA was disabled, which threw and left anonymous publish/RSVP/register dead. (`app.js:2779-2787`, behavior §6.17) |
| `NavBar.svelte` | `<nav class="navbar" role="navigation">` | `role` dropped | `navigation` is `<nav>`'s implicit role; no behavioral or a11y change. |
| `NavBar.svelte` | `<img src="assets/img/...">` (relative) | `/assets/img/...` (absolute) | Everything else was already absolute; relative would 404 on any non-root path. |
| `EventListBox.svelte` | click handler bound to `<li>` | a real `<button>` inside the `<li>` | Entries were unreachable by keyboard and unannounced by assistive tech. The `<li>` still carries the bulma-block-list styling, so the appearance is unchanged. |
| Modal fields | `<div class="label">` | `<label class="label" for=…>` | Bulma styles by class so it renders identically, but the legacy fields had no accessible association. |
| `CoaSection.svelte` | markdown HTML injected into a `<p>` | rendered into a `<div>` | The content contains block elements, so the browser was reparenting invalid nesting. Same resulting appearance. |
| Slot modal ×2 | `<button class="tag is-warning">Edit</span>` (opens button, closes span) | valid `<button>…</button>` | The browser silently repaired it |
| Volunteer modal | first `div.field` never closed | properly closed | As above |
| Event summary modal | dead classes `set-output`, `edit-event-notify-out`, `edit-event-multuser-out` | dropped | No CSS and no JS referenced them |
| Activity header cells | `data-tooltip` without a `has-tooltip-*` class | `has-tooltip-top` added | Tooltips never actually rendered |
| Grid cells | `.html(label)` — XSS on activity short descriptions | text interpolation; window headers render two nodes rather than a `<br />` string | |
| Grid cells, detail rows | click handlers on non-interactive elements | real `<button>` inside the styled container | Keyboard-unreachable and unannounced |
| `.has-text-primary`, outlined primary buttons, outlined grid tiles | `var(--bulma-primary)` — hsl(171, 100%, 41%) | `var(--bulma-primary-on-scheme)` | As *text* on the page background that is about 1.8:1, against the 4.5:1 WCAG asks for, and it was the only serious finding in the axe sweep — it covered every link and emphasised word on the intro page, the call to action and the dashboard. Same hue and saturation, lightness corrected per scheme. Backgrounds are untouched, so the brand colour is unchanged everywhere it is a fill. |
| Links inside prose (`.content`, `.footer`) | distinguished from surrounding text by colour alone | underlined | WCAG 1.4.1. Nav items and buttons are excluded — they read as controls from their position. |
| `Field.svelte` | red `Error` pill appended *inside* the `<label>` as a `<button>` carrying a tooltip (legacy `setErrorTag`, aesthetics §2.8) | pill moved into the `help` line as a `<span>`; tooltip dropped; `aria-describedby`/`aria-invalid` added at each call site | A `<button>` is interactive content and is not permitted inside a `<label>`: it added a tab stop that appeared only in the error state, clicking it activated the label, and it changed the field's accessible name from "Email Address" to "Email Address Error" — which is why the live harness had to locate every field by id. The tooltip duplicated the message already printed directly below it. The red pill, its colour and the message position are unchanged. |
| `Modal.svelte` | `<div class="modal is-active">` | `role="dialog" aria-modal="true"` + `aria-labelledby` on the card title | Assistive tech could tab into the page behind an open modal, and the dialog announced no name. No visual change. |
| `GridCell.svelte` | interactive tiles were as tall as their text, about 18px | `min-height: 2.75rem`, contents centred | WCAG 2.5.5 asks for a 44px touch target. The grid is a matrix and cannot get narrower — it holds five columns at any width — but it can get taller, and height was the failing axis. Rows are correspondingly taller; nothing else about the tile changes. |
| Reminder lead time (`SummaryModal.svelte`) | `<input type="number">` | `<input type="text" inputmode="numeric">` | Svelte coerces a number input's binding, so anything unparseable arrived as blank — and blank means "use the platform default". Pasting `1440abc` silently produced the default with no feedback. The spinner arrows are lost; a spinner that discards what you typed is worse than none. |

---

## Behavior changes

| Where | Was | Now | Why |
|---|---|---|---|
| Session cookie | no `path`, `sameSite` or `secure` | `path=/`, `SameSite=Lax`, `secure` on https | |
| Session token | rotated in memory, persisted only by `refreshUserSession` | persisted on every rotation | Reloading between rotations logged the user out. |
| reCAPTCHA | script loaded for every visitor | injected only once the server reports a site key | |
| Error tags | cleared only on the next submit attempt | cleared per-field on input | |
| Profile update | modal closed before the PATCH resolved | awaits the request, closes on success | A failure used to toast behind a dismissed dialog. |
| Terms/Privacy fetch | no failure handling | toasts on failure | A fetch error left the modal silently blank. |
| Dashboard lists | refetched on essentially every API response | load once, driven by the account | The legacy refetched from inside its response-header handling. |

The four that change visible UX, as decided:

| Ref | Behavior | Outcome |
|---|---|---|
| behavior §6.10 | Volunteers are never POSTed at add time; only "Submit RSVPs" persists them, and the success toast fires before any request resolves | **Deferred persistence kept.** The toast now follows the requests, failures are reported and name the volunteers that did not save, and a `beforeunload` guard warns before unsubmitted work is lost. |
| behavior §2.7 | The custom-fields table is built then hidden from every non-admin | **Kept hidden**, matching shipped behavior. |
| behavior §6.19 | A required BOOLEAN detail can never fail validation | **Fixed** — "required" is now enforceable, which is what the server already enforces when the detail is absent. |
| behavior §3.1 | Client email regex is unanchored and lowercase-only, disagreeing with the server | **Anchored** (client and server now agree) with the **lowercase rule kept**, since `Detail.Type.EMAIL` is applied via `matches()` without `CASE_INSENSITIVE`. Inputs lowercase on blur so it is not a trap. |

Further behavior changes from the later phases:

| Where | Was | Now | Why |
|---|---|---|---|
| Slot model | flat `slots[w * activities.length + a]` | owned by the activity, keyed by window | Root of four confirmed bugs; also mirrors the wire format |
| Publish payload | slots walked with the wrong stride, omitting pairs | one explicit entry per (activity, window) pair | The server *enables* any slot the payload omits, so this silently turned on slots the user had disabled |
| Selected volunteer | array index, `NaN` when nothing selected | object reference or `null` | Indexing with `NaN` made the next slot click throw |
| Removing a volunteer | left their id in slot RSVP lists and never decremented counts | releases their slots | Grid kept showing them as booked until reload |
| Un-RSVP for an unpersisted volunteer | `splice(-1, 1)` removed another volunteer's entry | guarded on a real id | |
| Grid paging | refresh dropped its step argument | visible range derived from the step | Table snapped back to the first four columns while the slider thumb stayed put |
| Report object URL | never revoked | revoked after the tab takes it | |
| Window picker | one `Date` aliased between `startDate` and `startTime`; `minDate` pinned to tomorrow even when editing | distinct instances; floor applies only to new windows | An existing window starting in the past was uneditable |
| Slot modal jump links | synthesized a click on a cell found by a stored index | plain callbacks with the entity in hand | The index was stale or undefined once the grid had scrolled |

### Backend fixes, final phase

| Where | Was | Now | Why |
|---|---|---|---|
| `CreateUserEndpoint` | `accessLevel` read from the request body with no authority check | requesting a level requires ADMIN; the first account on an empty install is still ADMIN regardless | **Privilege escalation.** Any anonymous caller could self-provision a platform ADMIN by asking for one. `ModifyUserEndpoint` gates the same field, which is what establishes this as an oversight. Denied explicitly rather than silently downgraded, so a tool that has lost its credentials fails loudly instead of quietly creating an UNVERIFIED account. |
| `ListUsersEndpoint` | `getInt` on query params, which are always `String` | `queryInt` | The same defect already fixed in `ListEventsEndpoint`, applied to one of a matched pair |
| `Add`/`ModifyDetailEndpoint`, `CreateEventEndpoint` | `priority` unbounded into a `TINYINT UNSIGNED` | 0–255, matching the activity endpoints | Out-of-range values became a database error and a 500 |
| Every text field | no length validation anywhere | `bounded()` at 16 sites; `validPubkey()` on the key | Found by the fuzzer. A 300-character value became a truncation warning or a 500, never a 400 |
| `Volunteer.commit` | `whereIn("detail_field", true, 0)` emitted `NOT IN ()` | the clause is dropped when the set is empty | **Pre-existing on `main`.** Re-committing a volunteer on an event with no custom fields was a syntax error, so `ModifyVolunteerEndpoint` was simply broken for those events |
| `Mail.send` | threw on any mailer failure | logs and returns `false` | A `MailerException` propagated out of `AddVolunteerEndpoint` and turned the whole signup into a 500 — the volunteer was lost. With SMTP down, nobody could sign up at all |
| `defaults/yasss.cfg` | `email.smtp.username` | `email.smtp.user` | `ParamEnum` reads `user`; the shipped default meant the app failed to boot with email enabled |

### Volunteer reminders — new feature

Reminders were described in the schema and the mail templates but implemented nowhere; see
`docs/remaining-work.md` §5. What was built:

| Piece | Note |
|---|---|
| Schema | `volunteer.reminder_email`, `.reminder_state`, `.reminder_token`; a `reminder_log` dedup ledger; a platform-wide `reminder_suppression` table; an index on `(event, begin_time)` without which the finder full-scans every poll |
| Consent | `remindersEnabled` keeps its meaning as the volunteer's *intent*; `reminder_state` carries the consent fact, and the daemon requires both. Rules live in `ReminderConsent` so create and modify cannot drift |
| Double opt-in | A `PENDING` address gets a `signup-prompt` email and is never delivered to. An address already proven by the caller's own verified account skips it |
| Token | A stored `reminder_token`, **not** `TicketEngine` — its signers live in memory, rotate on a ~15-minute horizon and are lost on restart. An unsubscribe link must work months later |
| Daemon | `ReminderEngine`, modelled on `TicketEngine` but catching `SQLException` *inside* the loop, naming its thread, and wrapping each send. Claims are taken **before** sending: at-most-once is the right bias for email, and a duplicate reminder is worse than a missed one |
| Unsubscribe | One click, no CAPTCHA, platform-wide suppression. Confirming an address later lifts that suppression, since clicking a link in mail sent there is proof of control |
| Disclosure | The address is never returned by any endpoint. `reminderConfirmed` says only that one exists |

Two supporting changes: `upcoming-event.json` was a zero-byte file that threw an unchecked
exception on any use and is deleted; `signup-prompt.json`'s subject was byte-identical to
`signup-alert.json`'s.

---

## Feature changes

Genuine additions rather than fidelity deltas, flagged separately so they are easy to veto.

| What | Why |
|---|---|
| The event's time zone is a field in the summary modal, and can be changed after publishing | It was captured silently from the browser at creation and was then unchangeable — `App.svelte` never put it in the PATCH diff, so the branch `dto.js` already had for it could not fire. An organiser building an event while travelling, or on a machine with the wrong zone set, could neither see that it was wrong nor correct it. "Show in each viewer's own time zone" is an explicit option, so an event created before zones existed does not silently acquire one the first time its description is edited. |
| Events carry a short code — eight Crockford Base32 symbols, shown as `XXXX-XXXX` — usable anywhere the UUID is, and the share link now uses it | A UUID is thirty-six characters of hex; nobody reads one down a telephone, writes one on a whiteboard or types one off a flyer. The alphabet omits `I`, `L`, `O` and `U`, and decoding folds the confusable characters, so reading a code aloud and writing it down cannot produce a different code; case and punctuation are ignored entirely. UUID links keep working — this is an alias, not a replacement — and the intro page gains a box to type a code into, without which a code is only a shorter URL. |
| A minimum password length, configurable by the operator as `auth.password.minLength` (default 8) | There was no minimum at all: `x` was a valid password. **The server cannot enforce this and does not pretend to** — the password never leaves the browser, which derives an Ed25519 keypair from it and sends only the public key. So the value is published by `GET /v1` and applied by the client. It is applied only where a password is *set*; never at login, where it would lock out accounts created under a lower setting. |

---

## Dependency changes

| Was | Now | Why |
|---|---|---|
| Svelte 4.0.5 / Vite 4.4.5 | Svelte 5.56.8 / **Vite 8.2.0** | The plan said Vite 6, on the belief that `@sveltejs/vite-plugin-svelte@5` was the current pairing. It is not — plugin 7 requires Vite 8, and Vite 6 would have meant adopting a two-major-versions-old build tool. Vitest 4 supports 6/7/8, so nothing else was constrained. **Flagged as a deviation from the approved plan.** |
| vendored `axb-sig-req.min.js` (74 KB browserify bundle, `window.genCreds`) | `@noble/ed25519` + `scrypt-js`, ~60 lines in `src/lib/crypto/creds.js` | Byte-for-byte verified against the legacy bundle and `node:crypto` — see `docs/legacy/creds-golden-vectors.json` |
| vendored jQuery, js-cookie, bulma-slider, bulma-toast, showdown, Bulma + CSS plugins | npm, bundled through Vite | Versioned and deduplicated |
| vendored `bulma-calendar.min.{js,css}` | `bulma-calendar@7.1.1` from npm, **lazily imported** | The vendored files are byte-identical to the published package (verified by SHA-256), so installing it is provably behaviour-neutral. 1,014 KB of JS and 75 KB of CSS were shipped to every visitor for a modal only an organiser opens. Vite splits the async chunk and emits its CSS `<link>` separately — which is why `app.scss`'s two `.datetimepicker .timepicker` overrides had to move into the lazily-imported stylesheet, or the async `<link>` would load after them and win |
| `bulma-block-list.min.css` (compiled) | `bulma-block-list/src/block-list.scss` via `sass` | Ships SCSS only; using the source keeps it versioned |
| Node 18.17.0 | Node 22.20.0 | Vitest 4 dropped Node 18 |
| node-gradle plugin 7.0.0 | 7.1.0 | |
| `showdown@2.1.0` | `marked@18` | showdown carries an unfixed ReDoS advisory (no patched version exists). The input is operator-authored config, so the practical risk was nil — but an unfixable advisory is not worth carrying when a maintained drop-in exists. `npm audit` is now clean. Output for the simple prose in `content/*.md` is equivalent; marked enables GFM, so tables and strikethrough would now render where showdown ignored them. |
| `bulma-pageloader@0.3.0` | vendored into `src/vendor/bulma-pageloader.css` | The package is deprecated at *every* published version, and its Sass targets Bulma 0.x variables that no longer exist in 1.x, so it cannot be recompiled. The vendored file is byte-identical to what shipped. No deprecated direct dependencies remain. |
| `easymock@4.3`, `powermock@2.0.9` | `easymock@5.6.0`, PowerMock **dropped** | EasyMock 4.3 cannot proxy classes on JDK 17+ — which had gone unnoticed because the Java suite never ran. PowerMock was referenced by nothing and is unmaintained. |
| `testng@7.4.0` | `testng@7.11.0` | |

---

## Build / infrastructure changes

| Where | Was | Now |
|---|---|---|
| `build.gradle` | `test` task never called `useTestNG()` — **`gradle test` executed zero tests** | `useTestNG()` enabled |
| `build.gradle` | no frontend test hook | `testFrontend` task; `check.dependsOn testFrontend` |
| `.gitignore` | — | added Playwright output dirs |
| `frontend/` | — | added `.nvmrc` pinning 22.20.0 alongside `engines.node` |
| `bitbucket-pipelines.yml` | only `main` built or tested anything | every branch runs the frontend and build steps in parallel | This is how a frontend that had never been executed reached a release branch. |
| `bitbucket-pipelines.yml` | `gradlew clean test shadowJar` | `gradlew clean check shadowJar`, plus a Playwright step on `mcr.microsoft.com/playwright` | `check` covers the Java and frontend unit suites; the browser suite is separate so the build step stays quick |
| `frontend/.reference/` | legacy `app.js` and `index.html` kept during the port | **deleted**; `axb-sig-req.min.js` **retained** | The first two are fully described by `docs/legacy/` and recoverable from git. The signing bundle stays as an executable oracle for regenerating the credential vectors — a deliberate departure from the plan, which called for deleting all of it. |

### Backlog phase — bugs found while implementing it

| Where | Was | Now | Why |
|---|---|---|---|
| `VerifyUserEndpoint` | moved the pending address onto the account but never promoted `access_level` | promotes `UNVERIFIED` to `STANDARD` | Verifying granted no access. The user could suddenly log in — authentication resolves against `email`, which verification populates — but every endpoint gated on `atLeast(STANDARD)` still refused them, so a self-registered account could never create an event without an ADMIN promoting it by hand |
| `VerifyUserEndpoint`, `CreateUserEndpoint` | verification link signed by `TicketEngine` | a stored, single-use `verify_token` | Ticket signers rotate on a ~15-minute horizon and are lost on restart, so a welcome email was dead on arrival. Same reasoning as the reminder token |
| `Slot.java` | selected `v.ip_addr` and wrapped it in `INET6_NTOA` | selects `v.ip_addr_bin` | `INET6_NTOA` expects `VARBINARY`, so every volunteer's IP came back NULL from the two slot queries. Missed when 006 introduced the binary column |
| `Volunteer.commit` | `whereIn("detail_field", true, 0)` emitted `NOT IN ()` | the clause is dropped when the set is empty | **Pre-existing on `main`.** Re-committing a volunteer on an event with no custom fields was a syntax error, so `ModifyVolunteerEndpoint` was broken outright for those events |
| `api.allowedOrigins` | defaulted to `*` | defaults to the sentinel `same-origin`, resolved to `api.host` | A wildcard let any site read the responses to anonymous requests. An explicit value, `*` included, is still honoured |
| `volunteer.user` | no foreign key | `ON UPDATE CASCADE ON DELETE SET NULL`, matching `event.admin_user` | Deleting a user left dangling references. `SET NULL` rather than `CASCADE` because losing an account must not destroy the signup — anonymous is a state the schema already models |
| `volunteer.ip_addr` | retained after the IPv6 widening | dropped, along with its ADD and backfill scripts | Keeping them meant re-adding and re-dropping the column on every boot, and the ADD carried an `AFTER` clause — a full InnoDB table rebuild twice per start |
| Fake API | returned activities and details in insertion order | sorts both by `priority`, as the server does | The double was unfaithful in exactly the way that would have hidden the reordering work: a purely local reorder looked correct in every spec and reverted against the real server |

### Backlog phase — features

| Feature | Note |
|---|---|
| **Per-event timezone** | Events carry an IANA zone, captured from the organiser's browser at creation and validated server-side against `ZoneId`. Every surface renders in it — grid, modals, email, the printable report — so a volunteer elsewhere sees the event's local time rather than their own. Instants were never ambiguous on the wire (epoch ms); the bug was that each surface picked its own zone, so the grid and the reminder email described the same shift differently. A NULL zone keeps the old viewer-local behaviour, so nothing changes retroactively. The zone is named once on the event rather than on every window header — the grid holds five fixed columns at any width and an abbreviation on each costs more than it explains |
| **Per-event reminder lead time** | An optional override on the global `reminders.leadTime`. The horizon is computed per row in SQL (`DATE_ADD(?, INTERVAL COALESCE(e.reminder_lead_time, ?) MINUTE)`) rather than filtered afterwards in Java, which keeps `batchSize` meaningful — a Java-side filter would let a batch fill with rows that are not due and starve ones that are. Bounded to a year: an unbounded lead makes every future event permanently due, so the next sweep mails the entire backlog at once |
| **Reordering activities and details** | The server was always ready — `priority` is tokenized on both endpoints and is the sort key — but nothing ever set it. Moving renumbers the whole list and pushes only what changed, because nothing guarantees existing priorities are contiguous and swapping two values within a degenerate set does nothing. Windows stay unorderable by design: no priority column, sorted by `begin_time`. Activity controls live in the activity modal rather than the grid header, because `GridCell`'s class string is normative and asserted by the conformance suite |
| **Dark mode** | `app.scss` emits Bulma's light variables into `:root` and its dark ones behind `prefers-color-scheme`, and `index.html` no longer pins `theme-light`. The `prefers-color-scheme: light` block upstream emits is skipped as a duplicate of `:root`, and the `.theme-*` class variants stay dropped since nothing toggles by class. Costs about 120 KB raw / 9 KB gzipped |
| **Narrow viewports** | The grid is a matrix — a cell means "this activity, at this window" — so it cannot reflow to fewer columns without losing its meaning. Instead the column width has a 7.5rem floor and the grid scrolls within its own container; the document never scrolls sideways. Previously five fixed columns gave roughly 65px per tile on a phone |
| **Printable report** | A real design pass: point-sized for paper, `@page` margins, `break-inside: avoid` so a window's sheet is not split mid-slot, print colour-adjust so the header fills survive, and writing rules on the blank rows. Also now renders in the event's zone and names it — the sheet is printed and carried to the event, so the server's zone was never the right one |

---

## Bundle size

Measured on the production build, not estimated. "Initial load" is what a visitor opening an
event actually downloads; before the change there was no such distinction, because everything
was loaded eagerly from `index.html`.

| | Before | After |
|---|---|---|
| Initial load, raw | 2,106,141 B | 601,960 B |
| Initial load, gzipped | — | 108,615 B |

The initial load grew by about 10 KB raw / 2 KB gzipped over the mid-rewrite measurement,
which is the dark-theme variable set and the new UI. Still under a third of what shipped
before.

Two changes account for nearly all of it. The calendar (1,089 KB) is no longer in the initial
payload at all. The stylesheet went from all of Bulma (678 KB) to a modular build: dropping
`helpers/color` — 181 KB, 27% of Bulma, for the single `.has-text-primary` rule actually used,
now hand-written — and emitting the light theme only, since `themes/_index.scss` emits the
full variable set five times and `index.html` pins `theme-light`.

Two traps worth recording for whoever prunes further: `elements/notification` powers every
`bulma-toast` and is invisible to a markup grep because the classes are injected at runtime,
and `lib/grid.js` builds class strings in JS.
