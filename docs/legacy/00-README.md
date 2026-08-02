# Legacy specification

These documents describe the **jQuery frontend that shipped on `main`**, captured before it is
deleted. They are the specification for the Svelte 5 rewrite on `release/framework-upgrade`.

| File | What it is |
|---|---|
| `01-behavior.md` | Exhaustive behavioral inventory of `app.js` — every flow, the event-grid rendering model, every validation rule, auth mechanics, all 34 API calls, and a catalogue of ~26 bugs and dead-code sites |
| `02-aesthetics.md` | Markup and visual inventory — page sections, all twelve modals, Bulma plugin usage, the two custom CSS rules, theme and color semantics, responsive behavior |
| `03-api-contract.md` | Backend contract the frontend codes against — endpoints, request/response shapes, server-side validation, the `AXB-SIG-REQ` auth scheme, the signing algorithm, static-file serving, and the DB schema |
| `creds-golden-vectors.json` | Credential-derivation test vectors, produced by the legacy signing bundle and independently confirmed against `node:crypto` |

## How to use these

**Requirement (c) of the rewrite is "perfectly duplicates the *intended* functionality."**
That word does the work: where legacy behavior and legacy intent diverge, these documents record
both and the rewrite follows intent. `01-behavior.md` §6 catalogues the divergences; the plan at
`~/.claude/plans/snappy-beaming-quail.md` carries the disposition for each.

Line references point at `frontend/public/assets/js/app.js` (still on disk during the port) and
`git show main:src/main/resources/public/index.html` (deleted on this branch). Both go away at
the end of Phase 6 — these documents are what survives.

## Reference sources

```sh
# the legacy markup, deleted by the Svelte migration commit
git show main:src/main/resources/public/index.html

# a full working tree of the old app, for side-by-side comparison
git worktree add ../yasss-baseline main
```

## Things that are easy to get wrong

A short list of the traps that cost the most if missed. Each is detailed in the documents.

1. **Omitting a slot from `POST /v1/events` enables it.** Only an explicit `enabled:false`
   suppresses a slot. The wizard must emit one entry per (activity, window) pair.
2. **`GET /events/:id` returns windows as `begin`/`end`; every write takes `beginTime`/`endTime`.**
3. **Slots have no `id` and no `enabled` flag** — a slot row exists iff it is enabled.
4. **The session token rotates on every response.** Read `axb-session` from each response and
   replace the stored token, or the user silently falls out of session in ~15 minutes.
5. **`AddVolunteer` NPEs into a 500 if `rsvps` is omitted.** Always send `"rsvps": []`.
6. **Server detail regexes are fully anchored and case-sensitive.** `Foo@Bar.com` is a real 400.
7. **The scrypt salt is empty and the credential JSON key order is `{"email":…,"mfa":…}`.**
   Changing either invalidates every existing account.
8. **There is no SPA fallback route** — query params only, and email templates hardcode them.
9. **`<html class="theme-light">` is pinned.** Drop it and dark-OS users get an unintended
   dark render.
