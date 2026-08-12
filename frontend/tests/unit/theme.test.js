import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Link color, asserted at the source.
 *
 * Bulma's `--bulma-link` is a blue that exists nowhere in this product's
 * palette, and it had been patched three times -- the wordmark, the navbar
 * burger, the theme toggle -- once per place somebody happened to look. Each
 * patch fixed an element and left the rule intact, so the next link-colored
 * thing arrived blue: the ghost buttons, every `<select>` arrow, and every link
 * in operator-authored markdown, which cannot be patched per-element because
 * the markup is not ours.
 *
 * It is fixed once now, in the theme blocks. These tests exist because that fix
 * is invisible: nothing renders differently in a unit test, and the failure mode
 * is a *new* theme block that forgets the include -- which looks completely
 * correct in the diff that adds it, and turns one of the four theme states blue.
 *
 * Read from source rather than from compiled CSS for the reason the tutorial
 * deck checks do the same: the build needs the whole Sass toolchain, and this
 * suite deliberately does not pull it in. That is a real limit -- these prove
 * the declaration is written, not that it wins at runtime. The compiled output
 * was checked by hand when this landed, and the `var()`-at-use-time property
 * that makes it carry is recorded in the stylesheet's own comment.
 */
const scss = () => readFileSync(resolve(process.cwd(), 'src/app.scss'), 'utf8');

describe('link color follows the brand', () => {
  it('is applied in every theme block, not just the default one', () => {
    const src = scss();
    // Each theme state is a block that sets Bulma's variables up; there are four
    // (`:root`, the system-dark media query, and the two explicit `[data-theme]`
    // pins). Every one of them has to re-state the override, because each emits
    // its own full copy of the variables the override is correcting.
    const setups = [...src.matchAll(/@include setup\.setup-theme;/g)].length;
    const applied = [...src.matchAll(/@include link-follows-brand;/g)].length;

    expect(setups).toBeGreaterThan(1);
    expect(applied).toBe(setups);
  });

  it('points link at primary, including the lightness used for text', () => {
    const src = scss();
    const mixin = /@mixin link-follows-brand \{([\s\S]*?)\n\}/.exec(src)?.[1] ?? '';

    expect(mixin).toContain('--bulma-link-h: var(--bulma-primary-h)');
    expect(mixin).toContain('--bulma-link-s: var(--bulma-primary-s)');
    expect(mixin).toContain('--bulma-link-l: var(--bulma-primary-l)');
    // The one that is easy to leave out and hard to notice: this is the
    // lightness a link takes when it is text on the page, so it is the value
    // that has to clear WCAG. Without it Bulma's 58% survives and produces a
    // turquoise that fails the check the wordmark had to pass.
    expect(mixin).toContain('--bulma-link-on-scheme-l: var(--bulma-primary-on-scheme-l)');
    // Baked as a literal upstream, so it does not follow the triplet.
    expect(mixin).toContain('--bulma-link-rgb: var(--bulma-primary-rgb)');
  });

  it('leaves no hard-coded hue in the override', () => {
    // Every value is a reference to primary. A literal here would be a fourth
    // color to keep in step with the palette by hand, which is the habit this
    // whole change exists to break.
    const mixin = /@mixin link-follows-brand \{([\s\S]*?)\n\}/.exec(scss())?.[1] ?? '';
    const values = [...mixin.matchAll(/^\s*--bulma-link-[\w-]+:\s*(.+);$/gm)].map((m) => m[1]);

    expect(values.length).toBeGreaterThan(4);
    expect(values.filter((v) => !v.startsWith('var(--bulma-primary'))).toEqual([]);
  });
});
