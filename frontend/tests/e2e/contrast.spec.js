/**
 * Contrast, measured on the rendered page rather than argued from the palette.
 *
 * `paletteRules.test.js` asserts the *choices* -- which variable a bar is drawn
 * in, that a footer wraps -- and runs anywhere. It cannot measure anything: the
 * values are custom properties that only a browser resolves, and they resolve
 * differently per theme. So the numbers live here.
 *
 * The bug this exists for: the winning row was filled with `--bulma-primary` and
 * the bar inside it drawn in `--bulma-primary`. Contrast 1.00 -- the filled part
 * of the bar was invisible, and the row with the most votes rendered the
 * emptiest-looking bar. Nothing about that diff looked wrong; both classes were
 * individually correct.
 *
 * Thresholds are WCAG's: 4.5:1 for body text (1.4.3), 3:1 for a graphical object
 * that carries meaning (1.4.11). A progress bar showing a vote count is squarely
 * the latter -- it *is* the result, not decoration.
 *
 * Both themes, always. Every color here is theme-derived, so a value that
 * passes in light says nothing about dark, and the explicit `[data-theme]` pins
 * are what a reader who has chosen gets.
 *
 * NOTE: never executed -- Playwright does not run on the machine this was
 * written on. CI is its first run.
 */
import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers.js';

const TEXT = 4.5;
const OBJECT = 3;

const HELPERS = `
  window.__c = {
    rgb(v) {
      const m = /rgba?\\(([^)]+)\\)/.exec(v || '');
      if (!m) return null;
      const p = m[1].split(',').map(parseFloat);
      return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] };
    },
    lum({ r, g, b }) {
      const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    },
    over(fg, bg) {
      if (fg.a >= 0.999) return fg;
      return { r: fg.a * fg.r + (1 - fg.a) * bg.r,
               g: fg.a * fg.g + (1 - fg.a) * bg.g,
               b: fg.a * fg.b + (1 - fg.a) * bg.b, a: 1 };
    },
    ratio(a, b) {
      const [x, y] = [this.lum(a), this.lum(b)];
      const [hi, lo] = x > y ? [x, y] : [y, x];
      return (hi + 0.05) / (lo + 0.05);
    },
    /** Nearest opaque ancestor background. */
    behind(el) {
      let n = el;
      while (n && n !== document.documentElement) {
        const c = this.rgb(getComputedStyle(n).backgroundColor);
        if (c && c.a > 0.99) return c;
        n = n.parentElement;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    },
  };
`;

for (const theme of ['light', 'dark']) {
  test(`poll results stay legible in the ${theme} theme`, async ({ page }) => {
    await page.addInitScript(HELPERS);
    // The tutorial's practice poll carries a tally and a response, so the
    // results panel renders without seeding a server or answering anything.
    await page.goto('/?tutorial=voter');
    await waitForApp(page);
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);

    const panel = page.getByTestId('poll-results');
    await expect(panel).toBeVisible();

    const readings = await panel.evaluate((root) => {
      const c = window.__c;
      const out = [];
      for (const bar of root.querySelectorAll('progress')) {
        const style = getComputedStyle(bar);
        // The two colors a progress element paints, exposed as the custom
        // properties Bulma drives it with -- reading ::-webkit-progress-value
        // is not portable, and these are what the stylesheet actually sets.
        const fill = c.rgb(style.getPropertyValue('--bulma-progress-value-background-color').trim());
        const track = c.rgb(style.getPropertyValue('--bulma-progress-bar-background-color').trim());
        const row = c.behind(bar);
        if (!fill || !track) continue;
        out.push({
          fillVsTrack: c.ratio(c.over(fill, row), c.over(track, row)),
          fillVsRow: c.ratio(c.over(fill, row), row),
          winner: Boolean(bar.closest('tr')?.className.includes('is-winner')),
        });
      }
      const cell = root.querySelector('td');
      const text = cell
        ? c.ratio(c.rgb(getComputedStyle(cell).color), c.behind(cell))
        : null;
      return { bars: out, text };
    });

    expect(readings.bars.length).toBeGreaterThan(1);

    const problems = [];
    readings.bars.forEach((b, i) => {
      const who = b.winner ? `winning row (bar ${i})` : `bar ${i}`;
      // How full the bar is -- the thing the reader is actually decoding.
      if (b.fillVsTrack < OBJECT) {
        problems.push(`${who}: fill vs track ${b.fillVsTrack.toFixed(2)} < ${OBJECT}`);
      }
      // And that the bar is visible against whatever the row is painted.
      // This is the one that was 1.00.
      if (b.fillVsRow < OBJECT) {
        problems.push(`${who}: fill vs row background ${b.fillVsRow.toFixed(2)} < ${OBJECT}`);
      }
    });
    if (readings.text !== null && readings.text < TEXT) {
      problems.push(`row text ${readings.text.toFixed(2)} < ${TEXT}`);
    }

    expect(problems, `\n  - ${problems.join('\n  - ')}\n`).toEqual([]);
  });
}

/**
 * The winner has to be identifiable with the color thrown away.
 *
 * Weight and a rule both survive grayscale; a fill does not, and neither does it
 * reach anybody using a screen reader. The text marker is the part that covers
 * both, which is why it is asserted separately from the styling.
 */
test('the winning row is marked by more than color', async ({ page }) => {
  await page.goto('/?tutorial=voter');
  await waitForApp(page);

  const winner = page.locator('[data-testid="poll-results"] tr.is-winner').first();
  await expect(winner).toBeVisible();

  const marks = await winner.evaluate((tr) => {
    const first = tr.querySelector('td');
    return {
      weight: parseInt(getComputedStyle(first).fontWeight, 10),
      rule: getComputedStyle(first).boxShadow !== 'none',
      saidInText: /most votes/i.test(tr.textContent || ''),
    };
  });

  expect(marks.weight, 'the winning row is not emphasized').toBeGreaterThanOrEqual(600);
  expect(marks.rule, 'the winning row has no rule down its edge').toBe(true);
  expect(marks.saidInText, 'the winning row is never named in text').toBe(true);
});
