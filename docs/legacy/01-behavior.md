# BEHAVIORAL INVENTORY — `frontend/public/assets/js/app.js` (legacy jQuery frontend)

> Derived from all 3223 lines of `app.js`, the legacy `index.html`
> (`git show 38cc8b2~1:src/main/resources/public/index.html`, deleted by the Svelte
> migration commit), and `axb-sig-req.min.js`. This is the reference specification for
> the Svelte 5 rewrite. See `00-README.md` for how to use it.

**Files of record**
- `/home/cpower/projects/crowdease/yasss/frontend/public/assets/js/app.js` (3223 lines) — the reference implementation
- Legacy DOM: `git show 38cc8b2~1:src/main/resources/public/index.html` (834 lines; deleted in the Svelte migration commit `38cc8b2`). `frontend/index.html` is the *new* Svelte shell, not the reference.
- `/home/cpower/projects/crowdease/yasss/frontend/public/assets/js/axb-sig-req.min.js` — supplies `window.genCreds`
- Vendored deps loaded `defer` in order: jQuery 3.7.1, js-cookie, bulma-calendar, bulma-slider, bulma-toast, showdown 2.1.0, axb-sig-req, app.js, then `recaptcha/enterprise.js?onload=loadCAPTCHA&render=explicit&hl=en` (async defer).

---

## 0. Global state model

### 0.1 Module globals (lines 1–11)
| Var | Line | Notes |
|---|---|---|
| `debug` | 1 | `false`; only ever set from the server in `loadCAPTCHA` (line 2730) |
| `captchaRequired` | 2 | `true`; **written at line 2734 but never read anywhere** — dead |
| `userData` | 3 | `null` or `{account, session, accessLevel, ownedEvents?}` |
| `urlParams` | 4 | `URLSearchParams`, assigned only in `loadSite` (2791) |
| `maxTableCols` | 6 | `const 5` |
| `eventTableData` | 8 | initialized by `clearTable()` at line 9 |
| `eventChanges` | 11 | **declared, never read or written — dead** |
| `viewTableSliderOutput` | 317 | detached `<output for="view-event-slider">`, hidden |
| `captchaCallback` | 2722 | one-shot CAPTCHA continuation |

### 0.2 `clearTable()` (17–29) — the canonical shape
```js
eventTableData = {
  summary: {},        // {id,title,description,notifyOnSignup,allowMultiuserSignups,admin,volunteersMaxed,expired}
  activities: [],     // [{label, fn, data:{idx, id?, label, description, activityVolunteerCap, slotVolunteerCapDefault, tblIdx?}}]
  windows: [],        // [{label, fn, data:{idx, id?, startDate:Date, endDate:Date, tblIdx?}}]
  slots: [],          // window-major flat array, see §2.2
  details: [],        // [{fn, data:{id?, type, field, description, required, tblIdx}}]
  volunteers: [],     // [{id?, name, remindersEnabled, user?, details:[{detail,value}], rsvps:[{activity,window}]}]
  currentVol: -1,
  step: 1,
  editing: false
}
```
Called at boot (9), at the top of `retrieveEvent` (2390), and when the create-event wizard summary is saved (2837).

### 0.3 Three UI modes
The whole app is a single page toggling three `<section>`s: `#coa-section` (marketing/CoA), `#list-event-section` (logged-in dashboard: two boxes of upcoming events), `#view-event-section` (the event table). Within `#view-event-section` there are three *behavioral* modes:

1. **View / RSVP mode** — `eventTableData.editing === false`, event has an `id`. Cells are RSVP toggles.
2. **Editing mode** — `editing === true`, entered via `#view-event-modify-event`, only for the event's admin. Every CRUD op publishes to the API immediately.
3. **Creation wizard** — `editing === false` but `summary.id` is absent. All CRUD is purely local until `#view-event-publish-event` does one big `POST /v1/events`.

---

## 1. USER-FACING FLOWS (end to end)

### 1.1 Boot sequence (3201–3223)
1. `toast_setToast_Defaults({duration:5000, position:'top-center', closeOnClick:true})` (3202).
2. `JSON.parse(Cookies.get('user'))` inside `try` → on success set `userData` and `toggleAuthUI(true)`; on throw (no cookie / bad JSON) `logDebug('no auth cookie detected')` + `toggleAuthUI(false)` (3208–3217).
3. `refreshUserSession(userData?.session ?? null, loadSite)` (3219–3221) — `loadSite` runs as the `saveSession` success **and** failure continuation, so the site always initializes.
4. `loadSite` ends with `setTimeout(() => $('.pageloader').removeClass('is-active'), 1000)` (3196–3198) — a hard-coded 1 s splash.
5. Independently, Google reCAPTCHA's `onload=loadCAPTCHA` fires `loadCAPTCHA()` (2724).

### 1.2 Anonymous event viewing
- Entry: `?event=<uuid>` in the query string (2793). Optional `&share` opens the share modal as a `postHook` (2794–2797).
- `retrieveEvent(eventID, postHook)` (2379) → `GET /v1/events/{id}` → `clearTable()` → populate `summary`, windows, activities+slots, details, volunteers → `renderEventTableMeta(title, descr, false)` → bind buttons → `refreshTable()` → hide `#coa-section`/`#list-event-section`, show `#view-event-section` (2600–2602); hide all `add-*` buttons and `#view-event-publish-event` (2603–2609).
- Expiry gate (2611–2617): if `!expired || userData.accessLevel === 'ADMIN'` → hide `#view-event-expired`, show `#view-event-save-rsvps`; else the inverse.
- Errors (2707–2719): toast per status — `404` "That event doesn't exist. Sorry about that."; `402` "That event hasn't yet been published. Sorry about that."; `403` "Access denied."; anything else "An internal error prevented us from showing your event. Sorry about that."
- Also reachable by clicking an entry in the dashboard lists (`setUpcomingEvents`, 1298–1303 → `retrieveEvent(event.id)`).

### 1.3 Volunteer sign-up (RSVP set / unset) — `onPubdSlotClick` (1716–1812)
Guard (1717–1718): if `summary.expired && !(userData && accessLevel === 'ADMIN')` → return, no-op.

Non-editing branch condition (1737–1740): `volunteers.length && d.slotEnabled && (rsvpState.hasRSVP || !rsvpState.atCapacity)`.

- `vol = volunteers[currentVol]`; `idx = vol.rsvps.findIndex(e => e.activity == d.activity && e.window == d.window)`.
- **Un-RSVP** (`idx !== -1`, 1747–1775): resolve `actId`/`winId` from the index. `delFn` removes `vol.id` from every matching slot's `data.rsvps` and decrements `data.rsvpCount`, splices `vol.rsvps[idx]`, calls `updateSelectedVol()`. If `vol.id` exists → `pubRSVPDeletion(actId, winId, vol.id, delFn)` (server-first); otherwise `delFn()` immediately (local-only).
- **RSVP** (1777–1807): `mkFn` pushes `vol.id` into every matching slot that doesn't already have it and increments `rsvpCount`; pushes `{activity, window}` onto `vol.rsvps`; `updateSelectedVol()`. If `vol.id` → `pubRSVPCreation(actId, winId, vol.id, mkFn)`, else `mkFn()`.
- Note the local mutation is applied **after** the server confirms (it is the `saveSession` success callback), so a failed request leaves the UI unchanged.

`getCurrentRSVPState(slot)` (1695–1714) returns:
- `hasRSVP`: `-1 < currentVol && volunteers[currentVol].rsvps` contains a matching `{activity, window}`.
- `atCapacity`: `(slotVolunteerCap !== 0 && rsvpCount >= slotVolunteerCap) || (activity.activityVolunteerCap !== 0 && sum(rsvpCount over all slots of that activity) >= activityVolunteerCap)`.
- `count`: `slot.rsvpCount`.

**Submit RSVPs** (`#view-event-save-rsvps`, 2593–2596) → `renderCAPTCHA(pubRSVPS)` → `pubRSVPS` (2346) does `GET /v1` with the CAPTCHA token, and on `status === 'ok'` toasts *"RSVP successfully submitted!"* and calls `pubVolCreation(vol)` for **every volunteer without an `id`**. This is the only path that ever persists a locally-added volunteer, because both direct `pubVolCreation(data)` calls in the add-volunteer flow are **commented out** (2537, 2548).

### 1.4 Volunteer CRUD
**Add** (`#view-event-add-vol`, bound in `retrieveEvent` 2514–2559). Visibility gate (2515–2519):
```
(!expired || userData && ADMIN)
 && (allowMultiuserSignups
     || userData && userData.account == summary.admin
     || !volunteersMaxed && !volunteers.filter(v => !v.id).length)
```
Handler → `renderVolEditModal(true, savFn)`. `savFn`:
1. `validateVolEditModal()`; `null` → return `false` (modal stays open).
2. If `!userData && !volunteers.length` → `renderGuestAuthPrompt('.guest-on-voladd', loginFn, proceedFn)` and return `false`. `loginFn` = reset auth modal, hide the guest prompt, show `#authentication-modal`. `proceedFn` = hide `#edit-vol-modal`, `mkVolunteer(data)`, `renderVolDropdown()`, select the last `<option>`, `updateSelectedVol()`.
3. Otherwise `mkVolunteer(data)` + dropdown refresh + select last + `updateSelectedVol()`, return `true`.

