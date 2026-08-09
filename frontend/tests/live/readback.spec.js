/**
 * What the server gives back, not merely that it accepted.
 *
 * The round-trip block in `scheduling-fuzz.spec.js` asserts that publishing
 * succeeds for every value the client accepts, which is a real property and not
 * this one. A title stored as `????`, truncated mid-character, or
 * double-escaped produces exactly the same green success toast. These read it
 * back — once from the API and once from a reloaded page — because the two
 * prove different things: the API check is storage fidelity through the Java
 * strip, the JDBC round trip and the column's character set; the DOM check is
 * rendering fidelity, that nothing on the way out re-interprets the corpus's
 * tag soup as markup.
 *
 * Split out of the fuzz spec rather than added to it: that block already sits
 * near its two-minute budget, and a reload per case is another three or four
 * seconds each.
 */
import {
  addActivity, addWindow, expect, publish, ready, startWizard, test, uniqueTitle,
} from './helpers/harness.js';
import { UNICODE_ROUNDTRIP } from './helpers/corpus.js';

test.describe.configure({ timeout: 180_000 });

/**
 * Java's `String.strip()`, which is what the server applies to every text field.
 *
 * Not the same as JS `trim()`, in both directions. Measured against JDK 17 and
 * node 24: `trim()` removes U+00A0, U+2007, U+202F and U+FEFF, which
 * `Character.isWhitespace` does not consider whitespace at all; `strip()`
 * removes U+001C-U+001F, which `trim()` leaves in place. Computing the expected
 * value with `trim()` would therefore agree with the server for most inputs and
 * quietly disagree for exactly the ones worth testing.
 */
const JAVA_WS = new RegExp(
  '['
  + '\\u0009\\u000a\\u000b\\u000c\\u000d' // tab, LF, VT, FF, CR
  + '\\u001c-\\u001f'                     // file/group/record/unit separators
  + '\\u0020'                             // space
  + '\\u1680'                             // ogham space mark
  + '\\u2000-\\u2006\\u2008-\\u200a'      // quads and spaces; U+2007 excluded
  + '\\u2028\\u2029'                      // line and paragraph separators
  + '\\u205f\\u3000'                      // medium mathematical, ideographic
  + ']',
);
function javaStrip(value) {
  let start = 0;
  let end = value.length;
  while (start < end && JAVA_WS.test(value[start])) start += 1;
  while (end > start && JAVA_WS.test(value[end - 1])) end -= 1;
  return value.slice(start, end);
}

test('the whitespace model matches the server’s, in both directions', () => {
  // A unit assertion living in a live spec on purpose: if this drifts, every
  // expectation below is wrong in a way that looks like data corruption.
  for (const c of UNICODE_ROUNDTRIP) expect(javaStrip(c.sent), c.name).toBe(c.stored);
});

/**
 * What the *browser* path can be expected to store, which is not the same as
 * what the API path stores.
 *
 * Two normalizations happen before the server ever sees the value, and both are
 * correct:
 *
 *   - a single-line `<input>` cannot hold a line break, so the browser replaces
 *     one with a space; and
 *   - `validateSummary` trims with JS `trim()`, which removes the no-break
 *     spaces and the BOM that `String.strip()` would have kept.
 *
 * So the expectation composes the tiers rather than reusing the corpus's
 * `stored`: JS trim first, then the Java strip. The corpus value is still the
 * right expectation for `e2e/text/verify.mjs`, which sends over HTTP and so
 * tests the server on its own. The difference between the two is the whole
 * point of having both.
 */
const throughBrowser = (sent) => javaStrip(sent.trim());

const TYPEABLE = UNICODE_ROUNDTRIP.filter((c) => !c.sent.includes('\n'));

test('a published title comes back exactly as it was stored', async ({ page }) => {
  for (const c of TYPEABLE) {
    const title = c.sent;
    await startWizard(page, title);
    await addActivity(page, 'Setup');
    await addWindow(page);
    const id = await publish(page);

    const res = await page.request.get(`/v1/events/${id}`);
    const { event } = await res.json();
    expect(event.shortDescription, `API fidelity for ${c.name}`).toBe(throughBrowser(c.sent));

    // A real reload rather than the in-memory model, so this is the value the
    // server sent rather than the one the browser already had.
    await page.goto(`/?event=${id}`);
    await ready(page);
    const rendered = await page.locator('[data-testid="event-title"]')
      // `textContent`, never `innerText`: the latter applies CSS whitespace
      // collapsing, so a value with inner runs of spaces or a newline comes back
      // normalized and the comparison fails for reasons that have nothing to do
      // with storage.
      .evaluate((el) => el.textContent);
    expect(rendered.trim(), `DOM fidelity for ${c.name}`).toBe(throughBrowser(c.sent).trim());
  }
});

test('a line break typed into the title is normalized by the input, not lost',
  async ({ page }) => {
    // Worth pinning rather than leaving implicit: the value the server receives
    // is not the value the test typed, and the difference is the browser's
    // doing. Anyone debugging why a multi-line title is impossible should find
    // this rather than suspect the API.
    await startWizard(page, 'line one\nline two');
    await addActivity(page, 'Setup');
    await addWindow(page);
    const id = await publish(page);

    const { event } = await (await page.request.get(`/v1/events/${id}`)).json();
    expect(event.shortDescription).toBe('line one line two');
  });

test('markup in a title is rendered as text, never as markup', async ({ page }) => {
  // The security half of the same question. The value must survive storage
  // *and* be inert on the way out — asserting text equality alone would be
  // satisfied by a page that had executed it.
  const title = `${uniqueTitle('XSS')} <img src=x onerror="window.__pwned=1">`;
  await startWizard(page, title);
  await addActivity(page, 'Setup');
  await addWindow(page);
  const id = await publish(page);

  await page.goto(`/?event=${id}`);
  await ready(page);

  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  expect(await page.locator('[data-testid="event-title"] img').count()).toBe(0);
});
