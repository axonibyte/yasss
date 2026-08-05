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

Requires `podman` and a JDK. Everything else runs in a container, including the
drivers themselves — there is no host `node`, no `npx`, and no locally installed
Playwright browsers. Pulls `mariadb:11`, `eclipse-temurin:17-jre`,
`mailpit`, `node:22-slim` and the Playwright image on first run.

The drivers run *inside the pod*, which is why the stack needs no published
ports: a container in the pod reaches the app on the same `127.0.0.1:7455` the
app's own config names. `YASSS_E2E_PUBLISH=1` (the default on Linux) also maps
the app and mailpit to host ports, purely so a `--keep` stack can be poked at
from outside.

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
| text | Every text surface round-tripped through the database and read back, plus the length bounds and the escaping of user text on the HTML report; see below |
| concurrency | Volunteer capacity under simultaneous claims — the slot cap, the activity cap and the all-or-nothing multi-slot signup; see below |
| browser | Flows through Chromium against the live stack, in the Playwright image so the browser matches the client that drives it. `YASSS_E2E_BROWSERS=chromium,firefox,mobile-chromium` widens it to the `@compat` subset on other engines; the full cross-engine matrix lives on the fake suite, which is parallel and needs no stack |
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

- Nothing is published by default beyond the app and mailpit, and on a host that
  cannot publish at all nothing is. The database is never reachable from outside
  the pod either way.
- Config lives in `config/yasss.cfg` with CAPTCHAs off and sign-in required —
  the exact combination that used to NPE on every request before the CAPTCHA
  fix, so it is worth being the default here.
- `config/content/*.md` back `GET /v1/texts/*`, so the markdown path is
  exercised too.
- `yasss.jar` is a build artifact and is gitignored.
- Not wired into CI. It needs podman and pulls several images; the existing
  Playwright step against the fake covers per-commit needs. This is for
  pre-merge and pre-release.

## FreeBSD

The suite runs on FreeBSD. Linux is the default path and takes none of the
branches below; they exist because podman there is not the same animal.

Containers are jails run by `ocijail`, not a Linux VM — a container's processes
appear in the host's own `ps` with the `J` flag. Linux images run through the
linuxulator, which is what makes the arrangement work at all and also what
constrains it:

- **Rootless mode does not exist**, so `run.sh` calls podman through `sudo`. A
  `NOPASSWD` entry for `/usr/local/bin/podman` is enough.
- **Images must be asked for by platform.** podman reports the host OS as
  `freebsd`, so a multi-arch manifest resolves to nothing and a plain pull fails
  with `no image found in image index`. Pulls pass `--os linux --arch amd64`.
- **Publishing a port needs `pf`**, which podman drives via `pfctl`; without it
  the pod fails to start rather than merely losing the mapping. This is why the
  drivers moved into the pod, and why publishing defaults off when `/dev/pf` is
  absent. A pod on `--network none` still has the shared loopback the suite
  needs.
- **MariaDB cannot run as uid 0 here.** Its entrypoint reads `/proc/self/cgroup`
  when it is root, the linuxulator's procfs has no such file, and the container
  dies instantly under `set -e` with nothing useful in the log. It runs as
  `mysql` instead, and warns its way past `io_uring` and native AIO before
  falling back and starting normally.
- **Do not swap in an alpine image.** A musl binary hangs forever under the
  linuxulator instead of failing, which costs an afternoon to notice. The driver
  image is `node:22-slim` for exactly this reason.
- `pkg install catatonit` — podman needs it for a pod's infra container and does
  not depend on it.

## One suite at a time

`run.sh` takes a host-wide lock (`/tmp/axb-e2e.lock`, override with
`AXB_E2E_LOCK`) and holds it for the whole run, teardown included. If another
suite holds it you get a `waiting` line and then your turn; `--help` is answered
without queueing.

This is not tidiness. Every e2e suite on this host drives the same rootful
podman — one state database, one storage tree, one OCI runtime — and two of them
at once corrupt each other. Neither script is at fault: each removes only its
own containers, by name. The contention is on podman's global state, and it
surfaces two ways:

- `ocijail: mounting /catatonit ... Device busy` when the second pod starts,
  because podman nullfs-mounts that single host binary into every pod's infra
  container; and
- **containers vanishing mid-run**, with the pod's own container count
  disagreeing with what actually exists. `yasss-e2e-db` disappearing produces
  `database malfunction` from every endpoint and `Connection is not available`
  from Hikari — which reads exactly like a connection-pool bug, and is not one.
  That misdirection cost the best part of a day.

**The lock only works if every sibling suite takes the same one.** It is
deliberately named for the host rather than for this project. A suite sharing
this podman needs the same block near the top of its own `run.sh`:

```bash
readonly E2E_LOCK="${AXB_E2E_LOCK:-/tmp/axb-e2e.lock}"
if [[ -z "${AXB_E2E_LOCK_HELD:-}" ]]; then
  export AXB_E2E_LOCK_HELD=1
  if command -v flock >/dev/null 2>&1; then
    exec flock -w "${AXB_E2E_LOCK_WAIT:-3600}" "${E2E_LOCK}" "$0" "$@"
  elif command -v lockf >/dev/null 2>&1; then
    exec lockf -k -t "${AXB_E2E_LOCK_WAIT:-3600}" "${E2E_LOCK}" "$0" "$@"
  fi
fi
```

Place it after that script's argument parsing, and re-exec with the arguments
saved before the parser consumed them. The lock is advisory and released when
the holder dies, so a killed or crashed run leaves nothing to clean up.

## The text stage

`text/verify.mjs`. Publishing successfully and storing faithfully are different claims, and
only the first was ever asserted: a title stored as `????`, truncated mid-character or
double-escaped produces exactly the same success response. Every corpus value goes into the
event title, description, activity label, volunteer name and custom-field answer, and comes
back out again — through `POST`, through `PATCH`, and through `GET`.

Three things make this non-trivial:

- **The whitespace models differ.** Java's `String.strip()` and JS `trim()` disagree in both
  directions — `trim()` removes U+00A0, U+2007, U+202F and U+FEFF, `strip()` removes
  U+001C–U+001F. Expected values are written down in the corpus rather than computed.
- **The serializer escapes.** `org.json` emits U+0080–U+009F and U+2000–U+20FF as `\uXXXX`,
  so assertions compare the parsed value and never the raw body.
- **The columns had no character set.** Nothing in the schema ever named one, so text columns
  inherited the server default — utf8mb4 on a modern image, latin1 before MariaDB 11.6. The
  suite now starts MariaDB *as latin1 on purpose* so that migration `017` and the charset
  assertions actually prove something rather than passing by accident.

The stage also carries the checks for edges that need no fixture of their own: the length
bound counted in code points rather than UTF-16 units, an over-long title on `PATCH`, a
token-less password reset, and that a volunteer named `<img src=x onerror=...>` reaches the
organiser's printable report escaped.

## The concurrency stage

`concurrency/verify.mjs`. Capacity was checked by counting on one pooled connection and
inserting on another, with nothing holding the gap — so two claimants for the last seat both
read the same count and both won. The endpoint the signup form actually uses did not check at
all, which needed no concurrency to exploit.

Eight scenarios, 16 simultaneous requests each, five rounds apiece against a freshly built
event: a race that passes once has proved nothing. The oracle is the event's own `rsvpCount`
read back afterwards, because counting `201`s alone would miss a fix that answers correctly
and stores wrongly. Scenario E exists to catch the opposite mistake — an uncapped activity
must still admit all sixteen rather than being serialised into spurious rejections.

Scenario H is a known gap rather than a regression test; see `docs/remaining-work.md`.
