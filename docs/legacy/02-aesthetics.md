# AESTHETIC & MARKUP INVENTORY — legacy frontend

> Sources: `git show main:src/main/resources/public/index.html` (834 lines, deleted on this
> branch), `frontend/public/assets/css/style.css`, and the render functions in
> `frontend/public/assets/js/app.js`. This is the visual specification for the rewrite.
> Class strings here are normative — reproduce them exactly.

## 0. Document shell

```html
<html class="theme-light">
  <head>
    <title>Yasss!</title>
    <link rel="stylesheet" href="/assets/css/bulma.min.css" />
    <link rel="stylesheet" href="/assets/css/bulma-block-list.min.css" />
    <link rel="stylesheet" href="/assets/css/bulma-calendar.min.css" />
    <link rel="stylesheet" href="/assets/css/bulma-pageloader.min.css" />
    <link rel="stylesheet" href="/assets/css/bulma-slider.min.css" />
    <link rel="stylesheet" href="/assets/css/bulma-switch.min.css" />
    <link rel="stylesheet" href="/assets/css/bulma-tooltip.min.css" />
    <link rel="stylesheet" href="/assets/css/style.css" />   <!-- LAST: overrides -->
    <script src="/assets/js/jquery-3.7.1.min.js" defer></script>
    ... js.cookie, bulma-calendar, bulma-slider, bulma-toast, showdown, axb-sig-req, app.js
    <script src="https://www.google.com/recaptcha/enterprise.js?onload=loadCAPTCHA&render=explicit&hl=en"
      async defer></script>
```

Notes for the rewrite:

- **No `<!DOCTYPE html>` and no `<meta charset>`** in the legacy file — it renders in quirks
  mode. The new shell has both. This is why old-vs-new pixel diffing is not viable; see the
  plan's aesthetic-verification section.
- **No `<link rel="icon">`** anywhere; `favicon.ico` is served only via the browser's implicit
  `/favicon.ico` request.
- `style.css` loads last, so its two rules win at equal specificity.
- The reCAPTCHA URL is `www.google.com`. The current WIP shell drops the `www.` — that is a
  regression to fix.

### 0.1 Navbar (always visible)

```html
<nav class="navbar" role="navigation" aria-label="main navigation">
  <div class="navbar-brand">
    <a class="navbar-item" href="/">
      <img src="assets/img/yasss_logo_small.png" alt="Yasss!" />
      <strong class="has-text-primary">Yasss!</strong>
    </a>
  </div>
  <div class="navbar-end">
    <a id="create-event-nav" class="navbar-item">Create Event</a>
    <a id="login-nav" class="navbar-item" style="display: none;">Log In</a>
    <a id="account-nav" class="navbar-item" style="display: none;">Account</a>
    <a id="logout-nav" class="navbar-item" style="display: none;">Log Out</a>
  </div>
</nav>
```

- The logo `src` is **relative** while all CSS/JS is absolute. Harmless only because the app
  lives at a single URL (`/?event=...`).
- There is **no `navbar-burger` and no `navbar-menu`** — `navbar-end` sits directly under
  `nav.navbar`. On mobile Bulma stacks the links vertically under the brand. Reproduce this;
  do not "helpfully" add a burger.
- Visibility is driven by `toggleAuthUI(loggedIn)` (`app.js:1308`). `#create-event-nav` is
  always visible.

### 0.2 Pageloader

```html
<div class="pageloader is-bottom-to-top is-active">
  <span class="title">Hang on tight!</span>
</div>
```

Dismissed by a hard-coded `setTimeout(..., 1000)` in `loadSite` (`app.js:3195`) — not tied to
data readiness. Reproduce the 1 s minimum splash.

### 0.3 Footer

```html
<footer class="footer">
  <div class="content has-text-centered">
    <p><strong class="has-text-primary">Yasss!</strong> Made with love, from your
      friends at <a href="https://crowdease.com" class="has-text-primary">CrowdEase</a>.</p>
    <p class="is-size-7 mt-5">Copyright &copy; <script>…year…</script> CrowdEase, LLC. All rights reserved.</p>
    <p class="is-size-7 mt-2">
      <a id="terms-link-footer" class="has-text-primary">Terms of Service</a>
      &emsp;|&emsp;
      <a id="privacy-link-footer" class="has-text-primary">Privacy Policy</a>
      &emsp;|&emsp;
      <a href="https://bitbucket.org/axonibyte/yasss" class="has-text-primary">Host it Yourself</a>
    </p>
  </div>
</footer>
```

