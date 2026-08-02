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

Pending, to apply when the owning component is written:

| Where | Was | Will be |
|---|---|---|
| `#edit-activity-modal` label | "Acitvity Volunteer Cap" | "Activity Volunteer Cap" |
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

Pending, to apply when the owning component is written:

| Where | Was | Will be |
|---|---|---|
| `#edit-slot-modal` ×2 | `<button class="tag is-warning">Edit</span>` (opens button, closes span) | valid `<button>…</button>` |
| `#edit-vol-modal` | first `div.field` never closed | properly closed |
| Most modal fields | `<div class="label">` | `<label class="label" for="…">` — real label association |
| Event summary modal | dead classes `set-output`, `edit-event-notify-out`, `edit-event-multuser-out` | dropped |
| Activity/window/slot cells | `data-tooltip` without a `has-tooltip-*` class | class added so tooltips actually render |
| `addCell` | `.html(label)` — XSS on activity short descriptions | text interpolation; window headers emit real `<br />` |

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

Pending — the full bug-disposition table lives in the approved plan. The four that change
visible UX, with the decisions already taken:

| Ref | Behavior | Decision |
|---|---|---|
| behavior §6.10 | Volunteers are never POSTed at add time; only "Submit RSVPs" persists them, and the success toast fires before any request resolves | **Keep deferred persistence**, but fire the toast after the requests resolve, add failure handling, and add a warn-on-unload guard |
| behavior §2.7 | The custom-fields table is built then hidden from every non-admin | **Keep hidden** — matches shipped behavior |
| behavior §6.19 | A required BOOLEAN detail can never fail validation | **Fix** — "required" becomes enforceable, which is what the server already enforces |
| behavior §3.1 | Client email regex is unanchored and lowercase-only, disagreeing with the server | **Anchor it** (making client and server agree) and **keep the lowercase rule**, since `Detail.Type.EMAIL` is applied with `matches()` and no `CASE_INSENSITIVE`. Add auto-lowercase-on-blur so it is not a trap. |

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
