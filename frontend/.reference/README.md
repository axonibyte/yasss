# Reference material

## `axb-sig-req.min.js`

The legacy credential-signing bundle, kept deliberately.

It is an executable oracle: `npm run vectors` runs it in a `node:vm` sandbox and
cross-checks it against `node:crypto` to regenerate
`docs/legacy/creds-golden-vectors.json`. Those vectors are what stop the
npm-based replacement in `src/lib/crypto/creds.js` from drifting, and drift here
does not fail loudly — it silently locks every existing account out, because
each account's public key in `yasss_user.pubkey` was derived by this file.

The committed vectors are sufficient for the test suite on their own; this is
here so they can be independently re-derived rather than taken on trust.

## What was removed

The legacy `app.js` (3,223 lines) and `index.html` (834 lines) were deleted once
the rewrite reached parity. They are fully described by `docs/legacy/`, which is
the specification that outlives them, and both remain recoverable from git:

```sh
git show main:src/main/resources/public/index.html
git show 5693a25:frontend/public/assets/js/app.js
```
