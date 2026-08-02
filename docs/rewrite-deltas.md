# Rewrite deltas

Every deliberate departure from what shipped on `main`, so each one can be reviewed and
vetoed individually. Requirement (c)/(d) of the rewrite is to duplicate main's **intended**
behavior and aesthetics — this file is where "intended" gets pinned down.

Grouped by kind. Line references are to `frontend/.reference/app.js` and
`frontend/.reference/index.html` (the legacy sources, kept until Phase 6).

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

| Slot modal ×2 | `<button class="tag is-warning">Edit</span>` (opens button, closes span) | valid `<button>…</button>` |
| Volunteer modal | first `div.field` never closed | properly closed |
| Event summary modal | dead classes `set-output`, `edit-event-notify-out`, `edit-event-multuser-out` | dropped |
| Activity header cells | `data-tooltip` without a `has-tooltip-*` class | `has-tooltip-top` added, so tooltips actually render |
| Grid cells | `.html(label)` — XSS on activity short descriptions | text interpolation; window headers render two nodes rather than a `<br />` string |
| Grid cells, detail rows | click handlers on non-interactive elements | real `<button>` inside the styled container |

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

---

## Dependency changes

| Was | Now | Why |
|---|---|---|
| Svelte 4.0.5 / Vite 4.4.5 | Svelte 5.56.8 / **Vite 8.2.0** | The plan said Vite 6, on the belief that `@sveltejs/vite-plugin-svelte@5` was the current pairing. It is not — plugin 7 requires Vite 8, and Vite 6 would have meant adopting a two-major-versions-old build tool. Vitest 4 supports 6/7/8, so nothing else was constrained. **Flagged as a deviation from the approved plan.** |
| vendored `axb-sig-req.min.js` (74 KB browserify bundle, `window.genCreds`) | `@noble/ed25519` + `scrypt-js`, ~60 lines in `src/lib/crypto/creds.js` | Byte-for-byte verified against the legacy bundle and `node:crypto` — see `docs/legacy/creds-golden-vectors.json` |
| vendored jQuery, js-cookie, bulma-slider, bulma-toast, showdown, Bulma + CSS plugins | npm, bundled through Vite | Versioned and deduplicated |
| vendored `bulma-calendar.min.{js,css}` | **still vendored**, in `public/vendor/` | Deliberate — replacing it would change the datetime picker's look |
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