**Update / Delete** (`#view-event-chg-vol`, 2561–2591) → `renderVolEditModal(false, savFn, delFn, volunteers[currentVol])`.
- `savFn`: validate → `Object.assign(volunteer, data)`; if `volunteer.id` → deep-clone minus `rsvps` → `pubVolUpdate` → `PATCH /v1/events/{id}/volunteers/{vid}`; then `renderVolDropdown()` + `updateSelectedVol()`.
- `delFn`: if `vol.id` → `pubVolDeletion(vol.id)` (`DELETE`); then `rmVolunteer(Number($('#view-event-volunteer option:selected').val()))`, refresh dropdown + table.

**Dropdown** `renderVolDropdown()` (411–437): unbinds `change`, removes all `<option>`. Empty → hide `#view-event-chg-vol`, disable the select, one option "Add a volunteer!". Non-empty → show `#view-event-chg-vol` iff `!expired || ADMIN`, enable select, one `<option value=i>` per volunteer with `vol.name`, rebind `change → updateSelectedVol()`.

`updateSelectedVol()` (398–409): `currentVol = Number(selected.val())`, then `refreshTable(eventTableData.step)`.

### 1.5 Event creation wizard (`#create-event-nav`, `#create-event-cta` — 2825–3020)
1. Unbinds `#view-event-modify-event` / `#view-event-close-editor` click handlers (2827–2828).
2. `renderEventSummaryModal(true, savFn)`. On save: `validateSummaryModal()`; hide `#coa-section`, `#list-event-section`, `#view-event-volunteer`; `clearTable()`; `renderEventTableMeta(title, descr, true)`; `eventTableData.summary = s` (full replacement); `refreshTable()`; show `#view-event-section`; hide `modify-event`/`close-editor`/`save-rsvps`; show `add-activity`/`add-window`/`add-field`/`publish-event`/`#view-event-buttons` (2830–2855).
3. Rebinds four buttons to **purely local** handlers:
   - `#view-event-edit-summary` (2858–2873): re-open summary modal, re-render meta, replace `summary`, `refreshTable()`.
   - `#view-event-add-activity` (2876–2930): `validateActivityModal({idx: activities.length})`; build one slot per existing window with `slotEnabled:true, slotVolunteerCap: data.slotVolunteerCapDefault`; `mkActivity(...)` with an inline click handler that re-opens the activity modal in edit mode (`Object.assign(activity, a)`, relabel, `refreshTable`) and a delete handler (`rmActivity(activity.idx)` + `refreshTable`); each slot gets a click handler opening the slot modal (`Object.assign(s, newSlotVals)` + `refreshTable`).
   - `#view-event-add-window` (2933–2987): mirror of the above; `validateWindowModal({idx: windows.length})`, one slot per existing activity, `mkWindow(...)`, label from `fmtDateRange(startDate, endDate)`.
   - `#view-event-add-field` (2990–3019): `validateFieldModal({idx: details.length})`, `mkDetail(...)` with edit/delete handlers, `renderFieldTable()`.
4. **Publish** (`#view-event-publish-event`, 3046–3057): if `userData` → `renderCAPTCHA(pubEventCreation)`; else `renderGuestAuthPrompt('.guest-on-publish', loginFn, () => renderCAPTCHA(pubEventCreation))`.
5. `pubEventCreation` (1835–1927) → `POST /v1/events`. On success: toast *"Successfully created your event!"*; if `data.paymentRedirect` → `window.location.replace(paymentRedirect)`; else `retrieveUserOwnedEvents(...)` and `window.location.replace(origin + "?event=" + data.event.id + "&share")`. On failure: toast "Couldn't create your event... sorry."

### 1.6 Event editing mode (published event)
`#view-event-modify-event` is shown only when `userData.account === summary.admin && (!expired || ADMIN)` (2619–2625), or when `userData.ownedEvents.includes(summary.id)` (2691–2700).

Entering (2627–2672): `editing = true`, `currentVol = -1`, `refreshTable(step)`, `renderEventTableMeta(..., true)`, hide `modify-event` + `save-rsvps`, bind and show `add-activity` / `add-window` / `add-field` (each publishing immediately via `pubActivityCreation` / `pubWindowCreation` / `pubDetailCreation`), show `close-editor`.

Exiting (2674–2689): `editing = false`, `updateSelectedVol()`, `refreshTable(step)`, `renderEventTableMeta(..., false)`, hide add-* and close-editor, show modify-event + save-rsvps.

Cell clicks in editing mode route to `onPubdActivityClick` (1654), `onPubdWindowClick` (1674), `onPubdSlotClick` (1716, editing branch), and `onPubdDetailClick` (1814) — each gated by `if(!editing || expired && !ADMIN) return;` (note: `onPubdSlotClick` only checks expiry, not `editing`, because it also serves the RSVP path).

### 1.7 Activity / Window / Detail / Slot CRUD (published event)
| Op | Function | Effect on local model |
|---|---|---|
| Create activity | `pubActivityCreation` (1967) | on success `activity.id = res.responseJSON.activity.id`; builds `windows.length` slots all `{slotEnabled:false, slotVolunteerCap:0}`; `mkActivity` + `refreshTable` |
| Update activity | `pubActivityUpdate` (2003) | diffs against `activities[idx].data`; no diff → **silent return**; on success `Object.assign(current, activity)` and update `.label` |
| Delete activity | `pubActivityDeletion` (2036) | `rmActivity(aIdx)` + `refreshTable` |
| Create window | `pubWindowCreation` (2051) | `win.id` from response; `activities.length` disabled slots; `mkWindow` |
| Update window | `pubWindowUpdate` (2085) | diff on `beginTime`/`endTime`; relabels via `fmtDateRange` |
| Delete window | `pubWindowDeletion` (2112) | `rmWindow(wIdx)` |
| Update slot | `pubSlotUpdate` (2127) | if it *was* enabled and is now disabled → `DELETE .../activities/{a}/windows/{w}`; else if enabled → `PUT` with `{maxSlotVolunteers}`. Reads `current = slots[slot.window * activities.length + slot.activity]` |
| Create detail | `pubDetailCreation` (2168) | `detail.id` from response; `mkDetail` + `renderFieldTable` |
| Update detail | `pubDetailUpdate` (2192) | diff on type/label/hint/required |
| Delete detail | `pubDetailDeletion` (2223) | `rmDetail(dIdx)` + `renderFieldTable` |

### 1.8 Reordering — the `mv*` functions (85, 140, 177, 197)
**Critical finding: none of `mvActivity`, `mvWindow`, `mvDetail`, `mvVolunteer` is called anywhere in the file** (verified by grep — the only hits are their own declarations). There is no reordering UI. They are entirely dead code.

**What they would do to `priority`: nothing.** No `mv*` function touches a `priority` field, and no `mv*` function issues an API call. `priority` is written in exactly two places:
- `pubEventCreation` (1854): `priority: i` — the activity's array index at publish time.
- `pubActivityCreation` (1976): `priority: eventTableData.activities.length` — i.e. append-to-end.

So activity order is fixed at creation and can never be changed by this frontend. Windows, details, and volunteers have no priority concept at all; their order is derived from the API response order (`retrieveEvent`, 2409–2478).

Mechanics, for the record:
- `mvActivity(from, to)` (85–105): bounds check; `from == to` is a no-op; splices the activity to `from < to ? to-1 : to`; then for each of the `windows.length` rows, moves the slot at `i*activities.length + from` to `i*activities.length + (from<to ? to-1 : to)`; then reindexes `activity.data.idx = i` and `slot.data.activity = i % activities.length`. Does **not** update `slot.data.window` (unnecessary — row membership is preserved).
- `mvWindow(from, to)` (140–158): moves the window, then moves a whole contiguous block of `activities.length` slots via `splice(..., 0, ...slots.splice(activities.length*from, activities.length))`; reindexes `window.data.idx` and `slot.data.window = Math.floor(i / activities.length)`.
- `mvDetail(from, to)` (177–185) / `mvVolunteer(from, to)` (197–205): plain array splices, no reindexing (`tblIdx` is recomputed by `renderFieldTable`).

The `mk*` / `rm*` counterparts *are* live:
- `mkActivity(activity, slots)` (68–80): throws `'slot arr len does not match window arr len'` if `slots.length != windows.length`; sets `activity.data.idx`; pushes; splices each slot into position `(i+1) * activities.length - 1` (i.e. at the end of window-row `i`, *after* the activity count has already grown).
- `rmActivity(target)` (109–118): walks slots backward from `slots.length - activities.length + target` in strides of `activities.length`, splicing each; then splices the activity; reindexes.
- `mkWindow(window, slots)` (123–135): throws `'slot arr len does not match activity arr len'`; appends `activities.length` slots to the end of `slots`.
- `rmWindow(target)` (162–171): splices the contiguous block `[activities.length*target, +activities.length)`, then the window; reindexes.
- `mkDetail` (173) / `rmDetail` (187) / `mkVolunteer` (191, defaults `vol.rsvps = []`) / `rmVolunteer` (207).

