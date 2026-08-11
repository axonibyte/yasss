import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_COPY } from '../../src/lib/tutorial/defaults.js';

/**
 * "Does the tutorial assume things a first-timer would not know?"
 *
 * The judgement half of that question cannot be automated and is not attempted
 * here -- whether a sentence *lands* is for a person, and `tutorial-audit.spec.js`
 * exists to put the transcript and the screenshots in front of one.
 *
 * What is mechanical is the half that goes wrong silently:
 *
 *   - a step that refers backwards to something the learner has not been shown,
 *     which is invisible when you read the deck in order but not when you
 *     arrive at that step first;
 *   - a step naming a button that no longer exists under that name, which is
 *     how a tutorial rots -- the copy is right about a product that changed;
 *   - a step too long to read in the panel it renders into.
 *
 * All three are cheap to check and none of them needs a browser, so they run
 * here rather than in the Playwright battery.
 */

const STEP_SRC = resolve(process.cwd(), 'src/state/tutorial.svelte.js');
const src = readFileSync(STEP_SRC, 'utf8');

/** Steps in declaration order, with their track. */
const steps = [...src.matchAll(/^ {4}id: '([^']+)',\n {4}track: '([^']+)',/gm)]
  .map((m) => ({ id: m[1], track: m[2] }));

const tracks = [...new Set(steps.map((s) => s.track))];

/**
 * Everything the app could render a label from, for checking a named control
 * exists.
 *
 * Not just `src/components`: this codebase deliberately keeps label strings in
 * plain modules where they can be shared and tested without a DOM -- the four
 * square states come from `lib/grid.js` and the five detail types from
 * `lib/validation/detailTypes.js`. Searching only the markup reported those as
 * missing controls, which was the check being wrong rather than the product.
 *
 * `lib/tutorial` is excluded so the copy cannot satisfy the check by quoting
 * itself, which would make it pass for any label at all.
 */
function appText() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (path.includes('lib/tutorial')) continue;
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(svelte|js)$/.test(entry)) out.push(readFileSync(path, 'utf8'));
    }
  };
  walk(resolve(process.cwd(), 'src'));
  return out.join('\n');
}

/**
 * Bold spans that name a control the learner is told to look for. Every one of
 * these must exist verbatim in a component: that is the whole point.
 */
const UI_LABELS = new Set([
  'Add a Field', 'Add a Time', 'Add a Window', 'Add an Activity',
  'Modify Event', 'Publish Event', 'Publish Poll', 'View Report', 'Edit Summary',
  'Answer This Poll', 'All Day', 'Repeat', 'Until', 'Submit',
  'Available', 'Booked', 'Full', 'Unavailable',
  'Activity Volunteer Cap', 'Slot Volunteer Cap Default', 'Reminder lead time',
  'Email Address', 'Phone Number', 'Text', 'True/False', 'Whole Number',
  'Days of the week', 'Specific dates', 'A fixed time zone', 'Wall clock',
]);

/**
 * Bold spans that are emphasis, not labels. Listed rather than inferred so that
 * a new bold span in new copy has to be classified by whoever wrote it, instead
 * of quietly landing in whichever bucket a heuristic guessed.
 */
const PROSE_EMPHASIS = new Set([
  'practice event', 'poll', 'deadline', 'required', 'every', 'time zone',
  'it is trivial to bypass.', 'when should this happen at all?', '(+1d)',
  'anyone with the link, at any time', 'only me',
  'the code goes in the same\nbox on the front page that an event code goes in',
]);

const boldIn = (text) => [...text.matchAll(/\*\*([^*]+)\*\*/g)].map((m) => m[1]);

describe('tutorial copy', () => {
  it('covers every declared step', () => {
    expect(steps.length).toBeGreaterThan(10);
    expect(steps.filter((s) => !(s.id in DEFAULT_COPY)).map((s) => s.id)).toEqual([]);
  });

  it('gives every step a heading and a body', () => {
    const bad = Object.entries(DEFAULT_COPY)
      .filter(([, text]) => !/^##\s+\S/.test(text.trim()) || text.trim().split('\n').length < 3)
      .map(([id]) => id);
    expect(bad).toEqual([]);
  });

  /**
   * The panel is a fixed slab on screen and does not grow. Copy past roughly
   * this length scrolls, and a step whose second half is below a fold nobody
   * notices is a step that was not read.
   */
  it('keeps every step short enough to read without scrolling the panel', () => {
    const tooLong = Object.entries(DEFAULT_COPY)
      .map(([id, text]) => [id, text.replace(/\s+/g, ' ').length])
      .filter(([, len]) => len > 600);
    expect(tooLong).toEqual([]);
  });

  /**
   * The first step of a track is the first thing somebody sees. A backward
   * reference there points at nothing.
   *
   * Checked only on the opening step: mid-track these phrases are legitimate,
   * and banning them outright would push the copy into a stilted register for
   * no reader's benefit.
   */
  it('opens each track without referring to something not yet shown', () => {
    const backward = /\b(as (we|you) (saw|mentioned|did)|earlier|previously|remember|as above|the one you just|we created)\b/i;
    const offenders = tracks
      .map((track) => steps.find((s) => s.track === track))
      .filter((step) => backward.test(DEFAULT_COPY[step.id] ?? ''))
      .map((step) => step.id);
    expect(offenders).toEqual([]);
  });

  /**
   * A tutorial that names a button the product no longer has is worse than no
   * tutorial: it is confidently wrong, and the learner assumes they are the
   * one who cannot find it.
   */
  it('only names controls that exist', () => {
    const app = appText();
    const missing = [...UI_LABELS].filter((label) => !app.includes(label));
    expect(missing).toEqual([]);
  });

  /**
   * Forces a decision. A bold span in new copy is either a control the learner
   * must be able to find -- in which case the check above has to police it --
   * or it is emphasis. Leaving it unclassified is how the first check quietly
   * stops covering anything.
   */
  it('classifies every emphasised span as either a control or prose', () => {
    const seen = new Set(Object.values(DEFAULT_COPY).flatMap(boldIn));
    const unclassified = [...seen].filter(
      (span) => !UI_LABELS.has(span) && !PROSE_EMPHASIS.has(span),
    );
    expect(unclassified).toEqual([]);
    // And nothing listed that no longer appears, which would let a renamed
    // control sit in UI_LABELS being checked against copy that dropped it.
    const stale = [...UI_LABELS, ...PROSE_EMPHASIS].filter((span) => !seen.has(span));
    expect(stale).toEqual([]);
  });
});
