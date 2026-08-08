<!-- yasss:tutorial v1 -->

Fixture deck for the e2e stack. **Deliberately not production copy.**

Every step below is worded so that it cannot be mistaken for
`frontend/src/lib/tutorial/defaults.js`. That is the whole point of this file:
the audit asserts the deck's words are on screen *and* the defaults' are not, and
if the two read alike that assertion passes whether or not the app is reading
this file at all. Every line therefore carries the word "fixture", which nothing
in the built-in copy says.

Two other properties are load-bearing and should survive an edit:

  - one step carries a markdown link and a list, so the audit can tell rendered
    markdown from a deck that reached the page as literal `[]()` and `-`;
  - `v-done` is missing on purpose, so the per-step fallback is exercised by the
    same fixture rather than needing a second one.

Everything above the first directive is preamble and is ignored by the parser.

<!-- step: welcome -->
## Fixture: welcome

This is the fixture deck, not the built-in copy. If you are reading this in a
browser, the operator's file reached the page.

<!-- step: grid -->
## Fixture: the grid

Rows are activities, columns are windows. This paragraph exists to be
distinguishable from the default one.

<!-- step: cells -->
## Fixture: the four square states

The list and the link below are what prove markdown was rendered rather than
printed:

- available
- booked
- full
- unavailable

See [the fixture link](https://example.invalid/fixture) for nothing in
particular.

<!-- step: structure -->
## Fixture: changing it afterwards

Modify Event turns the grid into an editor. Fixture wording.

<!-- step: share -->
## Fixture: sharing

A link and a short code. Fixture wording.

<!-- step: as-a-volunteer -->
## Fixture: the volunteer's view

The same grid from the other side. Fixture wording.

<!-- step: v-welcome -->
## Fixture: somebody sent you a link

You are looking at what needs doing. Fixture wording.

<!-- step: v-add -->
## Fixture: add yourself

A name is enough; no account needed. Fixture wording.

<!-- step: v-fields -->
## Fixture: the organiser's questions

Required answers block submission. Fixture wording.

<!-- step: v-claim -->
## Fixture: claim your squares

Click to take one, click again to let it go. Fixture wording.

<!-- step: v-submit -->
## Fixture: send it

Submit is what tells the organiser. Fixture wording.

<!-- step: nonexistent-step -->
## Fixture: a step nobody declares

Present on purpose. The parser keeps it and `copyFor` drops it, which is how an
operator's deck survives a step being renamed instead of being rejected whole.