### 1.9 User registration — `registerUser` (1207–1264)
1. `userEmail = $('#auth-modal-email').val().trim()`, `userPass = $('#auth-modal-password').val()`.
2. Throws (→ `console.error` + danger toast + clear loader):
   - `!emailRegex.test(userEmail)` → *"Please specify a valid email address."*
   - `0 == userPass.length` → *"Your password should be at least one character in length"* (no trailing period)
   - `userPass !== $('#auth-modal-confirm-pass').val()` → *"Oops! You might have mistyped your password confirmation."*
3. `renderCAPTCHA(cb)` → inside: `setLoaderBtn($('#auth-modal-register-btn'), true)`; `await genCreds(userEmail, userPass, '', '')`.
4. `POST /v1/users` body `{email, pubkey: sigReq.pubkey, generateMFA: false}`, header `X-CAPTCHA-TOKEN` **only** (does not use `injectAuth`).
5. Done → toast *"Your new account was successfully created :)"* + close `#authentication-modal`. Fail → toast `` `We ran into an issue creating your account: "${data.responseJSON.info}"` ``. Always → clear loader.

The register/login/reset UI is one modal (`#authentication-modal`) with a `#auth-modal-new-account-switch` toggle (`.toggle-auth-confirm-pass`) that swaps the title, shows the confirm-password field, and swaps `#auth-modal-login-btn` + `#auth-modal-reset-btn` for `#auth-modal-register-btn` (via the generic `.toggle` handler at 3065–3073).

### 1.10 Login — `userLogin` (1395–1462)
1. Loader on. Email regex check (throws *"Please specify a valid email address."*).
2. `sigReq = await genCreds(email, password, '', '')`.
3. `GET /v1` with header `Authorization: AXB-SIG-REQ ${sigReq.payload}` (the **payload**, not the session).
4. In `complete`: read headers `axb-account`, `axb-session`, `axb-access-level`. If account **and** session present → `userData = {account, session, accessLevel}`; `Cookies.set('user', JSON.stringify(userData))`; toast *"Logged in!"*; close modal; `retrieveUserOwnedEvents(account, () => { if(summary.id) retrieveEvent(summary.id) })`; `toggleAuthUI(true)`. Else → toast *"Invalid credentials. Try again?"*.
5. `.fail` → toast `` `Failed to log in: "${data.responseJSON.info}"` `` + close modal. `.always` → clear loader.

### 1.11 Logout — `userLogout` (1464–1474)
`userData = null` → if an event is open, `retrieveEvent(summary.id)` (re-fetch anonymously) → `Cookies.remove('user')` → toast *"You've been logged out!"* (`is-warning`) → `toggleAuthUI(false)`. No server call.

### 1.12 Session refresh — `refreshUserSession(session, fn)` (1476–1502)
- If `userData && userData.session`: `GET /v1` via `injectAuth({...}, session)`; `complete → saveSession(res, fn, fn)`; `.done → Cookies.set('user', JSON.stringify(userData))` (persists the rotated token); `.fail` (network-level only) → `Cookies.remove('user')`, two `console.error`s, toast *"Your user session was lost! Please log in again."*, `userData = null`, `toggleAuthUI(false)`.
- Else if `fn` is a function → `fn()`.
- **Unconditionally** `setTimeout(refreshUserSession, 1000 * 60 * 10)` at line 1501 (10 minutes, marked `// TODO make configurable`). Re-armed on every invocation, including after logout.

### 1.13 Profile update — `renderProfileUpdateModal` (853) + `profileUpdate` (1504–1559)
- Modal render does `GET /v1/users/{account}` first, sets `#profile-modal-email` **placeholder** to the current email and clears its value, clears both password fields, hides the confirm-password field, binds `#profile-modal-update-btn`, shows `#profile-modal`. Bails silently if `!userData || !userData.account` (854).
- `#profile-modal-password` `keyup focusout` (3091–3095) shows/hides the confirm field based on emptiness.
- `profileUpdate`: throws *"Please specify a valid email address."* if a non-empty email fails the regex; throws *"Oops! You might have mistyped your password confirmation."* on mismatch. Builds `userPatch = {}` + `email` if provided. If a password was given → `genCreds(email || placeholder, pass, '', '')` and add `pubkey`, then `PATCH /v1/users/{account}`. If only an email → `PATCH` directly. If neither → just clears the loader and does nothing. Returns `true` **synchronously** in all non-throwing cases → the modal always closes immediately.
- Done → toast *"Successfully updated your profile!"*; Fail → *"Couldn't update your profile... sorry."*

### 1.14 Account reset / password reset
Two halves:
- **Request** — `promptAccountReset` (1603–1632), bound to `#auth-modal-reset-btn` (3026). Email regex → loader on → `renderCAPTCHA(cb, onClose)` where `onClose` clears the loader if the CAPTCHA modal is dismissed → `POST /v1/users/{userEmail}` with the CAPTCHA header and **no body** → `.always` toasts *"If an account with the email address {email} exists, a reset email will be sent."* (`is-info`) and clears the loader. Deliberately does not leak account existence.
- **Consume** — inbound link `?action=reset-user&user=…&token=…` handled in `loadCAPTCHA` (2763–2768). Token has spaces re-encoded to `+` (2752). `renderProfileResetModal(() => accountReset(user, token))` (885–900) hides the email field and the confirm field, clears passwords, binds the update button, shows `#profile-modal`. `accountReset(user, token)` (1561–1601): confirm-password match → loader → `genCreds('', userPass, '', '')` (note: **empty email**) → `renderCAPTCHA` → `POST /v1/users/{user}` body `{token, pubkey}` + CAPTCHA header → done *"Successfully reset your account!"* / fail *"Couldn't reset your account... sorry."* / always clears loader and closes `#profile-modal`.

**Account verify** — `?action=verify-user&user=…&token=…` → `accountVerify(user, token)` (1634–1652) → `renderCAPTCHA` → `PUT /v1/users/{user}` body `{token}` → *"Successfully verified your account!"* / *"Couldn't verify your account... sorry."*

### 1.15 Guest-auth prompt — `renderGuestAuthPrompt(visible, loginFn, proceedFn)` (439–453)
Hides **all** `<p>` in `#guest-auth-prompt-modal .modal-card-body`, then shows only those matching the `visible` selector (`.guest-on-publish` or `.guest-on-voladd`). Rebinds `#guest-auth-prompt-open-auth` ("Yes please!") → hide prompt + `loginFn()`; `#guest-auth-prompt-proceed-nologin` ("No thanks, I'm good!") → hide prompt + `proceedFn()`. Activates the modal. Used at two sites: publish-event (3048) and first-volunteer-add (2527).

### 1.16 CAPTCHA flow
- `loadCAPTCHA()` (2724–2777), invoked by the reCAPTCHA script's `?onload=loadCAPTCHA`: `GET /v1` → `debug = res.responseJSON.debug`; if `!res.responseJSON.captcha` → `captchaRequired = false` (and never renders); else `grecaptcha.enterprise.render('captcha', {sitekey, callback})` where the callback hides `#captcha-modal`, invokes `captchaCallback(res)`, nulls it. Then the inbound-verification-link `switch` (2751–2771), wrapped in try/catch.
- `renderCAPTCHA(callback, onClose)` (2779–2787): **if `userData` is falsy** → store `captchaCallback`, `grecaptcha.enterprise.reset()`, show `#captcha-modal`, and bind `onClose` `.one('click')` to the modal's `button.delete`. **If logged in → the CAPTCHA is skipped entirely and `callback()` is called with no argument** (so `captchaRes` defaults to `null`).
- CAPTCHA-gated operations: register (1219), publish event (3047/3055), submit RSVPs (2595), account reset request (1612), account reset consume (1573), account verify (1635).

### 1.17 Event report viewing (3098–3111)
`#view-event-view-report` is shown only when `userData.account === summary.admin` (`renderEventTableMeta`, 223–228). Click → raw `fetch('/v1/events/{id}/report', {headers:{Authorization: 'AXB-SIG-REQ ' + userData.session}})` → `res.blob()` → `URL.createObjectURL(blob)` → `window.open(url, '_blank').focus()`. Errors are only `console.error`'d. Note this is the one place that bypasses `injectAuth` and jQuery entirely.

### 1.18 Sharing (2800–2808, 2793–2798)
- `#view-event-share` → set `#share-event-url` to `${window.location.origin}?event=${summary.id}` and activate `#share-event-modal`.
- `#share-event-copy` → `navigator.clipboard.writeText(...)` + toast *"Copied!"* (`is-success`).
- Auto-open after publish or via `?event=…&share`.

### 1.19 Markdown text display — `loadMarkdown(resource, container, modal)` (2362–2377)
`GET <resource>` (plain text) → `new showdown.Converter().makeHtml(data)` → `$(container).html(content)` → add `has-text-primary` to every `a` inside → if `modal` given, activate it. No failure handling.
- CoA: `loadMarkdown('/v1/texts/coa', '#coa-content', null)` unconditionally at 3114.
- ToS: `#terms-link-footer` (3117) and `?action=terms` (3136) → `/v1/texts/terms` into `#md-view-modal .content`.
- Privacy: `#privacy-link-footer` (3122) and `?action=privacy` (3140) → `/v1/texts/privacy`.