Separators are literal `&emsp;|&emsp;`. Year computed client-side.

---

## 1. Page sections

| Section id | Initial | Shown when | Hidden when |
|---|---|---|---|
| `#introduction-section` | visible | **always** — never referenced in app.js | never |
| `#coa-section` | visible | logged out, no event loaded (`app.js:1358`) | logged in (1349), event opened (2600, 2834) |
| `#list-event-section` | visible w/ "Loading…" | logged in, no event loaded (1350) | logged out (1357), event opened (2601, 2835) |
| `#view-event-section` | `display: none` | event retrieved (2602, 2845, 2870) or wizard started | initial load |

A logged-out first paint shows the hero **and** the CTA card stacked.

### 1.1 Introduction / hero

```html
<section id="introduction-section" class="section">
  <div class="container has-text-centered">
    <h1 class="title is-2"><strong class="has-text-primary">Yasss!</strong></h1>
    <h2 class="subtitle is-4">Sign me up!</h2>
  </div>
</section>
```

### 1.2 Call to action

```html
<section id="coa-section" class="section">
  <div class="card"><div class="card-content"><div class="content has-text-centered">
    <p class="subtitle">Welcome, friend!</p>
    <p id="coa-content" class="mb-5"></p>
    <div class="buttons is-centered">
      <button id="create-event-cta" class="button is-primary is-medium">Create an Event!</button>
    </div>
  </div></div></div>
</section>
```

`#coa-content` is filled from `loadMarkdown('/v1/texts/coa', '#coa-content', null)` (`app.js:3114`),
which runs Showdown then adds `has-text-primary` to every `<a>` in the container. Note the
markdown HTML (containing `<p>`) is injected into a `<p>` — invalid nesting the browser
reparents. **The rewrite should render into a block container** to match visually.

### 1.3 Event listing (dashboard)

```html
<section id="list-event-section" class="section">
  <div class="grid">
    <div class="cell">
      <div id="list-event-admin-box" class="box">
        <p class="subtitle has-text-centered">Your Upcoming Events</p>
        <ul class="block-list is-centered"><li>Loading...</li></ul>
      </div>
    </div>
    <div class="cell">
      <div id="list-event-rsvp-box" class="box">
        <p class="subtitle has-text-centered">Your Upcoming RSVPS</p>
        <ul class="block-list is-centered"><li>Loading...</li></ul>
      </div>
    </div>
  </div>
</section>
```

`setUpcomingEvents` (`app.js:1286`) flips the list classes:

- **Empty** → `block-list is-centered`, single `<li>No events.</li>`
- **Populated** → `block-list is-primary`, one clickable `<li>` per event showing
  `event.shortDescription`

Two parallel calls on login: `GET /v1/events?admin=<acct>&earliest=<now>` → admin box;
`?volunteer=<acct>` → RSVP box.

### 1.4 View-event section — three stacked cards

**Card 1 — summary + volunteer/details split.** A `div.grid` with two `div.cell`s.
Left: `#view-event-short-descr` (`h2.is-size-2`), `#view-event-long-descr` (`p`), then

```html
<div class="buttons is-left">
  <button id="view-event-edit-summary" class="button is-light is-outlined is-primary is-small">Edit Summary</button>
  <button id="view-event-view-report"  class="button is-light is-outlined is-primary is-small">View Report</button>
  <button id="view-event-share"        class="button is-light is-outlined is-primary is-small">Share</button>
</div>
```

Right: two cards, `#view-event-volunteer` (header "Volunteer!", a
`div.select.is-fullwidth.is-primary > select`, and buttons `#view-event-add-vol`
`button is-primary` "Add Volunteer" + `#view-event-chg-vol` `button is-warning`
"Update Volunteer" hidden) and `#view-event-details` (header "Custom Fields", a
`table.table.is-bordered.is-hoverable.is-fullwidth` with header row `<tr class="is-primary">`
containing `<th>Detail</th><th>Type</th>`).

