# UTC storage

**Status: fixed by pinning, not by converting.** The application forces the JVM's default
zone to UTC before it opens its first connection. Nothing was rewritten in the database,
deliberately — read on for why, and for the one case that does need a manual conversion.

---

## What the problem was

Event times live in `DATETIME` columns, which carry no zone. There are four:

| Column | What it holds |
|---|---|
| `event.first_draft` | when the event was first drafted |
| `event_window.begin_time` | when a window starts |
| `event_window.end_time` | when it ends |
| `reminder_log.window_begin` | a copy of the above, for the reminder |

(The `last_update` columns elsewhere are MariaDB `TIMESTAMP`, which the server stores as UTC
internally. They are bookkeeping and nothing reads them, so they are not part of this.)

A `java.sql.Timestamp` is an *instant*. A `DATETIME` is a *wall-clock reading*. The JDBC driver
converts between them using the JVM's default zone, in both directions. Measured against
MariaDB 11 with the driver this project uses, writing the instant `2026-01-15T12:00:00Z`:

| JVM zone | Stored literal | Read back |
|---|---|---|
| `UTC` | `2026-01-15 12:00:00` | correct |
| `America/Chicago` | `2026-01-15 06:00:00` | correct |
| `Asia/Tokyo` | `2026-01-15 21:00:00` | correct |

Note the last column. The round trip is **symmetric in every zone**, which is why nothing ever
looked wrong. The zone is not a bug on its own — it is the storage format.

It stops being symmetric when the zone moves. Relocate the server, change the base image, add
`TZ=` to a unit file, and every instant already stored is reinterpreted. An event recorded at
09:00 Chicago reads back as 09:00 UTC: five or six hours of drift depending on the season,
across every event, window and reminder at once, with nothing in any log to say it happened.

Incidentally, the JDBC URL contains `serverTimezone=UTC` and always has. It does nothing —
MariaDB Connector/J 3.x recognizes `timezone`, not `serverTimezone`, and unknown parameters are
ignored rather than rejected. It reads like a safeguard and is not one.

## What was done

`YasssCore.pinStorageZone()` sets the JVM default to UTC as the first statement of `main`,
before any connection exists. That is the whole fix.

The container this ships in has always been UTC — no `TZ`, and `/etc/localtime` pointing at
`Etc/UTC` — so **the data on disk was already correct**. What it lacked was a guarantee: it was
right by accident of the base image, one environment variable away from being wrong everywhere.
Now it is right on purpose, and the log says so if the JVM was anything else.

The e2e suite runs its application container with `TZ=America/Chicago` specifically to prove
this. If the pin is ever removed, every stored instant shifts by that offset and the time
assertions in the text, reminders and browser stages fail. A container that happened to be UTC
would have proved nothing.

## Why there is no migration script

Two reasons, and the first is fatal on its own.

**`Database.setup` replays every script on every boot.** A conversion script — `UPDATE ... SET
begin_time = CONVERT_TZ(begin_time, 'America/Chicago', '+00:00')` — is not idempotent. It would
shift every timestamp again on the next restart, and again on the one after that. There is no
natural guard for it, because the schema has nowhere to record "this ran". That is exactly the
problem `docs/remaining-work.md` flagged when it filed this as needing care.

**And it would corrupt correct data.** The values are already UTC in every deployment running
the shipped container. A blanket conversion would be a change applied to data that did not need
it.

## If your deployment was *not* running in UTC

Then your stored instants are in whatever zone the JVM had, and pinning to UTC means they now
read back shifted. This needs a one-time conversion, run by hand, once, with the application
stopped:

```sql
-- Replace 'America/Chicago' with the zone the JVM was actually using.
-- Named zones need MariaDB's timezone tables loaded:
--   mariadb-tzinfo-to-sql /usr/share/zoneinfo | mariadb -u root -p mysql
-- Otherwise use a fixed offset such as '-06:00', but note that a fixed offset
-- is wrong for half the year anywhere that observes daylight saving, and these
-- rows may span a transition.

UPDATE yasss_event
   SET first_draft = CONVERT_TZ(first_draft, 'America/Chicago', '+00:00');

UPDATE yasss_event_window
   SET begin_time = CONVERT_TZ(begin_time, 'America/Chicago', '+00:00'),
       end_time   = CONVERT_TZ(end_time,   'America/Chicago', '+00:00');

UPDATE yasss_reminder_log
   SET window_begin = CONVERT_TZ(window_begin, 'America/Chicago', '+00:00');
```

`CONVERT_TZ` returns `NULL` if the named zone is unknown, so check the row counts and spot-check
a value before committing. Take a backup first: this is not reversible by re-running it, and
running it twice shifts everything twice.

The `last_update` columns are `TIMESTAMP` and must **not** be converted — the server already
holds those as UTC.