### 1.20 Other URL-param actions (3126–3144)
`?action=payment-success` → success toast *"Your event was successfully published!"*; `?action=payment-canceled` → danger toast *"Event publishing was canceled."*

### 1.21 Misc global UI handlers (loadSite, 3059–3095)
- `.modal .modal-close, .modal button.delete` click → `$(this).closest('.modal.is-active').removeClass('is-active')` (3060–3062).
- `.toggle` change (3065–3073): for every class on the element starting with `toggle-`, `$('.'+cls).not('.toggle').toggle()`. Drives the vol-cap fields, the slot cap fields, and the auth modal's register mode.
- `.integer-validation` `keyup focusout` (3076–3088): skip if `readonly`; read `min`/`max` attrs; if `isNaN(val)` or `val < min` → set to `min` (or 0); else if `val > max` → set to `max`.

---

## 2. THE EVENT TABLE RENDERING MODEL

### 2.1 `addCell(parent, label, hint='', aesthetics='is-outlined is-primary', fn=null, data={}, tblIdx=null)` (31–64)
Produces:
```html
<div class="cell event-cell" [data-tooltip="hint"]>
  <ul class="block-list is-small is-centered {aesthetics}">
    <li>{label as HTML}</li>
  </ul>
</div>
```
- `label` is inserted with `.html()` — **HTML injection surface** (window labels legitimately contain `<br />` from `fmtDateRange`).
- `hint` non-empty → `data-tooltip` attribute (the `has-tooltip-*` Bulma class is *not* added, so the tooltip may not actually render).
- If `tblIdx != null` it is written **into the caller's `data` object** as `data.tblIdx` (a side-effect that mutates the shared model).
- If `fn` is a function → `cell.on('click', () => fn(data))`.

### 2.2 Slot storage layout
Slots are a flat, **window-major** array: `slots[w * activities.length + a]`. This is asserted by:
- `mkActivity` splicing at `(i+1)*activities.length - 1` for each window `i` (line 78),
- `mkWindow` appending `activities.length` slots (line 133),
- `rmWindow` splicing `[A*target, A*target+A)` (163–165),
- `pubSlotUpdate` indexing `slots[slot.window * activities.length + slot.activity]` (2130),
- `renderEventTable`'s inner loop `s = w*sz + …` (275).

### 2.3 `renderEventTable(parent, step = 1)` (231–315)
```
eventTableData.step = step
sz   = activities.length
cols = sz >= maxTableCols ? maxTableCols : sz + 1
```
So: `sz=0→cols=1`, `1→2`, `2→3`, `3→4`, `4→5`, `5→5`, `6→5`, … The label column always consumes one, so **the number of activity columns rendered is always `cols - 1`** (i.e. `min(sz, 4)`).

**Empty state** (238–244): if `sz === 0 && windows.length === 0` → `cols = 1` and a single `is-warning` cell reading *"You haven't added any windows or activities to your event yet!"*.

**Populated path** (245–306):
1. `addCell(grid, '', '', '')` — the blank top-left corner cell. It gets **no** `tblIdx`, and `idx` starts at 0 with pre-increment, so the first *real* cell gets `tblIdx = 1`, which correctly matches its position in `$('.event-cell')` (index 0 being the corner).
2. Activity headers: `for(let a = step - 1; a < cols + step - 2; ++a)` → exactly `cols - 1` iterations starting at `step - 1`. Each is `addCell(grid, activities[a].label, activities[a].data.description /* tooltip */, 'is-primary', activities[a].fn, activities[a].data, ++idx)`.
3. Per window `w` (all windows, always — **there is no vertical windowing**):
   - `addCell(grid, windows[w].label, '', 'is-primary', windows[w].fn, windows[w].data, ++idx)`.
   - Slot cells: `for(let s = w*sz + (step-1); s < w*sz + (step-2+cols); ++s)` → again exactly `cols - 1` cells, the same activity window as the headers.
4. `parent.empty().append($('<div class="fixed-grid has-{cols}-cols">').append(grid))`.

**Cell content by mode** (281–304) — a single nested ternary for label and another for aesthetics:

| Condition (in order) | Label | Aesthetics |
|---|---|---|
| `!slot.data.slotEnabled` | `Unavailable` | `is-outlined is-light` |
| `eventTableData.editing` | `` `${rsvpCount} / ${slotVolunteerCap}` `` | `is-outlined is-primary` |
| `state.hasRSVP` | `Booked` | `is-outlined is-warning` |
| `state.atCapacity` | `At Capacity` | `is-outlined is-light` |
| else | `Available` | `is-outlined is-primary` |

Slot cells never get a tooltip (`hint` is `''`). Activity header cells get the long description as their tooltip. Window header cells get none. The `slot.label` property that `pubWindowCreation`/`pubSlotUpdate` maintain (`'Unavailable'`/`'Available'`) is **never read** by the renderer.

Note that in the creation wizard slots have no `rsvpCount`/`rsvps` at all, and `editing` is `false` there, so the wizard shows `Available`/`Unavailable` only.

### 2.4 `renderEventTableSlider(parent, step = 1, max = null)` (321–341)
- If `max == null`: `ln = activities.length` (**`ln` is an implicit global — missing `let`**, line 323); `max = ln > (maxTableCols - 2) ? ln - (maxTableCols - 2) : 1`, i.e. `max = sz > 3 ? sz - 3 : 1`.
- `parent.children('input.slider').remove()` — this deletes the static `#view-event-slider` from `index.html` on first render.
- Appends a fresh `<input class="slider is-fullwidth is-small is-primary is-light" id="view-event-slider" step=1 min=1 type=range max={max} value={step}>` followed by the module-level hidden `<output for="view-event-slider">`.
- `viewTableSliderOutput.text(step)` then `bulmaSlider.attach()`.

The math is self-consistent: with `sz >= 5`, `cols - 1 = 4` activities visible and `max = sz - 3`, so `step = sz - 3` shows activities `[sz-4 … sz-1]`. Exactly the last column. For `sz <= 4`, `max = 1`, `step` is pinned to 1, and `cols - 1 = sz` shows everything. **The windowing math is correct** — but see §6.4 for the *plumbing* bug that defeats it.

### 2.5 The slider → table wiring (2810–2822)
A `MutationObserver` is attached to `viewTableSliderOutput[0]` with `{childList: true, subtree: true, characterData: true}`. On any mutation it calls `renderEventTable($('#view-event-table'), Number(viewTableSliderOutput.text()))`. bulma-slider is what writes into the `<output>` when the user drags. This is the *only* path that renders the table at a step other than 1.

### 2.6 `refreshTable(step = 1)` (902–906)
```js
renderEventTable($('#view-event-table'));      // <-- step argument NOT forwarded
renderEventTableSlider($('#view-event-table').parent(), step);
renderFieldTable();
```
`$('#view-event-table').parent()` is the `.card-content` div, which is where the static slider lived.

### 2.7 `renderEventTableMeta(title, description, editable)` (211–229)
- `#view-event-short-descr`.text(title); `#view-event-long-descr`.text(description).
- `editable` → hide `#view-event-volunteer`, show `#view-event-details`, show `#view-event-edit-summary`.
- `!editable` → hide `#view-event-details`, show `#view-event-volunteer`, hide `#view-event-edit-summary`. (Consequence: **volunteers never see the custom-fields table**; admins in edit mode never see the volunteer picker.)
- `#view-event-view-report` shown iff `userData && userData.account && summary.admin && summary.admin == userData.account`.

### 2.8 `renderFieldTable()` (343–396)
- `$('#view-event-details tr').not('.is-primary').remove()` — the header row in the HTML is `<tr class="is-primary">`.
- Empty → append one `<tr><td class="is-light is-warning has-text-centered is-size-7" colspan=2>You haven't specified any custom fields yet! :)</td></tr>` and `removeClass('is-hoverable')` from the table; return.
- Non-empty → `addClass('is-hoverable')`; for each detail: set `detail.data.tblIdx = i`; map `data.type` through a switch — `STRING→'Text'`, `BOOLEAN→'True/False'`, `INTEGER→'Whole Number'`, `EMAIL→'Email Address'`, `PHONE→'Phone Number'`, default `'INVALID'` (note the `var type` re-declarations inside a `switch`, hoisted); build `<tr><td>{field}</td><td>{type}{required?' (required)':''}</td></tr>`; bind `click → detail.fn(detail.data)`.

### 2.9 `fmtDateRange(begin, end, oneLiner = false)` (908–922)
`toLocaleDateString('en-us', {day:'2-digit', year:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit', hour12:true})`. Returns `` `${b} - ${e}` `` if `oneLiner`, else `` `Begin: ${b}<br />End: ${e}` `` (HTML — hence `addCell` using `.html()`).

---

## 3. VALIDATION RULES (exact)

### 3.1 Regexes (924–926) — all **unanchored**
```js
emailRegex = /[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/
intRegex   = /\d+(\.\d{0,9})?/
phoneRegex = /(\+?( |-|\.)?\d{1,2}( |-|\.)?)?(\(?\d{3}\)?|\d{3})( |-|\.)?(\d{3}( |-|\.)?\d{4})/
```
No `^`/`$` and no `i` flag: `"BOB@EXAMPLE.COM"` **fails** the email test, while `"hello foo@bar.com world"` **passes**. `intRegex` accepts `"abc12"` and `"1.5"` despite the "integer" error message.

