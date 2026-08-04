/**
 * Replacing a field's contents the way a paste does.
 *
 * The distinction matters because `CapField` reads its input one way and writes
 * it back another: it clamps on every `input` event but only snaps the visible
 * box on `change`. Typing produces a stream of `input` events with valid
 * intermediate states; a paste produces exactly one, and no `change` until the
 * field is left. That difference is the whole subject of `paste.spec.js`.
 *
 * `keyboard.insertText` is the only portable way to reproduce it:
 *
 *   - `locator.fill()` dispatches both `input` *and* `change`, which is
 *     precisely what conceals the divergence.
 *   - `pressSequentially()` is typing — the control case, not the case here.
 *   - Real clipboard plumbing is not portable: `grantPermissions('clipboard-read')`
 *     is Chromium-only, and Firefox and WebKit reject those permission names.
 *   - A synthetic `ClipboardEvent` is untrusted, so the browser performs no
 *     default insertion at all; the test would be asserting on its own code,
 *     and the app has no `onpaste` handler for it to reach anyway.
 *
 * `insertText` goes through the driver's input domain and produces one `input`
 * event, no key events, and no `change` until blur — the observable shape of a
 * paste, in every engine.
 */

/**
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} locator
 * @param {string} value
 */
export async function pasteInto(page, locator, value) {
  await locator.click();
  // insertText inserts at the caret rather than replacing, so the existing
  // contents have to go first.
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(value);
}
