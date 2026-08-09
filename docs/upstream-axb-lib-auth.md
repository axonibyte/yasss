# `axb-lib-auth-java` — what changed, and what it means here

**This project moved from `0.0.2` straight to `0.2.0`**, skipping `0.1.0` deliberately.
Written in the style of `upstream-axb-lib-db.md`: a record of upstream behavior that
shapes decisions in this repository, kept so the reasoning is not rediscovered.

Verified against the library at tag `0.2.0`.

---

## 1. What `0.0.2` was doing, which is what production ran

The library encrypts two things for this application: `ticket_signer.privkey` and
`yasss_user.mfakey`. Under `0.0.2` it did so like this:

```java
if(null == globalSecret)
  return datum;
...
idBuf.putLong(id.getMostSignificantBits());
idBuf.putLong(id.getLeastSignificantBits());
var iv = new IvParameterSpec(idBuf.array());
```

Three problems, all live in this deployment until the upgrade.

**The GCM nonce was the account UUID.** Fixed, public, and — the part that matters —
*identical for both values stored against one account*. A user's private key and their
TOTP secret were encrypted under the same key and the same nonce, which leaks the XOR of
the two plaintexts outright and permits recovery of the GHASH authentication subkey.
Nonce reuse is the one thing GCM does not tolerate.

**No secret meant no encryption, silently.** `cryptop` returned its input unchanged, so a
deployment that never set `ticket.globalSecret` wrote private keys and TOTP secrets to the
database in the clear with nothing in any log to say so. `TicketSigner.persistenceAllowed`
exists because of this, and is why signers were kept in memory rather than persisted under
those conditions.

**The key was XOR-folded.** The raw secret bytes folded into 32. A short passphrase gave a
256-bit AES key carrying only as much entropy as the passphrase had bytes, a 64-byte
secret halved its own entropy, and any secret made of a repeated 32-byte block folded to
**all zeros**.

## 2. Why not `0.1.0`

`0.1.0` fixed all three — HKDF-SHA256, a fresh random nonce per encryption, a versioned
format, and fail-closed when no secret is configured. It is nonetheless the wrong version
to land on, because of a bug it introduced:

> It reproduces the legacy XOR-folded key from `secret.getBytes(StandardCharsets.UTF_8)`.
> `0.0.2` produced it from `secret.getBytes()` — the platform default.

On a host whose default charset is not UTF-8, a `ticket.globalSecret` containing any
non-ASCII byte therefore folds to a *different* key than the one that wrote the stored
records, and every legacy record becomes permanently unreadable with no diagnostic
anywhere. `0.2.0` derives both candidates and tries each, so strictly more records decrypt
than before and nothing that decrypted stops.

Going straight to `0.2.0` also means one deploy rather than two. That matters more than it
looks: the boot sweep (§5) rewrites records in a format `0.0.2` cannot read, so a stop at
`0.1.0` would not have been cheaply revertible either.

## 3. The breaking change that has nothing to do with crypto

**`ticket.globalSecret` is now mandatory, and `YasssCore` refuses to start without it.**

This is a configuration change for any deployment that never set one, and the refusal is
deliberate. Without it the sequence is:

1. `TicketEngine.rotate()` calls `regenerateKeypair()`, which now throws rather than
   returning an unencrypted key.
2. `rotate()` catches and returns, so `signers` stays empty.
3. `sign()` throws `"signer queue has not yet been populated"`.
4. `AuthToken.issue` fails, so **every authenticated request fails**.

And the process starts cleanly, `GET /v1` answers `ok`, and the health check passes. A
server that boots, looks healthy, and cannot authenticate anybody is far worse to diagnose
than a startup error naming the parameter.

`TicketSigner.persistenceAllowed` still rejects the shipped placeholder, and still earns
its keep — but for a changed reason. A signer encrypted under
`"CHANGE-ME-to-a-long-random-string"` is genuinely encrypted, under a key printed in the
public source tree. That used to be a figure of speech and is now literally accurate.

## 4. The signer id is no longer key material

Under `0.0.2` a signer's UUID was the GCM IV for its own private key, so restoring one
under the wrong id failed the tag check and `TicketSigner.load`'s probe threw it out. The
nonce is now random and travels inside the stored blob, so **a current-format signer
restored under any id decrypts perfectly well**.

Ids must still round-trip exactly — a session ticket names its signer and
`TicketEngine.verify` resolves it by id — but nothing about decryption enforces that any
more. The check moved from `TicketSignerCodecTest` (where it was incidental) to
`TicketEngineKidTest` (where it is the point).