### 3.2 `validateSummaryModal()` (928–946)
Reads `#edit-event-short-descr` (trim), `#edit-event-long-descr` (trim), `#edit-event-notify-switch` (checked), `#edit-event-multiuser-switch` (checked) into `{title, description, notifyOnSignup, allowMultiuserSignups}`.
- Rule: `'' === title` → throw *"The title of your event cannot be blank."*
- On throw: `console.error` + `toast({message, type:'is-danger'})` + `return null`.
- **Takes no `newVals` parameter** (unlike its siblings), yet is called as `validateSummaryModal({id: summary.id})` at 2507.

### 3.3 `validateActivityModal(newVals = null)` (948–986)
Reads `#edit-activity-short-descr` (trim) → `label`; `#edit-activity-long-descr` (trim) → `description`; `activityVolunteerCap = avcChecked ? 0 : Number($('#edit-activity-vol-cap-field').val())`; `slotVolunteerCapDefault = svcdChecked ? 0 : Number($('#edit-activity-slot-vol-cap-def-field').val())`. The switches (`#edit-activity-vol-cap-switch`, `#edit-activity-slot-vol-cap-def-switch`) are inverted-sense: **checked = unlimited = 0**.
- `'' == label` → *"The label for your activity cannot be blank."*
- `!avcChecked && (!Number.isInteger(cap) || cap < 1 || cap > 255)` → *"The activity volunteer cap needs to be number between 1 and 255"* (note: no trailing period, and "be number").
- `!svcdChecked && (!Number.isInteger(def) || def < 1 || def > 255)` → *"The default slot volunteer cap needs to be a number between 1 and 255."*
- Returns `newVals ? Object.assign(data, newVals) : data`.

### 3.4 `validateWindowModal(newVals = null)` (988–1005)
Reads `$('#edit-window-range')[0].bulmaCalendar` → `{startDate: cal.startDate, endDate: cal.endDate}`.
- `!cal.startDate || !cal.endDate` → *"Please specify the entire window range."*
- No ordering check (end before start is accepted), no minimum-duration check, no overlap check against other windows.

### 3.5 `validateSlotModal(newVals = null)` (1007–1032)
`slotEnabled = $('#edit-slot-enable-switch').prop('checked')`; `slotVolunteerCap = esvcChecked ? 0 : Number($('#edit-slot-vol-cap-field').val())`.
- `eseChecked && !esvcChecked && (!Number.isInteger(cap) || cap < 1 || cap > 255)` → *"The volunteer cap needs to be a number between 1 and 255."* (cap is only validated when the slot is enabled).

### 3.6 `validateFieldModal(newVals = null)` (1034–1054)
`{type: $('#edit-detail-type-dropdown option:selected').val(), field: trim, description: trim, required: checked}`.
- `data.type.includes('?')` → *"Please make sure to select a detail type."* (the placeholder option has no `value`, so `.val()` yields its text *"What type of detail?"*).
- `'' === data.field` → *"The field label can't be empty."*
- Valid `type` values (from the `<select>`): `STRING`, `BOOLEAN`, `INTEGER`, `EMAIL`, `PHONE`.

### 3.7 `setErrorTag(input, hint)` (1056–1068)
- `hint === null` → `input.removeClass('is-danger')` and `input.siblings('label').find('.tag').remove()`.
- otherwise → `input.addClass('is-danger')` and append to `input.siblings('label')`:
  `<button class="tag is-danger has-tooltip-right" data-tooltip="{hint}">Error</button>`

**The clearing branch is dead** — `setErrorTag` is never called with `null` anywhere. Clearing is done in bulk at the top of `validateVolEditModal` (1073–1074: remove all `.tag`, strip all `.is-danger` inside `#edit-vol-modal`). So error tags appear on failed validation and disappear only on the *next* validation attempt — not on input.

The `siblings('label')` selector requires a real `<label>` element sibling. It works for `#vol-detail-name` (`<label class="label">Name&ensp;</label>` inside the same `.control`) and for every dynamically built detail field (`renderVolEditModal` puts the `<label class="label">` and the input in the same `.control` div).

### 3.8 `validateVolEditModal(newVals = null)` (1070–1155)
1. `deetVals = new Array(details.length).fill(undefined)`.
2. Clear all tags / `is-danger` in `#edit-vol-modal`. `invalid = 0`.
3. `name = $('#vol-detail-name').val().trim()`; if `''` → `setErrorTag(nameInput, 'Please provide a name.')`, `invalid++`.
4. For every `input` in the modal except `#vol-detail-name`: `idx = Number(id.substr(11))` (strips `vol-detail-`); `deetVal = (type === 'BOOLEAN') ? $(this).is(':checked') : $(this).val().trim()`; then:
   - `INTEGER`: `'' !== deetVal && !intRegex.test(deetVal)` → *"This needs to be an integer."*
   - `EMAIL`: `'' !== deetVal && !emailRegex.test(deetVal)` → *"This needs to be an email address."*
   - `PHONE`: `'' !== deetVal && !phoneRegex.test(deetVal)` → *"This needs to be a phone number."*
   - `STRING`/`BOOLEAN`: no check.
   Then `deetVals[idx] = {detail: detail.data.id, value: deetVal}`.
5. Required sweep (1124–1129): `if('' === deetVals[i].value && details[i].data.required)` → `setErrorTag($('#vol-detail-'+i), 'This field is required.')`, `invalid++`.
6. `catch(e) { console.error(e); return null; }` — **silently**, with no toast.
7. If `invalid` → toast `` `${invalid} field${s} must be updated to meet requirements.` `` (`s = invalid === 1 ? '' : 's'`), return `null`.
8. Return `{name, remindersEnabled: false, details: deetVals}` plus `user: userData.account` when logged in. (`remindersEnabled` is hard-coded `false`, with no UI.) The `newVals` parameter is **declared but never used**.

### 3.9 Live numeric clamping (3076–3088)
`.integer-validation` on `keyup focusout`. Static fields carrying it: `#edit-activity-vol-cap-field`, `#edit-activity-slot-vol-cap-def-field`, `#edit-slot-vol-cap-field` — all `type=number min=1 max=255`. Dynamically-built `INTEGER` volunteer-detail inputs also carry the class with `min="0"` and no `max`, but they are created after `loadSite` ran and the handler is a **direct** (non-delegated) binding, so they get no clamping.

---

## 4. AUTH MECHANICS

### 4.1 Credential derivation — `genCreds(email, password, mfa, salt)` (in `axb-sig-req.min.js`)
```
privkey = scrypt(NFKC(password), NFKC(salt), N=16384, r=8, p=1, dkLen=32)
pubkey  = base64(ed25519.getPublicKey(privkey))
creds   = NFKC(JSON.stringify({email, mfa}))
sig     = ed25519.sign(creds, privkey)
payload = base64(NFKC(JSON.stringify({creds, sig: base64(sig)})))
return { payload, pubkey }
```
Every call site in `app.js` passes `mfa = ''` and `salt = ''` — so the KDF salt is empty and the derived key depends only on the password. MFA is never used. `accountReset` passes `email = ''` too (1571), which is fine because the pubkey doesn't depend on the email.

### 4.2 `injectAuth(options, session = null, captcha = null)` (1266–1284)
```js
if(null == session && userData && userData.session) session = userData.session;
let headers = {};
if(null != session) headers['Authorization'] = `AXB-SIG-REQ ${session}`;
if(null != captcha) headers['X-CAPTCHA-TOKEN'] = captcha;
options.headers ? Object.assign(options.headers, headers) : (options.headers = headers);
logDebug(...); return options;
```
Note: the header value for authenticated calls is the **session token**, whereas for the initial login it is the freshly signed `sigReq.payload` (1412) — same header scheme, two different payload kinds. When anonymous, no `Authorization` header is sent at all and the request proceeds unauthenticated.

### 4.3 Cookie storage
`Cookies.set('user', JSON.stringify(userData))` — written at login (1423) and in `refreshUserSession`'s `.done` (1484). No `expires`, `secure`, `sameSite`, `path`, or `domain` options → a JS-readable, host-only **session cookie**. Removed by `saveSession` on session loss (1376), by `userLogout` (1468), and by `refreshUserSession`'s `.fail` (1489). Read once at boot (3209) inside a `try/catch` (`Cookies.get` returns `undefined` when absent → `JSON.parse(undefined)` throws → the catch is the normal anonymous path).

