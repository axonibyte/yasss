/**
 * The assertion vocabulary every driver in this directory shares.
 *
 * A driver is a plain script, not a test framework: it prints a tick or a cross
 * per claim, counts the crosses, and exits non-zero if there were any. That is
 * enough for `run.sh`, which only reads the exit status, and it keeps a failure
 * legible in a log that also carries container output.
 *
 * Deliberately a module-level counter rather than a returned collector. Drivers
 * check from inside nested helpers and loops, and threading an accumulator
 * through all of that bought nothing when this was copied by hand into three
 * files.
 */

let failures = 0;

/**
 * Record one claim.
 *
 * `detail` is printed only on failure, so it can be as verbose as it needs to
 * be -- a whole response body is normal and welcome.
 */
export function check(ok, what, detail = '') {
  if (ok) console.log(`  ✓ ${what}`);
  else {
    failures += 1;
    console.log(`  ✗ ${what}${detail ? `\n      ${detail}` : ''}`);
  }
  return ok;
}

/** How many claims have failed so far. */
export const failureCount = () => failures;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Print the summary and exit. Terminal by design -- a driver's last line.
 */
export function finish(name) {
  console.log(failures === 0 ? `\n${name}: all checks passed` : `\n${name}: ${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
}
