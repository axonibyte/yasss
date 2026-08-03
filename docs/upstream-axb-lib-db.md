# Upstream report: `Database.setup` in `axb-lib-db`

Filed here rather than fixed, because the behaviour is in a dependency. Two properties of
`com.axonibyte.lib.db.Database.setup` are undocumented, silent, and each cost time on this
project. Both were verified against the shipped bytecode, not inferred.

Applies to `axb-lib-db` as consumed by YASSS (`com.axonibyte.lib:db`). Reproduced on
MariaDB 11.

---

## 1. Script lines are joined with a single space, so `--` comments swallow the file

`setup` reads each `db/*.sql` resource and joins its lines with `" "`, discarding the
newlines. A SQL line comment therefore extends to the end of the **file**, not the end of the
line.

The failure mode is the problem. A script whose entire body sits behind a `--` header
comment becomes:

```sql
-- Widen the address column for IPv6.        ALTER TABLE ... ;
```

That is a valid, empty statement. It executes without error, `setup` reports success, and the
migration simply did not happen. Nothing in any log distinguishes it from a migration that
ran.

**How it surfaced here.** A migration widening `ip_addr` to `VARBINARY(16)` carried a
fifteen-line comment header. It never ran. It was caught only because the E2E suite asserts
the resulting column type directly — had it merely asserted "the app starts", the schema
would have been silently wrong in production.

Every pre-existing migration in `db/` happens to contain no `--` comments at all, which is
presumably why this was never hit before. That is folklore, not a safeguard.

**Suggested fix:** join with `"\n"`. That is behaviour-preserving for every script that does
not rely on the current behaviour, and no script reasonably could.

**Workaround in this repository:** every migration uses `/* */` block comments only.

---

## 2. Each file is prepared and executed as a single statement

`setup` calls `Connection.prepareStatement` once per file with the whole joined body. A file
containing two statements separated by `;` is a syntax error at prepare time.

This one at least fails loudly, but the constraint is not documented anywhere, and the error
names a syntax problem rather than the actual rule. It also shapes migration design in a way
that is not obvious: adding three columns to a table has to be one `ALTER TABLE` with three
`ADD COLUMN` clauses rather than three statements, and a table plus its index has to be two
separate files.

**Suggested fix:** split on statement boundaries, or document the one-statement rule.

**Workaround in this repository:** one statement per file, hence the paired
`009_table_reminder_log.sql` / `009_table_reminder_suppression.sql`.

---

## 3. Related: `setup` tracks nothing

Every script is replayed on every boot. This is not a bug — it is a deliberate design that
makes migrations idempotent by construction — but it has a consequence worth stating: a
migration must use `IF NOT EXISTS` throughout, and **`DROP` is effectively unavailable**,
because a second boot would fail on the already-dropped object.

This is why the legacy `ip_addr` column is still present in this schema (see
`docs/remaining-work.md` §2.4) rather than dropped after the IPv6 backfill.

The E2E suite restarts the application once specifically to prove the migrations survive a
replay; see `e2e/README.md`.