### 4.4 Rotating token capture — `saveSession(res, onSuccess = null, onFailure = null)` (1363–1393)
```js
let userSession = res.getResponseHeader('axb-session');
if(userData) {
  if(userSession) { userData.session = userSession; toggleAuthUI(true); }
  else {
    toast('Your user session was lost! Please log in again.', is-danger);
    userData = null; Cookies.remove('user'); toggleAuthUI(false);
  }
}
if('function' === typeof onSuccess) {
  if('ok' == res.responseJSON.status) onSuccess(res);
  else if('function' !== typeof onFailure)
    toast(`Couldn't do what you asked, sorry. Error: ${res.responseJSON.info}`, is-danger);
}
if('ok' != res.responseJSON.status && 'function' === typeof onFailure) onFailure(res);
```
- `saveSession` is wired as the jQuery `complete` handler of nearly every authenticated call, so **every** response rotates the in-memory session.
- The rotated token is only written back to the cookie by `refreshUserSession`'s `.done` — so ordinary API traffic advances `userData.session` in memory while the cookie keeps the older value.
- **What happens on 401 / any non-`ok` response**: if the server omitted `axb-session`, the user is logged out client-side with the "session was lost" toast. Independently, a non-`ok` `status` in the JSON body routes to `onFailure` if supplied, or produces a generic "Couldn't do what you asked, sorry. Error: …" toast if `onSuccess` was supplied without `onFailure`. Note the app trusts the JSON `status` field, not the HTTP status code, and `res.responseJSON` is dereferenced unconditionally (see §6.9).

### 4.5 `toggleAuthUI(loggedIn)` (1308–1361)
- **true**: hide `#login-nav`; show `#logout-nav`, `#account-nav`. If `!eventTableData.summary.id` (i.e. no event on screen): fire two parallel `GET /v1/events` calls — `{admin: userData.account, earliest: Date.now()}` → `setUpcomingEvents('#list-event-admin-box', res.responseJSON.events)`, and `{volunteer: userData.account, earliest: now}` → `setUpcomingEvents('#list-event-rsvp-box', …)`; then hide `#coa-section`, show `#list-event-section`.
- **false**: hide `#account-nav`, `#logout-nav`; show `#login-nav`. If no event on screen: hide `#list-event-section`, show `#coa-section`.

`setUpcomingEvents(container, events)` (1286–1306): empties `<ul>`; empty list → remove `is-primary`, add `is-centered`, one `<li>No events.</li>`; else add `is-primary`, remove `is-centered`, one clickable `<li>{event.shortDescription}</li>` per event calling `retrieveEvent(event.id)`.

`retrieveUserOwnedEvents(uId, andThen)` (1184–1205): `GET /v1/events?admin={userData.account}` → `userData.ownedEvents = res.events.map(e => e.id)`; `complete → andThen()`. **The `uId` parameter is ignored** — the function uses `userData.account`.

`setLoaderBtn(parent, loading)` (1157–1176): scans the element's classes for `is-*` modifiers ending in one of primary/link/info/success/warning/danger, then adds/removes the matching `has-text-*` class (to hide the label) and toggles `is-loading`. The membership test `['primary link info success warning danger'].some(e => elem.endsWith(e))` uses a **single-element array of a space-joined string**, so it effectively only ever matches `is-danger` — see §6.

---

## 5. EVERY API CALL

Base: same-origin, relative paths. **No `contentType` is ever set**, so jQuery sends `Content-Type: application/x-www-form-urlencoded; charset=UTF-8` even though the body is always a JSON string. `dataType:'json'` (where present) only declares the *expected response* type.

| # | Method | Path | Line | Body / Query | Headers | Response handling |
|---|---|---|---|---|---|---|
| 1 | GET | `/v1` | 2725 | — | none | `debug = res.responseJSON.debug`; `res.responseJSON.captcha` → sitekey or disable CAPTCHA |
| 2 | GET | `/v1` | 1409 | — | `Authorization: AXB-SIG-REQ {sigReq.payload}` | reads `axb-account`, `axb-session`, `axb-access-level` headers → `userData` |
| 3 | GET | `/v1` | 1478 | — | `injectAuth(…, session)` | `saveSession(res, fn, fn)`; `.done` re-writes cookie |
| 4 | GET | `/v1` | 2348 | — | `injectAuth(…, null, captchaRes)` | on ok → toast + `pubVolCreation` for every id-less volunteer |
| 5 | POST | `/v1/users` | 1226 | `{email, pubkey, generateMFA:false}` | `X-CAPTCHA-TOKEN` only | toast success/failure (`data.responseJSON.info`) |
| 6 | GET | `/v1/users/{account}` | 856 | — | `injectAuth` | `res.user.email` → email placeholder |
| 7 | PATCH | `/v1/users/{account}` | 1521 | `{email?, pubkey?}` | `injectAuth` | `saveSession`; toast |
| 8 | POST | `/v1/users/{email}` | 1613 | *(none)* | `injectAuth(…, null, captcha)` | `.always` → generic "reset email will be sent" toast |
| 9 | POST | `/v1/users/{user}` | 1574 | `{token, pubkey}` | `injectAuth(…, null, captcha)` | `saveSession`; toast; close profile modal |
| 10 | PUT | `/v1/users/{user}` | 1636 | `{token}` | `injectAuth(…, null, captcha)` | `saveSession`; toast |
| 11 | GET | `/v1/events` | 1317 | `?admin={acct}&earliest={ms}` | `injectAuth` | `res.responseJSON.events` → `#list-event-admin-box` |
| 12 | GET | `/v1/events` | 1333 | `?volunteer={acct}&earliest={ms}` | `injectAuth` | `res.responseJSON.events` → `#list-event-rsvp-box` |
| 13 | GET | `/v1/events` | 1187 | `?admin={acct}` | `injectAuth` | `userData.ownedEvents = ids` |
| 14 | POST | `/v1/events` | 1900 | full event graph (see below) | `injectAuth(…, null, captcha)` | `data.paymentRedirect` → redirect; else redirect to `?event={id}&share` |
| 15 | GET | `/v1/events/{id}` | 2382 | — | `injectAuth` | rebuilds the entire `eventTableData` |
| 16 | PATCH | `/v1/events/{id}` | 1947 | diff of `{admin, shortDescription, emailOnSubmission, allowMultiUserSignups}` | `injectAuth` | merge into summary, re-render |
| 17 | POST | `/v1/events/{id}/activities` | 1968 | `{shortDescription, longDescription, maxActivityVolunteers, maxSlotVolunteersDefault, priority: activities.length}` | `injectAuth` | `res.responseJSON.activity.id`; `mkActivity` with all-disabled slots |
| 18 | PATCH | `/v1/events/{id}/activities/{aid}` | 2019 | diff of `{shortDescription, longDescription, maxActivityVolunteers, slotVolunteerCapDefault}` | `injectAuth` | merge + relabel |
| 19 | DELETE | `/v1/events/{id}/activities/{aid}` | 2038 | — | `injectAuth` | `rmActivity` |
| 20 | POST | `/v1/events/{id}/windows` | 2052 | `{beginTime: "<epoch ms>", endTime: "<epoch ms>"}` (strings) | `injectAuth` | `res.responseJSON.window.id`; `mkWindow` with all-disabled slots |
| 21 | PATCH | `/v1/events/{id}/windows/{wid}` | 2095 | diff of `{beginTime, endTime}` | `injectAuth` | merge + relabel |
| 22 | DELETE | `/v1/events/{id}/windows/{wid}` | 2114 | — | `injectAuth` | `rmWindow` |
| 23 | PUT | `/v1/events/{id}/activities/{aid}/windows/{wid}` | 2148 | `{maxSlotVolunteers}` | `injectAuth` | enable/update slot |
| 24 | DELETE | `/v1/events/{id}/activities/{aid}/windows/{wid}` | 2133 | — | `injectAuth` | disable slot |
| 25 | POST | `/v1/events/{id}/details` | 2169 | `{type, label, hint, required}` | `injectAuth` | `res.responseJSON.detail.id`; `mkDetail` |
| 26 | PATCH | `/v1/events/{id}/details/{did}` | 2207 | diff of `{type, label, hint, required}` | `injectAuth` | merge |
| 27 | DELETE | `/v1/events/{id}/details/{did}` | 2225 | — | `injectAuth` | `rmDetail` |
| 28 | POST | `/v1/events/{id}/volunteers` | 2262 | `{name, remindersEnabled, user?, details:[{detail,value:string}], rsvps:[{activity:<id>,window:<id>}]}` | `injectAuth` | `res.responseJSON.volunteer.id` → `vol.id` |
| 29 | PATCH | `/v1/events/{id}/volunteers/{vid}` | 2295 | same minus `id`/`user`/`rsvps` | `injectAuth` | `saveSession` only |
| 30 | DELETE | `/v1/events/{id}/volunteers/{vid}` | 2307 | — | `injectAuth` | log only |
| 31 | PUT | `/v1/events/{id}/activities/{a}/windows/{w}/volunteers/{v}` | 2321 | *(none)* | `injectAuth` | on ok → local RSVP add |
| 32 | DELETE | same path | 2335 | — | `injectAuth` | on ok → local RSVP remove |
| 33 | GET | `/v1/events/{id}/report` | 3099 | — | raw `fetch`, `Authorization: AXB-SIG-REQ {session}` | `blob()` → object URL → `window.open(_, '_blank')` |
| 34 | GET | `/v1/texts/coa` \| `/terms` \| `/privacy` | 2365 | — | none | showdown → HTML |