Mode switching in `renderEventTableMeta(title, description, editable)` (`app.js:211`):

- **editable** → hide `#view-event-volunteer`, show `#view-event-details`, show `#view-event-edit-summary`
- **not editable** → hide `#view-event-details`, show `#view-event-volunteer`, hide `#view-event-edit-summary`
- `#view-event-view-report` shown iff `userData.account === summary.admin`

**Consequence, preserved by decision:** volunteers never see the custom-fields table; admins
in edit mode never see the volunteer picker.

`renderFieldTable()` (`app.js:343`) rebuilds the Custom Fields table: removes all `tr` except
`.is-primary`; empty state appends

```html
<tr><td class="is-light is-warning has-text-centered is-size-7" colspan="2">You haven't specified any custom fields yet! :)</td></tr>
```

and **removes `is-hoverable`** from the table. Populated state re-adds `is-hoverable` and
appends `<td>{field}</td><td>{Type}{ (required)}</td>` rows, click-to-edit. Type labels:
`STRING→Text`, `BOOLEAN→True/False`, `INTEGER→Whole Number`, `EMAIL→Email Address`,
`PHONE→Phone Number`, default `INVALID`.

**Card 2 — grid + slider.** `#view-event-table` (`div.content`) followed by
`<input id="view-event-slider" class="slider is-fullwidth is-small" step=1 min=0 max=100 value=50 type=range>`.
The static slider is **removed and rebuilt** on first render (see §3.3).

**Card 3 — action buttons.** `#view-event-buttons`, `div.buttons.is-centered`:

| id | classes | label |
|---|---|---|
| `#view-event-add-activity` | `button is-light is-outlined is-primary` | Add an Activity |
| `#view-event-add-window` | `button is-light is-outlined is-primary` | Add a Window |
| `#view-event-add-field` | `button is-light is-outlined is-primary` | Add a Field |
| `#view-event-publish-event` | `button is-primary` | Publish Event |
| `#view-event-modify-event` | `button is-warning` (hidden) | Modify Event |
| `#view-event-save-rsvps` | `button is-primary` | Submit RSVPs |
| `#view-event-close-editor` | `button is-primary` (hidden) | Close Event Editor |
| `#view-event-expired` | `button` disabled (hidden) | This event has expired. |

*Wizard* (`app.js:2834-2855`): hide modify/close/save-rsvps; show add-* + publish.
*Public RSVP* (`2600-2620`): hide add-* + publish; show save-rsvps unless expired, in which
case hide it and show `#view-event-expired`.

---

## 2. Modals

All twelve share `div.modal > div.modal-background + div.modal-card`, activated by
`addClass('is-active')`, dismissed by `.modal-close`/`button.delete[aria-label="close"]`.

### 2.1 `#share-event-modal` — "Share this event!"

Body: `<p class="mb-4">You can visit this event by visiting the URL below:</p>` then a
`div.field > div.control > input#share-event-url.input.is-primary[type=text][readonly]`
with placeholder "Event URL". Footer: `div.buttons > button#share-event-copy.button.is-success`
"Copy to Clipboard". URL is `${window.location.origin}?event=${summary.id}`. Copy toasts
"Copied!" (`is-success`). Auto-opens on `?share`.

### 2.2 `#md-view-modal` — terms / privacy

`modal-card-head > p.modal-card-title` (**never populated** — both modals render with an
empty header bar; the rewrite fixes this with a `title` prop), body
`section.modal-card-body > div.content` filled with Showdown output, and an **empty**
`footer.modal-card-foot` that still renders as a gray bar.

### 2.3 `#edit-event-modal` — event summary

Title: "Create an Event" / "Update an Event" / "View Event" (set by JS at `app.js:470`, `486`).
Fields in order:

1. `div.label` "Event Title" → `input#edit-event-short-descr.input[type=text]`, placeholder
   "What's the name of your event?"
