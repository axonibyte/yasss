/**
 * The tutorial's *structure*, as opposed to its words.
 *
 * `tutorialCopy.test.js` polices what a step says. This polices what a step
 * shows, which is where the reported problems actually were: copy describing
 * "Repeat through the day" and "which days a time applies to" was accurate
 * prose about controls that live inside a dialog the tour never opened, on a
 * surface where the learner could not have opened it themselves. Reading the
 * deck in order, nothing looks wrong. Standing on the step, nothing is there.
 *
 * So the claims here are all of the form "the step puts the thing it names on
 * screen":
 *
 *   - every selector a step anchors is one the app can actually produce;
 *   - a step pointing inside a form opens that form;
 *   - a step pointing at a square the organiser can edit is on a surface where
 *     squares are editable;
 *   - every dialog a step names is one the shell knows how to render.
 *
 * Parsed from source rather than imported, for the reason the sibling suites
 * record: the state module is a runes module and this suite deliberately does
 * not pull in the Svelte compiler for a data check.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const src = readFileSync(resolve(root, 'src/state/tutorial.svelte.js'), 'utf8');
const app = readFileSync(resolve(root, 'src/App.svelte'), 'utf8');

/** Everything the app is built from, for asking whether a hook exists. */
function appText() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (path.includes('lib/tutorial') || path.endsWith('state/tutorial.svelte.js')) continue;
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(svelte|js)$/.test(entry)) out.push(readFileSync(path, 'utf8'));
    }
  };
  walk(resolve(root, 'src'));
  return out.join('\n');
}

/**
 * One property's raw text out of a step block.
 *
 * Reads to the next four-space-indented key rather than to the next comma,
 * because two of these values are written across several lines -- a selector
 * list joined with `+`, and a multi-line modal descriptor.
 */
function propOf(body, key) {
  const marker = `  ${key}: `;
  const at = body.indexOf(marker);
  if (at < 0) return null;
  const rest = body.slice(at + marker.length);
  const end = rest.search(/\n {4}(?:[a-zA-Z_$][\w$]*[:(]|\/\/|\})/);
  return (end === -1 ? rest : rest.slice(0, end)).trim().replace(/,$/, '');
}

const steps = (() => {
  const start = src.indexOf('const STEPS = [');
  const end = src.indexOf('\n];', start);
  return [...src.slice(start, end).matchAll(/\n {2}\{\n([\s\S]*?)\n {2}\},/g)].map((m) => {
    const body = m[1];
    const anchor = propOf(body, 'anchor');
    return {
      id: /id: '([^']+)',/.exec(body)?.[1],
      track: /track: '([^']+)',/.exec(body)?.[1],
      mode: /mode: '(\w+)',/.exec(body)?.[1] ?? 'VIEW',
      stage: /stage: '(\w+)',/.exec(body)?.[1] ?? 'subject',
      // Every quoted fragment of the anchor expression, concatenated the way
      // the source concatenates them.
      anchor: anchor === 'null' || anchor === null
        ? null
        : [...anchor.matchAll(/'([^']*)'/g)].map((q) => q[1]).join(''),
      modal: /modal: \{[\s\S]*?kind: '([^']+)'/.exec(body)?.[1] ?? null,
    };
  });
})();

/** Selectors split on commas, since an anchor may name a set. */
const selectorsOf = (step) => (step.anchor ?? '').split(',').map((s) => s.trim()).filter(Boolean);

describe('the step list parses', () => {
  it('reads every step, with an id and a track', () => {
    expect(steps.length).toBeGreaterThan(40);
    expect(steps.filter((s) => !s.id || !s.track)).toEqual([]);
  });
});