### 5.1 `POST /v1/events` body shape (`pubEventCreation`, 1838–1898)
```js
{
  admin?: <account uuid>,             // only when logged in
  shortDescription, longDescription,
  allowMultiUserSignups, emailOnSubmission,
  activities: [{
    shortDescription, priority: i,
    longDescription?,                 // omitted when falsy
    maxActivityVolunteers?,           // omitted when 0
    maxSlotVolunteersDefault?,        // omitted when 0
    slots?: [{ enabled, window: <window index>, maxSlotVolunteers? }]   // key only present if slots.length
  }],
  windows: [{ beginTime: "<epoch ms>", endTime: "<epoch ms>" }],
  details: [{ type, label, hint?, required? }]
}
```
Windows are referenced by **array index**, not id, since nothing has an id yet.

### 5.2 Volunteer serialization (`pubVolCreation`, 2238–2275)
`structuredClone(vol)`, then reverse-iterate `details`: non-string values are stringified (`false → "false"`); empty strings are spliced out entirely. Then `rsvps[].activity` / `.window` numeric **indices** are translated to activity/window **ids** via `eventTableData.activities[i].data.id`.

---

## 6. KNOWN BUGS / DEAD CODE

### 6.1 Confirmed dead code
| Item | Line | Note |
|---|---|---|
| `eventChanges` | 11 | declared, never referenced |
| `captchaRequired` | 2 / 2734 | assigned in `loadCAPTCHA`, never read |
| `mvActivity` | 85 | never called |
| `mvWindow` | 140 | never called |
| `mvDetail` | 177 | never called |
| `mvVolunteer` | 197 | never called |
| `setErrorTag(input, null)` clearing branch | 1057–1059 | never invoked with `null` |
| `let act = activities[slot.data.activity].data` | 277 | computed, never used |
| `slot.label` (`'Unavailable'`/`'Available'`/`'Slot'`) | 1138, 2065, 2157, 2912, 2969 | never read by `renderEventTable` |
| `newVals` param of `validateVolEditModal` | 1070 | declared, never used |
| `uId` param of `retrieveUserOwnedEvents` | 1184 | shadowed by `userData.account` |
| `getCurrentRSVPState().count` | 1712 | never consumed |
| `rmActivity` alternate loop | 111 | commented-out |
| `renderVolDropdown` legacy lines | 417, 426–427 | commented-out |
| `#view-event-details` in view mode | 216/219 | `renderFieldTable` populates a table that is hidden for non-editors |
| commented-out `pubVolCreation(data)` | 2537, 2548 | see §6.10 |

### 6.2 `throw new '<string>'` — four occurrences
Lines **87, 142, 179, 199**: `throw new 'activity idx out of bounds'` etc. `new` on a string literal raises `TypeError: "..." is not a constructor`, so the intended message is lost. (`mkActivity`/`mkWindow` at 70/125 correctly use bare `throw`.) All four are inside the dead `mv*` functions.

### 6.3 Wrong bounds checks in `mv*`
- `mvWindow` (141): `windows.length <= from || **activities**.length <= to` — should check `windows.length` for `to`.
- `mvVolunteer` (198): `volunteers.length <= from || **details**.length <= to` — should check `volunteers.length`.

### 6.4 `refreshTable` drops the step (902–904) — the table-windowing plumbing bug
```js
function refreshTable(step = 1) {
  renderEventTable($('#view-event-table'));          // always renders at step 1
  renderEventTableSlider($('#view-event-table').parent(), step);
  ...
}
```
The table is always rendered at step 1; the correct step only reappears if `renderEventTableSlider` changes the `<output>` text and thereby trips the MutationObserver. When the step is *already* equal to the output's text (the common case for any refresh at the current step), no mutation fires and the table silently snaps back to columns 0–3 while the slider thumb still shows the old position. Every `refreshTable(eventTableData.step)` call at 2630 and 2678 is affected, as is every `updateSelectedVol()` → `refreshTable(step)` (408) after an RSVP toggle.

### 6.5 Wrong stride in `pubEventCreation`'s slot loop (1866)
```js
for(let j = i, slot; slot = eventTableData.slots[j]; j += eventTableData.windows.length)
```
Slots are stored window-major with stride `activities.length`, so this should be `j += eventTableData.activities.length`. It is only correct when `#windows === #activities`. Otherwise the published event gets the wrong slots per activity (with duplicate/missing `window` indices), or the loop terminates early. This corrupts every multi-activity/multi-window event created through the wizard.

### 6.6 `pubEventSummaryUpdate` writes `shortDescription` twice (1933–1936)
```js
if(summary.title       !== …) changes.shortDescription = summary.title;
if(summary.description !== …) changes.shortDescription = summary.description;   // BUG
```
Should be `longDescription`. Consequence: editing only the long description sends it as the *short* description (clobbering the title server-side), and the long description can never be updated. Note the local model is still `Object.assign`ed with the correct values (1953), so the UI and server diverge until the next reload.

### 6.7 `pubActivityUpdate` uses the wrong API key (2015)
`changes.slotVolunteerCapDefault = …` while creation and the read path use `maxSlotVolunteersDefault` (1975, 2462). The slot-volunteer default almost certainly cannot be updated.

### 6.8 `renderEventActivityModal` re-enables non-existent elements (546–547)
```js
$('#edit-activity-vol-cap-def-switch').prop('disabled', false);
$('#edit-activity-vol-cap-def-field').prop('readonly', false);
```
The real ids are `#edit-activity-slot-vol-cap-def-switch` / `#edit-activity-slot-vol-cap-def-field` (used correctly in the read-only branch at 557–558). So once the modal has been opened read-only, the slot-default switch/field stay disabled forever.

### 6.9 `res.responseJSON` dereferenced without guards
`saveSession` (1383, 1391), `toggleAuthUI` (1327, 1343), `loadCAPTCHA` (2730, 2732, 2736), `pubActivityCreation` (1980), `pubWindowCreation` (2061), `pubDetailCreation` (2180), `pubVolCreation` (2268). Any non-JSON response (502 HTML, gateway error, CORS failure, 204 No Content) throws a `TypeError` inside the jQuery `complete` handler. Similarly `data.responseJSON.info` in `registerUser` (1248) and `userLogin` (1447).

### 6.10 Volunteers are never created at add time
`pubVolCreation(data)` is commented out at **2537** and **2548**. A volunteer added via `#view-event-add-vol` exists only in local memory until the user presses "Submit RSVPs" (`pubRSVPS` → 2355–2357). If the user adds a volunteer, RSVPs, and never presses Submit, everything is lost. Also, `pubRSVPS` toasts "RSVP successfully submitted!" *before* any `pubVolCreation` request completes, and none of those requests have failure handling that would retract the toast.

### 6.11 `splice(-1, 1)` corruption for anonymous volunteers (1761–1764)
```js
s.data.rsvps.splice(s.data.rsvps.indexOf(vol.id), 1);
```
For a volunteer with no `id`, `indexOf(undefined)` returns `-1`, and `splice(-1, 1)` removes the **last** element — someone else's volunteer id. (The paired `mkFn` at 1792 correctly guards with `if(vol.id)`; `delFn` does not.)

### 6.12 Unreachable branch in `updateSelectedVol` (400–405)
```js
let idx = Number($('#view-event-volunteer option:selected').val());
if(undefined === idx) { idx = -1; }
```
`Number()` never returns `undefined`; when no option is selected it returns `NaN`. So `currentVol` becomes `NaN` instead of `-1`. `-1 < NaN` is `false`, so `hasRSVP` degrades safely, but `currentVol` is now a non-sentinel and `volunteers[NaN]` is `undefined` — any subsequent `onPubdSlotClick` in the RSVP branch throws `Cannot read properties of undefined (reading 'rsvps')`.

### 6.13 `rmVolunteer` leaves stale RSVP counts (207–209, called at 2585)
Deleting a volunteer removes them from `eventTableData.volunteers` but never strips their id from `slot.data.rsvps` nor decrements `slot.data.rsvpCount`. The table keeps showing them as booked/at-capacity until a reload.

### 6.14 Stale `tblIdx` when the table is scrolled (693–704)
`renderEventSlotModal`'s "Edit activity/window" buttons do `$('.event-cell')[activities[slot.activity].data.tblIdx].click()`. `tblIdx` is only assigned by `addCell` for cells rendered in the *current* column window (`renderEventTable`, 261/273/304). For an activity outside the visible window, `data.tblIdx` is either stale from a prior render or `undefined` → clicks the wrong cell or throws `Cannot read properties of undefined (reading 'click')`.

### 6.15 `setLoaderBtn` modifier detection is broken (1157–1163)
```js
['primary link info success warning danger'].some(e => elem.endsWith(e))
```
This is a **one-element array containing one space-joined string**. `elem.endsWith('primary link info success warning danger')` is only ever true for… nothing. So `modifiers` is always empty and no `has-text-*` class is ever applied — only `is-loading` toggles. (It probably intended `'primary link info success warning danger'.split(' ')`.)

### 6.16 `loadCAPTCHA` / `urlParams` race (2751)
`urlParams` is assigned in `loadSite` (2791), which runs only after `refreshUserSession`'s `GET /v1` completes. `loadCAPTCHA` is invoked by the reCAPTCHA script's `onload`, which is independent. If reCAPTCHA loads first, `urlParams.has(...)` throws on `null`, is swallowed by the `try/catch` at 2750–2774, and **inbound `verify-user` / `reset-user` email links silently do nothing**.

