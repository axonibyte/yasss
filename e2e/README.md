# End-to-end suite

Runs the real server against a real MariaDB in podman, fuzzes the API, drives the
app through a real browser, and tears everything down.

```sh
./e2e/run.sh                  # the whole thing
./e2e/run.sh --keep           # leave the stack up for poking at
./e2e/run.sh --skip-build     # reuse the existing jar and image
./e2e/run.sh --only fuzz      # one stage
YASSS_E2E_PORT=8455 ./e2e/run.sh
```

Requires `podman` and `node`. Pulls `mariadb:11` and `eclipse-temurin:17-jre` on
first run.

## Why this exists

`frontend/tests/e2e` already covers the app against a fake API, and does it in
seconds. But a fake is faithful exactly where someone thought to make it
faithful, and the bugs worth catching are the ones nobody thought of. This suite
exists to run the parts a fake cannot: the real deserializer, the real
authorization, the real schema migrations, and the real bundle served out of the
jar's classpath.

It has already earned its keep — see "What this suite found" below.

## Stages

| Stage | What it proves |
|---|---|
| build | Gradle → Vite → `processResources`, so the browser tests exercise the bundle a deployment would actually serve |
| up | MariaDB, mailpit and the app in one pod, sharing a network namespace so the app reaches the database on `127.0.0.1:3306` and SMTP on `127.0.0.1:1025` exactly as its config expects |
| schema | Every expected table exists, and the IPv6 column really is `varbinary(16)` |
| restart | The app is restarted once. `Database.setup` tracks nothing and replays every script on every boot, so a second start is the only thing that proves the migrations are idempotent |
| fuzz | ~400 malformed requests across every endpoint (`FUZZ_ITERATIONS` to raise it); see below |
| accounts | Self-service registration end to end: register, receive the email, click the link, get promoted, create an event; see below |
| reminders | The reminder feature end to end against real SMTP and the real daemon; see below |
| browser | Fourteen flows through Chromium against the live stack |
| down | Runs on every exit path, including Ctrl-C and a failed stage |

## The accounts stage

`accounts/verify.mjs`. The platform's front door, and nothing exercised it whole before. Two
separate bugs lived in the gap between "register" and "can actually do something", and
neither was visible from inside the API alone because every individual step answered 200:

- the verification link was signed by the `TicketEngine`, whose signers roll on a roughly
  fifteen-minute horizon and are lost on restart, so the email was dead long before most
  people opened it; and
- verifying populated the `email` column — which is what authentication resolves against, so
  the user could suddenly log in — but never promoted the access level, so every endpoint
  gated on `STANDARD` still refused them. A self-registered account could never create an
  event without an ADMIN promoting it by hand.

The stage ends by creating an event as the newly verified user, which is the only assertion
that would have caught the second one.

## The reminder stage

`reminders/verify.mjs`. This is the only place the reminder feature is exercised whole: a
real database, a real SMTP conversation with mailpit, and the real `ReminderEngine` sweeping
on its poll interval. Everything else about reminders is tested against a fake API that
cannot send mail, so a break in the daemon, the finder's SQL, the mail templates or the SMTP
configuration would be invisible without this.

It is slow — around three minutes — and irreducibly so. The daemon polls once a minute in
this configuration, and proving a reminder is *not* re-sent means waiting out a second sweep.

Three of its checks exist because those exact failures happened here during development:

- a confirmation link that answered 200 and silently did not stick, because the token column
  was never hydrated by the volunteer finder;
- a signup that answered 500 and lost the volunteer, because a `MailerException` escaped the
  endpoint — with SMTP down, nobody could sign up at all;
- a reminder that was claimed and marked delivered but never sent, because `Mail` hardcoded
  `SMTP_TLS` against a plaintext sink.

Note `email.smtp.transport` in `config/yasss.cfg`: mailpit speaks plain SMTP on 1025. The
shipped default remains `SMTP_TLS`, so production is unaffected.

## The fuzzer

`fuzz/fuzz.mjs`. The oracle is not "is the answer right" but the cheaper and more
general:

1. no 5xx, ever
2. every response is a well-formed `{status, info}` envelope
3. the server is still alive at the end

That is aimed at this codebase's actual failure mode. Nearly every bug found
during the rewrite was an unguarded dereference surfacing as a 500 — a volunteer
id belonging to another event, a null actor on an anonymous request, an empty
row list, a validator that was never constructed. None were exotic inputs; they
were ordinary requests nobody had tried.

Two classes of response are deliberately **not** findings, because the
application only ever emits JSON — an HTML body means the container answered
first:

- Spark's own 404 when no route matches (an empty path segment, say). This is
  the same missing catch-all that rules out path-based routing for the frontend.
- Jetty's 431 when a header exceeds its limit. The fuzzer sends an 8 KB
  `Authorization` header on purpose.

An HTML **5xx** would still be a finding — that is a crash page.

Reproducibility is honest rather than absolute: the seed is printed and can be
replayed with `FUZZ_SEED`, but the seeded entity ids differ per database, so a
replay follows a similar and not identical path. Every finding prints its full
request so any single one can be reproduced by hand.

## What this suite found

Everything here was invisible to the unit and fake-API suites, which were green
throughout.

**The IPv6 migration never ran.** `Database.setup` joins the lines of a script
with no separator, so a leading `--` comment silently comments out the entire
rest of the file. The statement executed as a no-op, with no error logged. Every
pre-existing migration in `db/` happens to contain no comments at all; mine had a
fifteen-line header. Both migrations now use `/* */`, which survives the join.

**Four endpoints returned 500 for plain client errors.** Registration without
`pubkey` (the field is tokenized optional, but the `User` constructor
base64-decodes it unconditionally). A window beginning after it ends, in three
places, where the `EndpointException` omitted its status code and so defaulted
to 500. And a volunteer POST omitting `rsvps` — tokenized optional, but
`tokenizeJSONArray` iterates unconditionally, its `strict` flag governing only
malformed elements rather than an absent array. All now return 400, and the
fuzzer's allow-list of tolerated crashes is gone with them.

**The window picker asked for a range it was already displaying.** bulma-calendar
renders its default range as soon as it attaches, but `DateRangePicker` only
published values to its binding on user interaction — so opening "Add a Window"
and pressing Save produced "Please specify the entire window range" over a field
plainly showing `08:00 AM - 05:00 PM`. This is the one component nothing else
tests, and it took a real browser to see it.

**The health check itself was wrong.** The real server pretty-prints its JSON;
the fake returns it compact. A grep for `"status":"ok"` matched the fake and
never the real thing.

## Notes

- Only the app port is published; the database stays inside the pod.
- Config lives in `config/yasss.cfg` with CAPTCHAs off and sign-in required —
  the exact combination that used to NPE on every request before the CAPTCHA
  fix, so it is worth being the default here.
- `config/content/*.md` back `GET /v1/texts/*`, so the markdown path is
  exercised too.
- `yasss.jar` is a build artifact and is gitignored.
- Not wired into CI. It needs podman and pulls two images; the existing
  Playwright step against the fake covers per-commit needs. This is for
  pre-merge and pre-release.