Rows written before the change *are* still keyed to the id, because the legacy path
derives the IV from it, and the library reads both formats. So the upgrade itself signs
nobody out.

## 5. Migration: what this project does about it

Reading legacy records is not the same as rewriting them, and the library only rewrites
one when the entity is saved for some other reason. Left alone, the accounts that keep
fixed-IV ciphertext indefinitely are exactly the least active ones.

`CredentialMigrator.sweepMFASecrets()` runs at boot, between `setGlobalSecret` and the API
starting to listen. Points worth knowing:

- **It does not go through `User.commit()`.** `commit` reconciles pending email addresses,
  which includes deleting other users whose `pending_email` matches this one's newly
  verified address — once per user, on every boot. `Event.backfillCodes` can use `commit`
  only because `Event.commit` has no such side effect.
- **The update is a compare-and-swap** on the old ciphertext (`WHERE id = ? AND mfakey =
  ?`). Two instances booting simultaneously both re-encrypt the same blob to different
  ciphertexts; the second write matches nothing and affects no rows. It equally covers a
  user rotating their secret between the read and the write.
- **A record that cannot be read is left exactly as it is.** Nulling the column would be
  tidier and would silently disable MFA for that account — a security downgrade delivered
  by a migration nobody asked for.
- **A 20-byte record is adopted as plaintext.** That is the recovery path for a deployment
  that ran with no secret at all. No ciphertext this system writes can be 20 bytes: GCM
  adds a 16-byte tag, so an MFA secret is 36 bytes legacy and 49 current.
  `CredentialMigratorTest` pins those numbers.
- **Ticket signers are not swept, deliberately.** They rotate daily and `prune` drops
  anything past retention, so every legacy row is gone within thirty days on the shipped
  defaults; `usable()` already discards a signer that fails to round-trip; and the legacy
  format reads fine meanwhile. A sweep would be code that runs meaningfully once and is
  untestable afterwards.

## 6. Charsets: both halves were needed

`Credentialed.sign` and `verifySig` used `message.getBytes()` with no charset. Before Java
18 that is the platform default, derived from the environment's locale.

This is a live path here, not a theoretical one. The signed message is browser-produced
JSON containing the user's email address, and a browser always signs UTF-8. On a host
whose default is anything else, an account with a non-ASCII address cannot authenticate —
and the failure looks exactly like a wrong password.

**Fixing the library alone does not fix this deployment.** `AuthToken` decodes the
`Authorization` header and the `creds` field with its own unqualified `new String(byte[])`
calls, so the JSON is already mangled before `verifySig` ever sees it. Both were pinned.

Verified rather than assumed: with the library at `0.2.0` and `AuthToken` left unfixed,
the `unicode-nfkc` golden vector (`josé@example.com`) fails under
`-Dfile.encoding=US-ASCII`. The `charsetTest` Gradle task runs exactly that, because under
a UTF-8 default the vector passes whether or not anything is pinned.

## 7. Other contract changes worth knowing

- **`sign()` throws instead of returning `""`.** An empty string is not a signature, and
  `TicketEngine.sign` used to wrap one in a `Signature` and hand it to `AuthToken.issue`,
  producing a ticket that failed verification somewhere else entirely.
- **`verifyTOTP` is now strict**: it answers only "is this code valid and unspent", and is
  `false` when no secret is enrolled. The old lenient contract moved to `isMFASatisfied`.
  `AuthToken.java` already guards on `getEncMFASecret() != null`, which makes its call site
  exactly equivalent to `isMFASatisfied` — a simplification available whenever anyone wants
  it, not a bug.
- **One-time passwords are single-use by default**, for two minutes, via
  `TOTPReplayGuard`. Note the default guard is **per-process**: with more than one
  instance it protects only against replays landing on the same one. A shared
  implementation can be supplied through `Credentialed.setTOTPReplayGuard`.
- `verifySig` logs at debug rather than error, so a malformed `Authorization` header is no
  longer a lever for flooding the log.

## 8. Still open

- **`SecureRandom.getInstanceStrong()`** is used by `regenerateKeypair`, and
  `TicketEngine.start` calls it synchronously at boot. On Linux the strong algorithm is
  `NativePRNGBlocking`; in a fresh container with little entropy that is a boot hang rather
  than a crash. Pre-existing, unchanged by any of this, and worth knowing before it
  happens.
- `SessionEngine` was rewritten upstream in `0.2.0` — its old token format reused a key and
  nonce for every token minted in the same second, which is a complete authentication
  bypass. **This project does not use that class** and never has; session handling here is
  `AuthToken` / `TicketEngine` / `SessionTicket`. Recorded only so nobody adopts it
  assuming it was always sound.
