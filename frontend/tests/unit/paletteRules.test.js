import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The visual rules two CSS fixes established, so they cannot be undone quietly.
 *
 * Both fixes shipped without tests, which is the gap this closes. Neither bug
 * was subtle once measured -- a progress bar drawn in the same colour as the row
 * behind it, contrast 1.00; footer buttons with no wrap running off a phone --
 * but both were invisible in review, because the diff that introduces them looks
 * like ordinary markup. `.is-primary` on a bar inside `.is-selected` is two
 * correct-looking classes.
 *
 * These are structural: they assert the *choice*, not the rendered pixel.
 * Measuring actual contrast needs a browser resolving custom properties per
 * theme, which is `contrast.spec.js`. The split is deliberate -- this half runs
 * everywhere including the machine that cannot run Playwright, and it is the
 * half that would have caught both regressions at the point they were written.
 */

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

const modalFiles = () => readdirSync(resolve(process.cwd(), 'src/components/modals'))
  .filter((f) => f.endsWith('.svelte'))
  .map((f) => [f, read(join('src/components/modals', f))]);

describe('the poll results bar', () => {
  const panel = read('src/components/sections/PollResultsPanel.svelte');

  /**
   * `--bulma-primary` is the brand turquoise at 41% lightness. Against the
   * progress track it measures 1.65:1, under the 3:1 WCAG 1.4.11 asks of a
   * graphical object that carries meaning -- and this bar *is* the result.
   */
  it('draws bars in the page-legible primary, not the raw one', () => {
    expect(panel).toContain('--bulma-progress-value-background-color: var(--bulma-primary-on-scheme)');
    // The class that used to do it. `is-primary` on a progress element resolves
    // the value colour straight back to `--bulma-primary`.
    expect(panel).not.toMatch(/<progress[^>]*\bis-primary\b/);
  });

  /**
   * The regression itself. `.is-selected` fills the row with `--bulma-primary`;
   * a bar inside it drawn in the same variable disappears entirely, so the row
   * with the most votes rendered the emptiest-looking bar.
   */
  it('does not fill the winning row with the colour the bars are drawn in', () => {
    // Class application, not prose: the comment above the fix names the class
    // it replaced, so a bare substring match would pass only while the fix went
    // undocumented -- exactly backwards.
    expect(panel).not.toMatch(/class:is-selected|class="[^"]*is-selected/);
  });

  /**
   * Ties mean "the top row" does not identify the winner, and weight plus a rule
   * says nothing to a screen reader. The marker is the only part that survives
   * both.
   */
  it('names the winner in text, not only in styling', () => {
    expect(panel).toContain('is-sr-only');
    expect(panel).toMatch(/most votes/i);
  });
});

describe('modal footers', () => {
  /**
   * Bulma's `.modal-card-foot` is a bare flex row: no gap, no wrap. `.buttons`
   * is what supplies both, and every modal that predates the poll feature uses
   * it. The three that did not had their controls sitting flush against each
   * other and running off the side of a phone.
   */
  it('wrap their controls, so several fit on a narrow screen', () => {
    const offenders = [];
    for (const [name, src] of modalFiles()) {
      const footer = /\{#snippet footer\(\)\}([\s\S]*?)\{\/snippet\}/.exec(src)?.[1];
      if (!footer) continue;
      const controls = (footer.match(/<button|<LoadingButton/g) ?? []).length;
      if (controls >= 2 && !footer.includes('class="buttons')) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });
});

describe('modal sizing', () => {
  const scss = read('src/app.scss');

  /**
   * `100vh` on a phone is the window with the URL bar retracted, so a card sized
   * to it is taller than the visible viewport and its footer -- where the submit
   * button lives -- sits below the fold. The card does not scroll; only its body
   * does, so there is no way to reach it.
   */
  it('sizes the card to the viewport that is actually visible', () => {
    expect(scss).toContain('100dvh');
    // Behind @supports, so a browser without dvh keeps Bulma's vh rule rather
    // than inheriting no max-height at all -- which would be the worse bug.
    expect(scss).toMatch(/@supports \(max-height: 100dvh\)/);
  });

  /** The backstop for the next footer that forgets `.buttons`. */
  it('lets the footer wrap regardless', () => {
    expect(scss).toMatch(/\.modal-card-foot\s*\{[^}]*flex-wrap:\s*wrap/);
  });
});
