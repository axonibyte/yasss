/**
 * Reading what the stack actually sent.
 *
 * Mailpit stands in for an SMTP server and exposes everything it caught over
 * HTTP, which is the only way to verify the half of a feature that happens
 * after the API has already answered 200 -- verification links, reminder
 * bodies, the organiser's signup alert.
 */
import { sleep } from './check.mjs';

const MAILPIT = process.env.YASSS_MAILPIT ?? 'http://127.0.0.1:8025';

/** Every message mailpit currently holds, newest first. */
export async function inbox() {
  const res = await fetch(`${MAILPIT}/api/v1/messages?limit=200`);
  const { messages = [] } = await res.json();
  return messages;
}

/** The HTML and text parts of one message, concatenated. */
export async function messageBody(id) {
  const res = await fetch(`${MAILPIT}/api/v1/message/${id}`);
  const { HTML = '', Text = '' } = await res.json();
  return HTML + Text;
}

/** Polls the inbox for a message to `address`, up to `timeoutMs`. */
export async function waitForMail(address, { subject, timeoutMs = 20_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = (await inbox()).find(
      (m) => m.To?.some((t) => t.Address === address)
        && (!subject || m.Subject.includes(subject)),
    );
    if (found) return found;
    await sleep(1000);
  }
  return null;
}

/**
 * Pulls `?action=...` query params out of a link in a message body.
 *
 * The `&amp;` unescaping is load-bearing: these links live in an HTML body, so
 * the separators arrive entity-encoded and `URLSearchParams` would otherwise
 * read `amp;token` as a parameter name.
 */
export function linkParams(body, action) {
  const match = body.match(new RegExp(`action=${action}[^"'\\s<>]*`));
  if (!match) return null;
  return Object.fromEntries(new URLSearchParams(match[0].replace(/&amp;/g, '&')));
}
