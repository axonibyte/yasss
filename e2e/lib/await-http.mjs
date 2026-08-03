/**
 * Poll a URL until it answers, or give up.
 *
 * The stack publishes no ports (see run.sh), so readiness cannot be probed with
 * curl from the host any more. This runs inside the pod like every other
 * driver, which is also the only place `127.0.0.1` means what the app's config
 * says it means.
 *
 * usage: node lib/await-http.mjs <url> <timeout-seconds> [<expected-substring>]
 *
 * The substring is matched against the body with all whitespace stripped: the
 * real server pretty-prints its JSON, so a naive grep for `"status":"ok"` finds
 * nothing. That exact mistake is why the old health check silently passed
 * against the fake and never against the real thing.
 */
const [url, seconds, needle] = process.argv.slice(2);

const limit = Number(seconds);
const started = Date.now();
const deadline = started + limit * 1000;

let last = 'no attempt made';

while (Date.now() < deadline) {
  try {
    const res = await fetch(url);
    const body = await res.text();
    if (res.ok && (!needle || body.replace(/\s+/g, '').includes(needle))) {
      console.log(`  ready after ${Math.round((Date.now() - started) / 1000)}s`);
      process.exit(0);
    }
    last = res.ok ? `HTTP ${res.status} without ${needle}` : `HTTP ${res.status}`;
  } catch (err) {
    last = err.message;
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

console.error(`  gave up on ${url} after ${limit}s: ${last}`);
process.exit(1);