2. `div.label` "Description" → `textarea#edit-event-long-descr.textarea[rows=4]`, placeholder
   "Describe your event!"
3. `input#edit-event-notify-switch.switch[type=checkbox][checked]` + label
   "Do you want to be notified when someone signs up?"
4. `input#edit-event-multiuser-switch.switch[type=checkbox]` + label
   "Allow multiple volunteers per signup?"

Footer: `button#edit-event-submit.button.is-success` "Save".

Legacy quirks — **all dropped in the rewrite**: labels use `<div class="label">` not
`<label class="label">` (Bulma styles by class so it renders identically, but the fields have
no accessible label association); dead classes `set-output`, `edit-event-notify-out`,
`edit-event-multiuser-out`; the typo `edit-event-multuser-out`.

### 2.4 `#edit-activity-modal`

Title "Add an Activity" / "Update an Activity" / "View Activity". Fields:

1. "Activity" → `input#edit-activity-short-descr.input[type=text]`, placeholder "What's the activity?"
2. "Description" → `textarea#edit-activity-long-descr.textarea[rows=4]`, placeholder "Describe the activity!"
3. **"Acitvity Volunteer Cap"** *(typo in source — normalized to "Activity" in the rewrite)*
   → `input#edit-activity-vol-cap-switch.switch.toggle.toggle-activity-vol-cap[checked]`,
   label "Unlimited volunteers for this activity?"
4. `div.field.toggle-activity-vol-cap[style="display:none"]` →
   `input#edit-activity-vol-cap-field.input.integer-validation[type=number][min=1][max=255]`,
   placeholder "How many volunteers do you need for this event?"
5. "Slot Volunteer Cap Default" → `input#edit-activity-slot-vol-cap-def-switch.switch.toggle.toggle-slot-vol-def-cap[checked]`,
   label "Unlimited volunteers per slot by default?"
6. `div.field.toggle-slot-vol-def-cap[style="display:none"]` →
   `input#edit-activity-slot-vol-cap-def-field.input.integer-validation[type=number][min=1][max=255]`,
   placeholder "How many volunteers per slot by default?"

Footer: `#edit-activity-sav.button.is-success` "Save Activity",
`#edit-activity-del.button.is-warning` "Remove Activity".

**The `toggle` / `toggle-X` protocol** is the app's own show/hide contract: an input with class
`toggle toggle-X` controls visibility of every other element with class `toggle-X`
(`app.js:3065-3073`). **Checked switch = "unlimited" = numeric field hidden.** In Svelte this
becomes `{#if}` blocks, but the default checked/hidden pairing must be preserved.

### 2.5 `#edit-window-modal`

Title "Add a Window" / "Update a Window" (there is no read-only "View Window" branch — the
rewrite adds one). Body is a single `div.field` with `div#edit-window-control.control >
input#edit-window-range.input[type=date]`. Footer: `#edit-window-sav.button.is-success`
"Save Window", `#edit-window-del.button.is-warning` "Remove Window".

`#edit-window-control` is **emptied and the input re-created** on every open before
`bulmaCalendar.attach` (`app.js:583-613`) — a fresh instance per open, because the legacy
never destroyed instances. The rewrite attaches in `$effect` with explicit teardown instead.

### 2.6 `#edit-detail-modal`

```html
<div class="select">
  <select id="edit-detail-type-dropdown">
    <option selected="true" disabled="disabled">What type of detail?</option>
    <option value="STRING">Text</option>
    <option value="BOOLEAN">True/False</option>
    <option value="INTEGER">Whole Number</option>
    <option value="EMAIL">Email Address</option>
    <option value="PHONE">Phone Number</option>
  </select>
</div>
```

Then "Field" → `input#edit-detail-field.input[type=text]`, placeholder "What do you need from
your volunteers?"; "Description" → `textarea#edit-detail-descr.textarea[rows=4]`, placeholder
"You can put additional instructions or requirements here if you want."; and a bare
`input#edit-detail-required-switch.switch` (no `toggle`, and its label has no `class="switch"`)
with text "Should users be required to answer this?".

Footer: `#edit-detail-sav.button.is-success` "Save Detail",
`#edit-detail-del.button.is-warning` "Remove Detail".

