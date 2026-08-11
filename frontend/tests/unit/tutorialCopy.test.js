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
  'Create Event', 'Create Poll',
  'Add a Field', 'Add a Question', 'Add a Time', 'Add a Window', 'Add an Activity',
  'Modify Event', 'Publish Event', 'Publish Poll', 'View Report', 'Share',
  'Save', 'Save Window', 'Start building',
  'Answer This Poll', 'All Day', 'Repeat', 'Until', 'Submit',
  'Available', 'Booked', 'Full', 'Unavailable',
  'Activity Volunteer Cap', 'Slot Volunteer Cap Default', 'Reminder lead time',
  'Enable Slot', 'Slot Volunteer Cap',
  'Email Address', 'Phone Number', 'Text', 'True/False', 'Whole Number',
  'Days of the week', 'Specific dates', 'A fixed time zone', 'Wall clock',
]);

/**
 * Bold spans that are emphasis, not labels. Listed rather than inferred so that
 * a new bold span in new copy has to be classified by whoever wrote it, instead
 * of quietly landing in whichever bucket a heuristic guessed.
 */
const PROSE_EMPHASIS = new Set([
  'practice event', 'poll', 'every',
  'it is trivial to\nbypass.', 'when should this happen at all?', '(+1d)',
  'anyone with the link, at any\ntime', 'only me',
  'the code goes\nin the same box on the front page that an event code goes in',
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

/**
 * Being dropped onto a different surface without being told.
 *
 * A step carries the mode it wants -- VIEW, EDIT, CREATE -- and whether it
 * belongs on the landing page or on the practice model, and the tour applies
 * both before the step runs. So when consecutive steps disagree, the page
 * visibly changes shape between one click of Next and the next, and the copy is
 * the only thing that can account for it.
 *
 * Only *entering* an editor is checked, and only *leaving* the landing page.
 * Coming back to the grid is returning to the surface the track opened on and
 * the one every reader has seen most of; a sentence announcing it would be
 * noise. That asymmetry is the whole rule, and it is why this is not simply
 * "flag every change".
 *
 * This found four real cases on the day it was written, one of them a step that
 * ended the organizer track by jumping back to the create surface to say "that
 * is the tour" -- a sequencing wobble from merging two tracks, invisible in the
 * diff that caused it because no copy changed at all.
 */
describe('surface changes', () => {
  const stepBlocks = () => {
    const start = src.indexOf('const STEPS = [');
    const end = src.indexOf('\n];', start);
    return [...src.slice(start, end).matchAll(/\n {2}\{\n([\s\S]*?)\n {2}\},/g)].map((m) => ({
      id: /id: '([^']+)',/.exec(m[1])?.[1],
      track: /track: '([^']+)',/.exec(m[1])?.[1],
      mode: /mode: '(\w+)',/.exec(m[1])?.[1] ?? 'VIEW',
      stage: /stage: '(\w+)',/.exec(m[1])?.[1] ?? 'subject',
      modal: /modal: \{[\s\S]*?kind: '([^']+)'/.exec(m[1])?.[1] ?? null,
    }));
  };

  // Words that account for the page having changed. Loose on purpose: this is
  // looking for *any* acknowledgement, not a fixed phrase, because the copy
  // should read like prose rather than like it is satisfying a checker.
  const cue = /editor|edit mode|opens?|opened|now (in|editing)|switch|building|create|creating|form|publish|here (is|it)|closed/i;

  it('says so when a step opens an editor', () => {
    const all = stepBlocks();
    expect(all.length).toBeGreaterThan(10);

    const silent = [];
    for (let i = 1; i < all.length; i += 1) {
      const [before, after] = [all[i - 1], all[i]];
      if (before.track !== after.track) continue;
      if (before.mode === after.mode) continue;
      // Returning to VIEW is going back to what they already know.
      if (after.mode === 'VIEW') continue;
      if (!cue.test(DEFAULT_COPY[after.id] ?? '')) {
        silent.push(`${after.track}: ${before.id}(${before.mode}) -> ${after.id}(${after.mode})`);
      }
    }
    expect(silent).toEqual([]);
  });

  /**
   * The larger jolt of the two, and the newer one. A creation track opens on
   * the landing page -- because that is where "Create Poll" is -- and at some
   * point the whole page is replaced by the thing being built. A step that let
   * that happen without a word would read exactly like the steps this rewrite
   * was reported for: correct sentences about a screen that arrived unannounced.
   */
  it('says so when the landing page gives way to what you are building', () => {
    const all = stepBlocks();
    const silent = [];
    for (let i = 1; i < all.length; i += 1) {
      const [before, after] = [all[i - 1], all[i]];
      if (before.track !== after.track) continue;
      if (before.stage !== 'home' || after.stage === 'home') continue;
      if (!cue.test(DEFAULT_COPY[after.id] ?? '')) {
        silent.push(`${after.track}: ${before.id}(home) -> ${after.id}`);
      }
    }
    expect(silent).toEqual([]);
  });

  /**
   * A dialog arriving unannounced.
   *
   * The sharpest version of the same rule, and the one the rewrite is for. A
   * step whose copy points at a control inside a form the reader did not see
   * open reads as a non sequitur -- it was accurate prose about a screen that
   * was not there, which is precisely how the old poll track described
   * "Repeat through the day" and "which days a time applies to".
   *
   * Only the *opening* is checked, and only the first step of a run: once the
   * form is up, the steps that walk its fields are plainly about the thing in
   * front of the reader.
   */
  it('says so when a step opens a dialog', () => {
    const all = stepBlocks();
    const silent = [];
    for (let i = 1; i < all.length; i += 1) {
      const [before, after] = [all[i - 1], all[i]];
      if (before.track !== after.track) continue;
      if (!after.modal || before.modal === after.modal) continue;
      if (!cue.test(DEFAULT_COPY[after.id] ?? '')) {
        silent.push(`${after.track}: ${after.id} opens "${after.modal}" without saying so`);
      }
    }
    expect(silent).toEqual([]);
  });
});