### 6.17 `renderCAPTCHA` ignores `captchaRequired` (2779–2787)
If the server reports CAPTCHA disabled (`captchaRequired = false`, 2734), `renderCAPTCHA` still calls `grecaptcha.enterprise.reset()` for anonymous users and shows a modal with an empty `#captcha` div. Since no widget was rendered, `reset()` throws and the callback never fires — anonymous publish/RSVP/register/reset are dead in a CAPTCHA-disabled deployment.

### 6.18 `pubVolUpdate`: `delete` statements trapped inside the loop (2282–2291)
```js
for(let i = Object.keys(volObj.details).length - 1; i >= 0; i--) {
  ... 
  delete volObj.id;               // inside the loop
  if(volObj.user) delete volObj.user;
}
```
If the event has **no details**, the loop body never executes and `id` + `user` are sent in the PATCH body. Also `Object.keys(arr).length` instead of `arr.length`.

### 6.19 Required-BOOLEAN details can never fail validation (1124–1125)
The required check compares `'' === deetVals[i].value`, but BOOLEAN details store `true`/`false`. An unchecked required checkbox passes. (Worse: if a detail's `type` is unrecognized, `renderVolEditModal` `continue`s at 815 and never creates an input, so `deetVals[i]` stays `undefined` and line 1125 throws → `validateVolEditModal` returns `null` with **no toast at all** — a silently unsubmittable form.)

### 6.20 `renderEventWindowModal` typo and aliasing (599–605)
- `'' == win.startTime` (599) — `startTime` is never a property of a window object (it's `startDate`/`endDate`). Harmless but wrong; it was presumably meant to be `win.endDate`.
- `calOpts.startTime = calOpts.startDate; calOpts.startTime.setHours(8,0,0,0)` — same object reference, so `startDate` is mutated too (same for end/17:00).
- `minDate: tomorrow` (596) is applied even when *editing* an existing window whose start is in the past.
- There is no "View Window" read-only title branch (contrast `renderEventSummaryModal` 486 and `renderEventActivityModal` 551).

### 6.21 Implicit globals (non-strict mode)
- `ln` (323) in `renderEventTableSlider`
- `eventData` (1838) in `pubEventCreation`
- `volObj` (2242, 2281) in `pubVolCreation` / `pubVolUpdate`
- The pervasive named-argument-emulation idiom `renderEventActivityModal(newActivity = false, savFn = function(){...}, delFn = ..., d)` (1661, 1680, 2830, 2860, 2878, 2895, 2914, 2935, 2952, 2971, 2992, 3000) creates globals `newActivity`, `savFn`, `delFn`, `newWindow`, `newEvent`, `newDetail`, `saveFn` on every call. Note the inconsistent spelling `saveFn` vs `savFn` (2914, 2952, 2971, 3000) — harmless only because the arguments are positional.

### 6.22 `toggleAuthUI(true)` is called on every successful response
`saveSession` calls it at 1369, and `saveSession` is the `complete` handler of almost every request. When no event is on screen, this re-fires two `GET /v1/events` requests each time — an amplification loop (each of which in turn calls `saveSession`? no, they use `complete: res => …` directly, so it terminates, but it's still 2 extra requests per API call).

### 6.23 Boot-time request with a possibly-stale session
At 3212 `toggleAuthUI(true)` runs from the cookie *before* `refreshUserSession` validates it, so the two dashboard `GET /v1/events` calls go out with a session that may already be rotated/expired.

### 6.24 `#view-event-add-window` builds slots with an undefined cap (2946)
```js
for(let i = 0, activity; activity = eventTableData.activities[i]; ++i)
  slots.push({..., slotVolunteerCap: activity.slotVolunteerCapDefault});
```
`activity` here is the wrapper `{label, fn, data}`; the default lives at `activity.data.slotVolunteerCapDefault`. So every slot created by adding a window in the wizard gets `slotVolunteerCap: undefined` (the sibling handler at 2889 gets it right via `data.slotVolunteerCapDefault`). Downstream, `maxSlotVolunteers: undefined` is dropped from the JSON by `JSON.stringify`.

### 6.25 `validateSummaryModal` silently discards its argument
Called as `validateSummaryModal({id: summary.id})` at 2507, but the function takes no parameters and has no `newVals` merge (contrast 985, 1004, 1031, 1053). The returned object has no `id`. It happens to work because `pubEventSummaryUpdate` reads `eventTableData.summary.id` for the URL and `Object.assign` preserves `id` (1953) — but in the wizard path the summary object is *replaced* wholesale (`eventTableData.summary = s`, 2843/2868).

### 6.26 Misc
- `profileUpdate` returns `true` synchronously (1552) → the modal closes before the PATCH resolves; a failure only surfaces as a toast behind a closed modal.
- `accountReset` returns `undefined` → `renderProfileResetModal`'s `if(savFn())` never closes the modal; only the `.always` handler at 1590 does.
- `retrieveEvent` is called with the *string* event id from the URL and compares `userData.ownedEvents.includes(summary.id)` (2692) — fine, but `retrieveUserOwnedEvents` may not have resolved yet on a cold load with `?event=`, so the "Modify Event" button relies on the 2619–2625 admin check instead.
- No `.fail()` on `pubRSVPS` (2346) or `loadMarkdown` (2365).
- `URL.createObjectURL` in the report handler is never `revokeObjectURL`'d (3106).
- `#md-view-modal p.modal-card-title` is never populated, so both the ToS and Privacy modals render with an empty title.
- `addCell` uses `.html(label)` — any user-supplied activity or volunteer text reaching a cell label is injected as HTML (currently only activity `label` and window `fmtDateRange` output flow there, but it is an XSS vector for activity short descriptions).
- `intRegex`'s error message says "integer" but the pattern accepts up to 9 decimal places.

---

## 7. QUICK REFERENCE — DOM contract (for the Svelte port)

Sections: `#introduction-section`, `#coa-section` (`#coa-content`, `#create-event-cta`), `#list-event-section` (`#list-event-admin-box ul`, `#list-event-rsvp-box ul`), `#view-event-section`.

Nav: `#create-event-nav`, `#login-nav`, `#account-nav`, `#logout-nav`.

Event view: `#view-event-short-descr`, `#view-event-long-descr`, `#view-event-edit-summary`, `#view-event-view-report`, `#view-event-share`, `#view-event-volunteer` (+ `select`), `#view-event-add-vol`, `#view-event-chg-vol`, `#view-event-details` (+ `table`/`tbody`, header `tr.is-primary`), `#view-event-table`, `#view-event-slider`, `#view-event-buttons`, `#view-event-add-activity`, `#view-event-add-window`, `#view-event-add-field`, `#view-event-publish-event`, `#view-event-modify-event`, `#view-event-save-rsvps`, `#view-event-close-editor`, `#view-event-expired`.

Modals: `#share-event-modal` (`#share-event-url`, `#share-event-copy`), `#md-view-modal`, `#edit-event-modal` (`#edit-event-short-descr`, `-long-descr`, `#edit-event-notify-switch`, `#edit-event-multiuser-switch`, `#edit-event-submit`), `#edit-activity-modal` (`#edit-activity-short-descr`, `-long-descr`, `#edit-activity-vol-cap-switch`/`-field`, `#edit-activity-slot-vol-cap-def-switch`/`-field`, `#edit-activity-sav`/`-del`), `#edit-window-modal` (`#edit-window-control`, `#edit-window-range`, `#edit-window-sav`/`-del`), `#edit-detail-modal` (`#edit-detail-type-dropdown`, `#edit-detail-field`, `#edit-detail-descr`, `#edit-detail-required-switch`, `#edit-detail-sav`/`-del`), `#edit-slot-modal` (`#edit-slot-activity-field`/`-btn`, `#edit-slot-window-field`/`-btn`, `#edit-slot-enable-switch`, `#edit-slot-cap-fields`, `#edit-slot-vol-cap-switch`/`-field`, `#edit-slot-sav`), `#edit-vol-modal` (`#vol-detail-name`, dynamic `#vol-detail-{tblIdx}`, `#edit-vol-sav`/`-del`), `#authentication-modal` (`#auth-modal-email`, `-password`, `-confirm-pass`, `#auth-modal-new-account-switch`, `#auth-modal-login-btn`, `-reset-btn`, `-register-btn`), `#profile-modal` (`#profile-modal-email`, `-password`, `-confirm-pass`, `-update-btn`), `#guest-auth-prompt-modal` (`.guest-on-publish`, `.guest-on-voladd`, `#guest-auth-prompt-open-auth`, `#guest-auth-prompt-proceed-nologin`), `#captcha-modal` (`#captcha`).

Footer: `#terms-link-footer`, `#privacy-link-footer`. Loader: `.pageloader`.

Class conventions to reproduce: `.event-cell`, `.block-list is-small is-centered`, `.fixed-grid.has-N-cols > .grid > .cell`, `.toggle` + `.toggle-*` pairs, `.integer-validation`, `.tag.is-danger.has-tooltip-right` error badges, `is-outlined is-primary` / `is-outlined is-warning` / `is-outlined is-light` cell states.