### 2.7 `#edit-slot-modal` — "Edit a Slot"

Two disabled context fields, each with an inline edit tag:

```html
<div class="label">Activity&ensp;<button id="edit-slot-activity-btn" class="tag is-warning">Edit</button></div>
<input id="edit-slot-activity-field" class="input" type="text" disabled="disabled" />
<div class="label">Window&ensp;<button id="edit-slot-window-btn" class="tag is-warning">Edit</button></div>
<input id="edit-slot-window-field" class="input" type="text" disabled="disabled" />
```

*(Source has malformed `<button …>Edit</span>` on both — browser auto-corrects. Emit valid
markup.)* `&ensp;` separates label text from the tag.

Then `input#edit-slot-enable-switch.switch.is-warning.toggle.toggle-slot-cap-fields[checked]`
("Enable this slot?" — the only non-default-colored switch in the app), wrapping
`div#edit-slot-cap-fields.toggle-slot-cap-fields` which contains
`input#edit-slot-vol-cap-switch.switch.toggle.toggle-slot-vol-cap[checked]` ("Unlimited
volunteers for this slot?") and `div.field.toggle-slot-vol-cap[style="display:none"] >
input#edit-slot-vol-cap-field.input.integer-validation[type=number][min=1][max=255]`.

Footer uses `div.buttons.is-right` (the only modal that does) with
`#edit-slot-sav.button.is-success` "Update Slot".

### 2.8 `#edit-vol-modal`

Title "Add a Volunteer" / "Update a Volunteer". Static skeleton is one `div.field > div.control`
with `<label class="label">Name&ensp;</label>` and
`input#vol-detail-name.input[type=text]`, placeholder "What's the volunteer's name?".
The trailing `&ensp;` is deliberate — it is the gap where the error tag is appended.

Dynamic fields (`app.js:745-830`): all `div.field` after the first are removed, then one is
appended per custom detail. Label text is `detail.data.field`, plus `' (required)'` when
required, plus `&ensp;` for every type **except BOOLEAN**.

| Detail type | Generated control |
|---|---|
| `BOOLEAN` | label gets `class="switch"` + `for`; input prepended: `<input type="checkbox" class="switch is-rtl">` |
| `STRING` | `<input type="text" class="input" placeholder="{description}">` |
| `INTEGER` | `<input type="number" min="0" class="input integer-validation" placeholder="{description}">` |
| `EMAIL` | `<input type="text" class="input" …>` (type=text, **not** email) |
| `PHONE` | `<input type="text" class="input" …>` |

Footer: `#edit-vol-sav.button.is-success` "Save Volunteer",
`#edit-vol-del.button.is-warning` "Remove Volunteer".

**Error tag pattern** (`setErrorTag`, `app.js:1056`) — used across all validated modals:

```js
input.addClass('is-danger');
input.siblings('label').append(
  $('<button/>').addClass('tag is-danger has-tooltip-right')
                .attr('data-tooltip', hint).text('Error'));
```

A red "Error" pill inside the label with a right-side tooltip, and the input turns red.
Messages seen: "Please provide a name.", "This field is required.". In the legacy, tags clear
only on the *next* validation attempt — the rewrite clears per-field on input.

### 2.9 `#authentication-modal`

Head has **two** titles, both `p.modal-card-title.toggle-auth-confirm-pass` — "Log In" and
"Register" (the second hidden). Fields: "Email Address" →
`input#auth-modal-email.input[type=email]`, placeholder "What's your email address?";
"Password" → `input#auth-modal-password.input[type=password]` (no placeholder);
"Is this a new account?" → `input#auth-modal-new-account-switch.switch.toggle.toggle-auth-confirm-pass`
with label "Click here if you'd like to register!"; and a hidden
`div.field.toggle-auth-confirm-pass` containing
`input#auth-modal-confirm-pass.input[type=password]`, placeholder "Please confirm your password."

Footer buttons, all `toggle-auth-confirm-pass`: `#auth-modal-login-btn.button.is-info` "Log In!",
`#auth-modal-reset-btn.button.is-danger` "Reset Account",
`#auth-modal-register-btn.button.is-info` "Register!" (hidden).

Note these are `is-info` (blue), not `is-primary` — the only blue buttons besides Update Profile.
One toggle flips two titles, three buttons, and the confirm field.

### 2.10 `#profile-modal`

"Change your email address?" → `input#profile-modal-email.input[type=email]`, placeholder
"me@email.tld"; "Change your password?" → `input#profile-modal-password.input[type=password]`;
and a hidden `div.field` "Please confirm your password." →
`input#profile-modal-confirm-pass.input[type=password]`. The confirm field has **no toggle
class** — it is shown/hidden imperatively. Footer:
`#profile-modal-update-btn.button.is-info` "Update Profile".

There is **no separate reset modal** — "Reset Account" is `#auth-modal-reset-btn` inside the
auth modal, and the reset-consume flow reuses `#profile-modal` with fields hidden.

### 2.11 `#guest-auth-prompt-modal` — "Hey there friend!"

Four paragraphs, class-gated by context:

- `.guest-on-publish .guest-on-voladd` — "Looks like you aren't logged in... but that's totally fine!"
- `.guest-on-publish` — "You can absolutely publish an event without creating an account. But, it means you won't be able to go back and edit your event submission."
- `.guest-on-voladd` — "You're more than welcome to add a volunteer without creating an account. But, it means you won't be able to go back and edit details after you've finished signing up."
- `.guest-on-publish .guest-on-voladd` — "Would you like to sign in or create an account so you can go back and edit your event later?"

Footer: `#guest-auth-prompt-open-auth.button.is-success` "Yes please!",
`#guest-auth-prompt-proceed-nologin.button.is-danger` "No thanks, I'm good!".

### 2.12 `#captcha-modal` — "Are you human?"

Body is one `p.mb-4` of apology copy plus `<div id="captcha"></div>`. Footer is a paragraph
("Thank you for helping us out!"), not buttons. `grecaptcha.enterprise.render('captcha', {sitekey})`
at boot; `renderCAPTCHA` only shows it when `!userData` — **logged-in users skip CAPTCHA entirely.**

---

## 3. Bulma plugins

| Plugin | JS? | Used by |
|---|---|---|
| bulma (1.x — has `fixed-grid`, `cell`, `theme-light`) | — | everything |
| bulma-block-list | no | dashboard boxes; **every event-table cell** |
| bulma-calendar | yes (1 MB) | `#edit-window-range` |
| bulma-pageloader | no | boot overlay |
| bulma-slider | yes | `#view-event-slider` |
| bulma-switch | no | ~10 checkboxes |
| bulma-tooltip | no | `data-tooltip` on activity cells; `has-tooltip-right` error tags |
| bulma-toast | yes (vendored, on npm) | ~35 call sites |

### 3.1 bulma-block-list — the cell primitive

`addCell()` (`app.js:31`) produces:

```html
<div class="cell event-cell" [data-tooltip="hint"]>
  <ul class="block-list is-small is-centered {aesthetics}">
    <li>{label}</li>
  </ul>
</div>
```

Default `aesthetics = 'is-outlined is-primary'`. **The normative matrix:**

| Tile | `ul` classes |
|---|---|
| top-left spacer | `block-list is-small is-centered` (no aesthetics, no label) |
| activity header | `block-list is-small is-centered is-primary` |
| window header | `block-list is-small is-centered is-primary` |
| slot, disabled | `… is-outlined is-light` — label `Unavailable` |
| slot, editing | `… is-outlined is-primary` — label `{rsvpCount} / {cap}` |
| slot, has RSVP | `… is-outlined is-warning` — label `Booked` |
| slot, at capacity | `… is-outlined is-light` — label `At Capacity` |
| slot, open | `… is-outlined is-primary` — label `Available` |
| empty event | `block-list is-small is-centered is-warning`, 1 col — "You haven't added any windows or activities to your event yet!" |

Activity tiles carry `data-tooltip = activity.description`. Window and slot tiles carry none.
Legacy sets `data-tooltip` without a `has-tooltip-*` class so tooltips may not render — the
rewrite adds the class.

`addCell` uses `.html(label)` — an XSS vector on activity short descriptions. The rewrite uses
text interpolation, with window headers emitting real `<br />` markup.

### 3.2 bulma-calendar

Attached fresh on every window-modal open (`app.js:589-613`):

```js
{ displayMode: 'dialog', isRange: true, timeFormat: 'hh:mm a', type: 'datetime',
  validateLabel: 'Save', minDate: tomorrow,
  startDate: tomorrow@08:00, endDate: tomorrow@17:00 }
```

Modal dialog (not inline dropdown), range selection, dual date panes, two 12-hour time pickers,
footer button labeled "Save", minimum selectable date tomorrow.

**Bug to avoid:** legacy does `calOpts.startTime = calOpts.startDate` then `setHours` — the same
Date instance, so both mutate. Clone. Also `minDate: tomorrow` is applied even when *editing* a
window whose start is in the past.

### 3.3 bulma-slider

The static markup is placeholder only. `renderEventTableSlider` (`app.js:321`) removes and
rebuilds it with the real classes:

```
slider is-fullwidth is-small is-primary is-light
```

`min=1`, `step=1`, `max = activities.length > 3 ? activities.length - 3 : 1`. A module-level
**hidden** `<output for="view-event-slider">` receives the value, and a `MutationObserver` on it
re-renders the table. In Svelte this collapses to reactive state — **but the output must remain
visually absent**; no number renders next to the slider.

### 3.4 bulma-switch

Always `<input type="checkbox" class="switch …">` immediately followed by `<label for="…">`.
Variants: plain `switch`; `switch toggle toggle-X`; `switch is-warning` (only
`#edit-slot-enable-switch`); `switch is-rtl` (dynamic BOOLEAN volunteer fields, knob right of
the label). Some labels carry `class="switch"`, some don't — an inconsistency in the original
that matters if bulma-switch styles the label.

### 3.5 bulma-toast

App overrides at DOM-ready (`app.js:3204`):

```js
toast_setToast_Defaults({ duration: 5000, position: 'top-center', closeOnClick: true });
```

5-second, top-center, click-to-dismiss. Types used: `is-danger` (most), `is-success`,
`is-warning` (logout), `is-info` (reset-email notice). No `animate` option and animate.css is
not loaded — toasts appear and disappear without animation.

---

## 4. `style.css` — the entire custom stylesheet

427 bytes, two rules. Both must survive into the rewrite:

```css
.datetimepicker .timepicker .timepicker-end .timepicker-hours .timepicker-input input,
.datetimepicker .timepicker .timepicker-end .timepicker-minutes .timepicker-input input,
.datetimepicker .timepicker .timepicker-start .timepicker-hours .timepicker-input input,
.datetimepicker .timepicker .timepicker-start .timepicker-minutes .timepicker-input input {
  padding: 1.1em;
}

.event-cell ul.is-outlined li {
  height: 94%;
}
```

**Rule 1** overrides bulma-calendar, whose stock padding leaves the hour/minute inputs cramped
in the range dialog's time picker.

**Rule 2** is the grid-flush fix. Grid cells stretch to the tallest row member but the inner
`ul.block-list > li` does not, so outlined slot tiles ended shorter than solid header tiles and
the grid looked ragged. `94%` (not 100%) leaves room for the block-list's own border/margin.
Targets **only** `.is-outlined` lists — i.e. slot tiles, not the solid activity/window headers.

Also note `frontend/public/report.html` links `/assets/css/report.css`, **which does not exist**.
The report falls back to its inline `<style>` block. Either add the file or drop the link.

---

## 5. Theme and color

- `<html class="theme-light">` is hardcoded, and `grep -n "theme" app.js style.css` returns
  **zero hits** — no switcher, no toggle, no persistence, no dark class anywhere.
- Bulma 1.x ships `.theme-light`/`.theme-dark` plus `prefers-color-scheme` blocks. Because the
  root class is pinned, a user on a dark-mode OS still sees the light palette. **Preserve
  `class="theme-light"` on `<html>`** or dark-OS users get an unintended dark render.
- Primary is Bulma's stock turquoise `#00d1b2` (`--bulma-primary-h: 171deg; s: 100%; l: 41%`),
  which exactly matches `email.template.accentColor` in `yasss.cfg`. Brand color = Bulma default;
  no Sass build, no variable overrides, stock `bulma.min.css`.

Semantic usage:

| Class | Where |
|---|---|
| `is-primary` | brand text, main CTAs, activity/window headers, available slots, volunteer select, slider |
| `is-info` | auth buttons and Update Profile only |
| `is-success` | all modal Save/confirm buttons, Copy to Clipboard, "Yes please!" |
| `is-warning` | all Remove/Update buttons, `Booked` slots, slot enable switch, empty-table cell |
| `is-danger` | Reset Account, "No thanks, I'm good!", error tags/inputs, danger toasts |
| `is-light` | disabled/at-capacity slots; paired with `is-outlined` on small header buttons |

---

## 6. Assets

- `assets/img/yasss_logo_small.png` (1,144 bytes) — the only image. Referenced in the navbar and
  server-side in `yasss.cfg` as `email.template.headerImage`.
- `favicon.ico` — present, **never linked**.
- `report.html` — standalone printable report, opened via `#view-event-view-report`.
- **No icon font** (no Font Awesome/Material), no `<span class="icon">`, no web fonts. The entire
  UI is Bulma's default system font stack plus one PNG.

---

## 7. Responsive behavior

**There are zero responsive helper classes in the entire app.** No `is-mobile`,
`is-hidden-mobile`, `is-hidden-touch`, `is-desktop`, `is-tablet`; no media queries in
`style.css`. All responsiveness is stock Bulma 1.x:

1. **`.grid` / `.cell`** (dashboard boxes, view-event summary split) — `display: grid` with
   `repeat(auto-fill, minmax(9rem, 1fr))`, so both reflow 2-up → 1-up automatically. The source
   comments say "left side (on large screens)", confirming the intent.
2. **`.fixed-grid.has-N-cols`** (the event table) — the one fixed column count, set by JS from
   `maxTableCols = 5`: 0 activities → `has-1-cols`, 1 → 2, 2 → 3, 3 → 4, 4+ → capped at 5.
   Without `has-N-cols-mobile`/`-tablet` modifiers, Bulma keeps N columns at **every** breakpoint.
   **The table does not stack or reflow on phones** — at 5 columns on a ~375 px viewport each tile
   gets ~65-70 px and labels like "At Capacity" wrap or clip. That is legacy behavior; reproduce
   it, or flag any change as deliberate.
3. **Horizontal paging instead of reflow** — more than 3 activities are paged with the slider,
   not scrolled. Window rows always render in full; only the activity axis is windowed.
4. **The navbar** has no burger, so on mobile the four links stack below the brand.
5. **Modals** use stock `modal-card` — `width: calc(100vw - 40px)` under 769 px, body scrolls.

---

## 8. Legacy defects — disposition

Places where a faithful port and a correct port diverge. Decisions already made:

| Item | Disposition |
|---|---|
| Missing `<!DOCTYPE html>` (quirks mode) | **Fix** — new shell has it; invalidates pixel diffing |
| `#md-view-modal` title never set | **Fix** — `title` prop |
| Malformed `<button …>Edit</span>` ×2; unclosed `div.field` in vol modal | **Fix** — emit valid markup |
| "Acitvity Volunteer Cap"; "Your Upcoming RSVPS" | **Fix** — copy normalization |
| Dead classes `set-output`, `edit-event-notify-out`, `edit-event-multuser-out` | **Drop** |
| `<div class="label">` instead of `<label class="label">` | **Fix** — real labels, `for` associations |
| Relative logo `src` | **Fix** — absolute |
| Hidden `<output>` + MutationObserver | **Replace** with reactive state; keep it visually absent |
| `.integer-validation` class | JS hook, not styling → becomes `NumberInput.svelte` |
| `toggle` / `toggle-X` protocol | Becomes `{#if}`; preserve the default checked/hidden pairing |
| `data-tooltip` without `has-tooltip-*` | **Fix** — add the class so tooltips render |
| `addCell` `.html(label)` XSS | **Fix** — text interpolation |
