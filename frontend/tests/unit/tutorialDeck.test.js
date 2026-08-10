/**
 * The tutorial copy deck parser.
 *
 * The deck is operator-authored and lives outside the repo, so every failure
 * mode here is somebody editing a file at 6pm on a deployment nobody is
 * watching. The rule the whole module is built around: a deck this cannot make
 * sense of must degrade to the built-in copy, never to a blank panel. A
 * tutorial that ignores the operator's file is a disappointment; one that
 * renders nothing is a bug report.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { copyFor, parseDeck } from '../../src/lib/tutorial/deck.js';
import { DEFAULT_COPY } from '../../src/lib/tutorial/defaults.js';

const DECK = `<!-- yasss:tutorial v1 -->
Preamble, ignored.

<!-- step: welcome -->
## Hello there
Some **words**.

<!-- step: grid -->
## The grid
More words.
`;

describe('parseDeck', () => {
  it('keys each section by its directive', () => {
    expect(Object.keys(parseDeck(DECK))).toEqual(['welcome', 'grid']);
  });

  it('ignores everything before the first directive', () => {
    expect(parseDeck(DECK).welcome).not.toContain('Preamble');
  });

  it('keeps the markdown intact, rather than rendering it', () => {
    expect(parseDeck(DECK).welcome).toBe('## Hello there\nSome **words**.');
  });

  it.each([
    ['<!--step:welcome-->\nx', 'no spaces'],
    ['<!--   step  :  welcome   -->\nx', 'extra spaces'],
    ['<!-- STEP: WELCOME -->\nx', 'shouting'],
  ])('tolerates %s (%s)', (src) => {
    expect(parseDeck(src)).toHaveProperty('welcome');
  });

  it('drops a directive with nothing under it', () => {
    // Not stored as an empty string: that would render an empty panel and read
    // as a broken app rather than as an unwritten step.
    expect(parseDeck('<!-- step: welcome -->\n\n<!-- step: grid -->\nx'))
      .toEqual({ grid: 'x' });
  });

  it.each([
    [null], [undefined], [''], ['no directives at all'], ['<!-- step: -->'],
    ['<!-- notastep: welcome -->\nx'],
  ])('yields nothing rather than throwing for %p', (src) => {
    expect(parseDeck(src)).toEqual({});
  });
});

describe('copyFor', () => {
  const ids = ['welcome', 'grid', 'cells'];

  it('prefers the deck where it speaks', () => {
    expect(copyFor(ids, DEFAULT_COPY, DECK).welcome).toBe('## Hello there\nSome **words**.');
  });

  it('keeps the default for a step the deck says nothing about', () => {
    // The failure an operator is least likely to notice: a deck covering nine
    // steps of twelve must not blank the other three.
    expect(copyFor(ids, DEFAULT_COPY, DECK).cells).toBe(DEFAULT_COPY.cells);
  });

  it('ignores a step id nobody declares', () => {
    const copy = copyFor(ids, DEFAULT_COPY, `${DECK}\n<!-- step: renamed-away -->\nx`);
    expect(Object.keys(copy)).toEqual(ids);
  });

  it('falls back wholesale when there is no deck', () => {
    for (const src of [null, undefined, 'nonsense']) {
      expect(copyFor(ids, DEFAULT_COPY, src))
        .toEqual({ welcome: DEFAULT_COPY.welcome, grid: DEFAULT_COPY.grid, cells: DEFAULT_COPY.cells });
    }
  });

  it('never yields undefined for a declared step', () => {
    // The panel renders whatever this returns; undefined would reach `marked`.
    const copy = copyFor(['not-in-defaults-either'], DEFAULT_COPY, null);
    expect(copy['not-in-defaults-either']).toBe('');
  });
});

describe('the tracks', () => {
  it('offers a track for every one the chooser will render, and vice versa', async () => {
    // The chooser renders from TRACKS, so a track that declared no steps would
    // appear as a button that starts an empty tour. Read from source for the
    // same reason the copy check below does: the state module is a runes module
    // and this suite deliberately does not pull in the Svelte compiler.
    const src = readFileSync(
      resolve(process.cwd(), 'src/state/tutorial.svelte.js'), 'utf8',
    );
    const declared = [...src.matchAll(/^  (\w+): \{ subject: '(?:event|poll)'/gm)].map((m) => m[1]);
    const used = new Set([...src.matchAll(/^    track: '([^']+)',$/gm)].map((m) => m[1]));

    expect(declared.length).toBeGreaterThan(1);
    expect(declared.filter((track) => !used.has(track))).toEqual([]);
    expect([...used].filter((track) => !declared.includes(track))).toEqual([]);
  });
});

describe('the built-in copy', () => {
  it('covers every step the tour declares', () => {
    // Reads the step list out of the source rather than importing it: the state
    // module is a runes module and needs the Svelte compiler, which this suite
    // deliberately does not pull in for a plain data check.
    //
    // cwd rather than import.meta.url, which is not a file URL under jsdom --
    // the same trap creds.test.js records.
    const src = readFileSync(
      resolve(process.cwd(), 'src/state/tutorial.svelte.js'), 'utf8',
    );
    const ids = [...src.matchAll(/^ {4}id: '([^']+)',$/gm)].map((m) => m[1]);

    expect(ids.length).toBeGreaterThan(6);
    expect(ids.filter((id) => !(id in DEFAULT_COPY))).toEqual([]);
    // And nothing orphaned: copy for a step that no longer exists is copy
    // nobody will ever see, and the next person to read it will assume it does.
    expect(Object.keys(DEFAULT_COPY).filter((id) => !ids.includes(id))).toEqual([]);
  });
});