describe('anchors point at something', () => {
  /**
   * The hooks an anchor names -- ids, test ids and field names -- must exist in
   * the app. This is the check that goes stale silently: renaming a testid
   * leaves the tour pointing at nothing, the highlight simply does not appear,
   * and every other test still passes.
   */
  it('names only hooks the app produces', () => {
    const text = appText();
    const missing = [];
    for (const step of steps) {
      for (const selector of selectorsOf(step)) {
        for (const [, name, token] of selector.matchAll(/\[(data-[\w-]+)[\^]?="([^"]*)"\]/g)) {
          // The attribute, and then the value. Both, because a numeric value
          // like `data-row="0"` matches almost any file on its own, so without
          // the name half a typo in the attribute would sail through.
          if (!text.includes(name)) missing.push(`${step.id}: [${name}]`);
          else if (token && !text.includes(token)) missing.push(`${step.id}: ${name}=${token}`);
        }
        for (const [, id] of selector.matchAll(/#([\w-]+)/g)) {
          if (!text.includes(`id="${id}"`)) missing.push(`${step.id}: #${id}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  /**
   * Forms live in dialogs, with exactly one exception. So a step highlighting a
   * form field and *not* opening a dialog is describing something the learner
   * cannot see -- which is the defect this whole rewrite came from.
   */
  it('opens the dialog a form field lives in', () => {
    // The code box on the landing page: the only `Field` in this app that is
    // not inside a modal. Named rather than inferred, so that the next field
    // to escape a dialog has to be justified here.
    const OUTSIDE_A_DIALOG = new Set(['event-code-entry']);

    const orphaned = steps.filter((step) => selectorsOf(step).some((selector) => {
      const field = /\[data-field[\^]?="([^"]*)"\]/.exec(selector)?.[1];
      return field && !OUTSIDE_A_DIALOG.has(field) && !step.modal;
    })).map((s) => s.id);
    expect(orphaned).toEqual([]);
  });

  /**
   * `editing` is the state a square takes only while the grid is being laid
   * out. A step pointing at one from the view surface points at nothing.
   */
  it('points at editable squares only from a building surface', () => {
    const wrong = steps
      .filter((s) => (s.anchor ?? '').includes('data-slot-state="editing"'))
      .filter((s) => s.mode !== 'CREATE' && s.mode !== 'EDIT')
      .map((s) => s.id);
    expect(wrong).toEqual([]);
  });
});

describe('the dialogs steps open', () => {
  it('names only kinds the shell renders', () => {
    const rendered = new Set(
      [...app.matchAll(/modal\?\.kind === '([^']+)'/g)].map((m) => m[1]),
    );
    expect(rendered.size).toBeGreaterThan(5);
    const unknown = [...new Set(steps.map((s) => s.modal).filter(Boolean))]
      .filter((kind) => !rendered.has(kind));
    expect(unknown).toEqual([]);
  });

  /**
   * The shell closes the tour's dialog on any step that names none. A creation
   * track that never closed one would leave a form covering the grid it just
   * changed, which is most of what made the old poll track unreadable.
   */
  it('leaves the page clear for the steps that are about the page', () => {
    const gridSteps = steps.filter(
      (s) => (s.anchor ?? '').includes('-table') || (s.anchor ?? '').includes('-slider'),
    );
    expect(gridSteps.length).toBeGreaterThan(3);
    expect(gridSteps.filter((s) => s.modal).map((s) => s.id)).toEqual([]);
  });
});

describe('the creation tracks build rather than describe', () => {
  const creationTracks = ['organizer', 'poll'];

  it('starts each one on the landing page, at the button', () => {
    for (const track of creationTracks) {
      const opening = steps.filter((s) => s.track === track).slice(0, 2);
      expect(opening.map((s) => s.stage)).toEqual(['home', 'home']);
      // The second step is the one that names the way in.
      expect(opening[1].anchor).toMatch(/nav-create-(event|poll)/);
    }
  });

  it('opens the real forms rather than talking about them', () => {
    for (const track of creationTracks) {
      const withDialogs = steps.filter((s) => s.track === track && s.modal);
      // Settings, and at least one of the things you add to a grid.
      expect(withDialogs.length).toBeGreaterThan(4);
    }
  });

  /**
   * The tour has to end somewhere a visitor could actually be: a published
   * thing, on the surface everybody else will see.
   */
  it('finishes on the published surface', () => {
    for (const track of creationTracks) {
      const track_ = steps.filter((s) => s.track === track);
      const last = track_[track_.length - 1];
      expect(last.mode).toBe('VIEW');
      expect(last.stage).toBe('subject');
      expect(last.modal).toBeNull();
    }
  });
});
