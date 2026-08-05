# `Database.setup` in `axb-lib-db` — fixed in 0.4.1

**Status: resolved upstream.** This was written as a report against 0.3.4/0.4.0; the
behaviours below were fixed in `axb-lib-db-java` 0.4.1. Kept as a record, because the
constraints shaped every migration in `db/` and the reasoning is worth not rediscovering.

> **This project is now on 0.5.0.** See the bottom of this document for what changed after
> 0.4.1 and what it means here — one of those changes alters connection-pool behaviour.

Verified against MariaDB 11.

---

## 1. Script lines were joined with a single space, so `--` comments swallowed the file

`setup` read each `db/*.sql` resource and joined its lines with `" "`, discarding the
newlines. A SQL line comment therefore extended to the end of the **file**, not the line.

The failure mode was the problem. A script whose body sat behind a `--` header became:

```sql
-- Widen the address column for IPv6.        ALTER TABLE ... ;
```

A valid, empty statement. It executed without error, `setup` reported success, and the
migration simply did not happen. Nothing in any log distinguished it from one that ran.

**How it surfaced here.** A migration widening `ip_addr` to `VARBINARY(16)` carried a
fifteen-line comment header. It never ran. It was caught only because the E2E suite asserts
the resulting column type directly — had it merely asserted "the app starts", the schema
would have been silently wrong in production.

Every pre-existing migration in `db/` happened to contain no `--` comments at all, which is
presumably why this was never hit before. That was folklore, not a safeguard.

**Fixed** by joining with `"\n"` and parsing comments properly.

## 2. Each file was prepared and executed as a single statement

`setup` called `prepareStatement` once per file with the whole joined body, so a file
containing two statements separated by `;` was a syntax error at prepare time. That one at
least failed loudly, but the rule was documented nowhere and the error named a syntax problem
rather than the actual constraint.

It also shaped migration design in non-obvious ways: adding three columns had to be one
`ALTER TABLE` with three `ADD COLUMN` clauses, and a table plus its index had to be two
separate files — hence the paired `009_table_reminder_log.sql` /
`009_table_reminder_suppression.sql`.

**Fixed.** Scripts may now hold several statements. Semicolons inside string literals, quoted
identifiers, and comments are left alone, so a semicolon in a default value no longer splits a
statement in half.

## 3. Related: `setup` still tracks nothing

Every script is replayed on every boot. This is not a bug — it is a deliberate design that
makes migrations idempotent by construction — but the consequence stands: a migration must use
`IF NOT EXISTS` throughout, and `DROP` is only safe in its `IF EXISTS` form.

This is why `012_upgrade_volunteer_drop_ip_addr.sql` uses `DROP COLUMN IF EXISTS`, and why the
E2E suite restarts the application once specifically to prove the migrations survive a replay.

---

## What this project does now

The migrations were **not** rewritten to use the newly-available features. They work, they are
idempotent, and churning 21 files to change comment syntax would risk a schema for no
functional gain. The `/* */` headers and one-statement-per-file layout stay.

What changed is that the constraint is no longer load-bearing: a future migration may use
`--` comments or hold several statements, and the header comments in `db/*.sql` that cite this
document as a reason to avoid them are now historical rather than binding.

## Other fixes that arrived with the version jump

0.3.4 → 0.4.1 also brings 0.4.0, which is worth knowing about even though neither change
affects this project:

- **`SQLBuilder.or()` is retroactive by one filter.** `.where("a").or().where("b")` produces
  `(a = ? OR b = ?)`, not `a AND (b = ?)` — so a scoping predicate written before `or()` gets
  pulled into the OR group, widening the result set. Unbalanced parentheses in that
  construction were fixed in 0.4.0. **This project builds no OR groups**, so nothing here is
  affected; recorded because the trap is easy to walk into.
- **`Database.close()` no longer swallows exceptions**, logging them at WARN instead. It still
  does not throw, so no `finally` block anywhere changes behaviour — but a connection that
  fails to return to the pool is now visible in the log rather than silent.
- **`Database.transaction()`** was added, for work that spans several statements. Connections
  come from the pool with autocommit on, so a multi-statement sequence issued through
  `connect()` is not atomic. Nothing in this project currently needs it; `Volunteer.commit()`
  and `Event.commit()` would be the candidates if partial-write behaviour ever becomes a
  concern.

---

## 0.4.2 and 0.5.0 — the pool

Two further changes landed upstream after this document was written, both in `Database` rather
than in `setup`.

### The pool can be closed (0.4.2)

`Database` implements `AutoCloseable` and has a no-argument `close()` that shuts the pool down.
Previously the `HikariDataSource` was private and the only public `close` took a connection, a
statement and a result set — so an application could return connections to the pool and never
dispose of the pool itself.

`YasssCore`'s shutdown hook now calls it, **after** both daemon joins. The ordering is
deliberate: a reminder sweep still draining its batch is writing through that pool, and closing
it first would produce exactly the abandoned-mid-batch shutdown the joins exist to prevent.

Note the two `close` methods are different operations that happen to share a name.
`close(Connection, PreparedStatement, ResultSet)` — which every `finally` block in `model/`
calls — still returns one connection to the pool and still tolerates nulls.

### Pool settings now reach the pool (0.5.0)

**This one changes runtime behaviour here.** The properties map passed to the six-argument
constructor was handed wholesale to `addDataSourceProperty`, which forwards values to the JDBC
driver. Pool settings sent that way are accepted and then ignored — so the library's own
defaults named a `connectionTimeout`, `maxLifetime`, `idleTimeout` and `leakDetectionThreshold`
while the pool ran on Hikari's values for all four. Nothing failed; the configuration simply did
not exist.

They take effect from 0.5.0. This deployment uses the no-argument constructor, so it inherits
those defaults, and two of them are shorter than Hikari's:

| Setting | Hikari default | Now in force | Effect here |
|---|---|---|---|
| `maxLifetime` | 30 min | 3 min | Connections are retired ten times more often |
| `idleTimeout` | 10 min | 30 s | Idle connections are dropped much sooner |
| `connectionTimeout` | 30 s | 30 s | No change |
| `leakDetectionThreshold` | disabled | 60 s | Warns if a connection is held a full minute |

The practical consequence is more connection churn against MariaDB. Nothing in this project
holds a connection across requests, so no code changes; if the churn ever shows up in the
database's own metrics, the six-argument constructor now accepts overrides — including
`maximumPoolSize` and `minimumIdle`, which were unreachable before.

`leakDetectionThreshold` was raised upstream from 5 s to 60 s specifically because `setup()`
holds one connection for the length of a migration run. At 5 s, this project's 22 scripts would
have reported that connection as a leak, with a stack trace, on every boot.
