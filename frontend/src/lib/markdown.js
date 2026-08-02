/**
 * Markdown rendering for the operator-authored texts (call to action, terms,
 * privacy) served from `GET /v1/texts/:id`.
 *
 * Uses `marked` rather than the legacy's showdown, which carries an unfixed
 * ReDoS advisory. The input is operator-authored configuration rather than user
 * content, so the practical risk was nil either way — but the advisory is not
 * worth carrying when a maintained alternative is a drop-in.
 */
import { marked } from 'marked';

marked.setOptions({ gfm: true, breaks: false });

/**
 * @param {string} src markdown source
 * @returns {string} HTML
 */
export const renderMarkdown = (src) => marked.parse(src ?? '');

/**
 * Bulma has no opinion about link color inside `.content`, and the legacy added
 * `has-text-primary` to every anchor after injecting the HTML (app.js:2373).
 * Doing it as a post-parse pass keeps that appearance without a DOM walk in
 * every component that renders markdown.
 */
export function renderMarkdownWithPrimaryLinks(src) {
  const html = renderMarkdown(src);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const a of doc.querySelectorAll('a')) a.classList.add('has-text-primary');
  return doc.body.innerHTML;
}
