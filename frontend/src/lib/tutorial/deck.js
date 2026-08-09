/**
 * Parse the operator-authored tutorial copy deck.
 *
 * `content/tutorial.md` is a keyed copy deck, not a program. Which steps exist,
 * what they point at and what they do to the practice event are structural and
 * live in `state/tutorial.svelte.js`; this file only carries the words. An
 * operator can rewrite every sentence without a deploy and without being able
 * to break the tour.
 *
 * The directives are HTML comments so that what an operator edits reads as
 * ordinary markdown, and so a deck rendered by anything else still looks like a
 * document:
 *
 *     <!-- step: welcome -->
 *     ## Welcome to Yasss!
 *     Prose...
 *
 * Everything up to the first directive is ignored, which is where a header
 * comment goes. A step id nobody declares is ignored rather than an error --
 * this file outlives any particular step list, and an operator should not have
 * their whole deck rejected because one section refers to a step that was
 * renamed. A step the deck says nothing about keeps its built-in default.
 */

/** `<!-- step: some-id -->`, tolerant of spacing and of `steps:`/`Step:`. */
const STEP_DIRECTIVE = /<!--\s*step\s*:\s*([a-z0-9][a-z0-9-]*)\s*-->/gi;

/**
 * Split a deck into `{id: markdown}`.
 *
 * Never throws. A deck this cannot make sense of yields `{}`, and the caller
 * then shows the built-in copy -- which is the same outcome as no deck at all,
 * and a much better one than a tutorial that renders blank because somebody
 * mistyped a comment.
 *
 * @param {string|null|undefined} src
 * @returns {Record<string, string>}
 */
export function parseDeck(src) {
  const out = {};
  if (typeof src !== 'string' || src.length === 0) return out;

  const matches = [...src.matchAll(STEP_DIRECTIVE)];
  for (let i = 0; i < matches.length; i += 1) {
    const id = matches[i][1].toLowerCase();
    const from = matches[i].index + matches[i][0].length;
    const to = i + 1 < matches.length ? matches[i + 1].index : src.length;
    const body = src.slice(from, to).trim();
    // A directive with nothing under it is a step the operator started and did
    // not write. Falling back is right; storing an empty string is not, because
    // that would render an empty panel and look like a bug in the app.
    if (body) out[id] = body;
  }
  return out;
}

/**
 * The copy for every declared step: the deck where it speaks, the defaults
 * where it does not.
 *
 * Merged per key rather than wholesale. Wholesale would mean a deck that
 * covered nine of twelve steps blanked the other three, which is the failure
 * an operator is least likely to notice and most likely to cause.
 *
 * @param {string[]} stepIds every step the frontend declares
 * @param {Record<string,string>} defaults
 * @param {string|null|undefined} src the deck, or nothing
 */
export function copyFor(stepIds, defaults, src) {
  const deck = parseDeck(src);
  const out = {};
  for (const id of stepIds) out[id] = deck[id] ?? defaults[id] ?? '';
  return out;
}
