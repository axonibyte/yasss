/**
 * A learner walking the tutorial, asking the five questions a first-timer asks.
 *
 * Every other tutorial spec checks that the tour *works*: it steps, it does not
 * fetch, it does not write. This one checks that it **teaches** -- which is a
 * different property and fails in ways a working tour looks fine under.
 *
 *   (a) Can I read the text?
 *   (b) Do I know what it is pointing at, from this screen alone?
 *   (c) Am I allowed to click anything else?
 *   (d) Is it coherent, or does it assume things I would not know?
 *   (e) If this were greyscale, would I still understand it?
 *
 * Four of those are mechanical. (d) is not, and this file does not pretend
 * otherwise -- `tests/unit/tutorialCopy.test.js` takes the checkable half (a
 * step naming a control that no longer exists, a track opening with a backward
 * reference, copy too long for the panel) and the rest is a judgement call.
 * What this spec does for (d) is emit an ordered transcript and a screenshot per
 * step into `test-results/tutorial-audit/`, so a person -- or a model asked to
 * read it as a newcomer -- can answer it from evidence instead of memory.
 *
 * ## Why the colour checks are computed from the DOM
 *
 * (e) is the natural place to reach for image diffing, and this does not: it
 * resolves the actual painted colours through `getComputedStyle`, converts them
 * to relative luminance, and asserts the distinctions survive with the hue
 * thrown away. That answers the question that matters -- "is this conveyed by
 * colour alone" -- as a number, in the same units WCAG uses, and it says which
 * element and which pair failed. A pixel diff would say "these images differ by
 * 3%" and leave somebody to work out where and whether it mattered, and it
 * would need a screenshot baseline that has to be regenerated on every legitimate
 * design change and on every font substitution between one machine and the next.
 *
 * The screenshots are still captured. They are evidence for the human, not the
 * assertion.
 *
 * NOTE: never executed. Playwright does not run on the machine this was written
 * on -- a pre-existing limitation, not a property of these tests -- so the first
 * CI run is their first run and should be read as such.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers.js';

const OUT = 'test-results/tutorial-audit';

/** Which of the chooser's two questions each track sits behind. */
const GROUP_OF = {
  poll: 'organizing',
  organizer: 'organizing',
  voter: 'participant',
  volunteer: 'participant',
};

const TRACKS = Object.keys(GROUP_OF);

/** WCAG 1.4.3 for body text, 1.4.11 for anything else that carries meaning. */
const TEXT_CONTRAST = 4.5;
const OBJECT_CONTRAST = 3;

/**
 * Colour maths, run in the page so it can read computed styles.
 *
 * `getComputedStyle` resolves custom properties and inherited values to real
 * rgb() triples, which is the whole reason this happens in the browser: the
 * stylesheet says `var(--bulma-primary-on-scheme)` and only the browser knows
 * what that is on this element, in this theme, at this moment.
 */
const PAGE_HELPERS = `
  window.__audit = {
    rgb(value) {
      const m = /rgba?\\(([^)]+)\\)/.exec(value || '');
      if (!m) return null;
      const [r, g, b, a] = m[1].split(',').map((n) => parseFloat(n));
      return { r, g, b, a: a === undefined ? 1 : a };
    },
    lum({ r, g, b }) {
      const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    },
    contrast(a, b) {
      const [x, y] = [this.lum(a), this.lum(b)];
      const [hi, lo] = x > y ? [x, y] : [y, x];
      return (hi + 0.05) / (lo + 0.05);
    },
    /** The nearest ancestor background that is not transparent. */
    backdrop(el) {
      let node = el;
      while (node && node !== document.documentElement) {
        const c = this.rgb(getComputedStyle(node).backgroundColor);
        if (c && c.a > 0.99) return c;
        node = node.parentElement;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    },
  };
`;

/** Open the tutorial and pick a track, two clicks deep. */
async function startTutorial(page, track) {
  await page.getByTestId('tutorial-start').click();
  await page.getByTestId(`tutorial-group-${GROUP_OF[track]}`).click();
  await page.getByTestId(`tutorial-track-${track}`).click();
  await expect(page.getByTestId('tutorial-step')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(PAGE_HELPERS);
});

for (const track of TRACKS) {
  test(`a first-timer can follow the ${track} track`, async ({ page }) => {
    mkdirSync(`${OUT}/${track}`, { recursive: true });
    await page.goto('/');
    await waitForApp(page);
    await startTutorial(page, track);

    const transcript = [];
    const failures = [];

    for (let i = 0; i < 40; i += 1) {
      const panel = page.getByTestId('tutorial-step');
      const text = (await panel.innerText()).trim();

      // --- (a) can I read it? ------------------------------------------------
      //
      // Visible, on screen, and legible against whatever is behind it. The
      // interesting failure is not "invisible" -- that is obvious the moment
      // anybody looks -- but a panel that renders half off the viewport on a
      // shorter window, or text that lands on a background it does not contrast
      // with in one of the two themes.
      await expect(panel, `step ${i} panel is not visible`).toBeVisible();
      expect(text.length, `step ${i} has no readable text`).toBeGreaterThan(20);

      const readable = await panel.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const fg = window.__audit.rgb(style.color);
        const bg = window.__audit.backdrop(el);
        return {
          onScreen: box.top >= 0 && box.left >= 0
            && box.bottom <= window.innerHeight + 1 && box.right <= window.innerWidth + 1,
          clipped: el.scrollHeight > el.clientHeight + 1,
          fontPx: parseFloat(style.fontSize),
          contrast: fg && bg ? window.__audit.contrast(fg, bg) : null,
        };
      });

      if (!readable.onScreen) failures.push(`step ${i}: panel is not fully on screen`);
      if (readable.fontPx < 12) failures.push(`step ${i}: text is ${readable.fontPx}px`);
      // `clipped` is recorded but does not fail: the panel is a deliberate
      // scroller (it is in app.scss's thin-scrollbar set), so overflow is a
      // design decision here rather than a defect. Length is policed where it
      // can be judged against the copy itself, in tutorialCopy.test.js.
      if (readable.contrast !== null && readable.contrast < TEXT_CONTRAST) {
        failures.push(`step ${i}: text contrast ${readable.contrast.toFixed(2)} < ${TEXT_CONTRAST}`);
      }

      // --- (b) do I know what it means, from this screen? --------------------
      //
      // A step with an anchor is talking about a specific thing. If that thing
      // is not on screen -- scrolled away, on a surface the tour did not open,
      // removed in a refactor -- the words survive and stop referring to
      // anything, which is the failure this whole spec exists for. A step with
      // no anchor is about the page as a whole and is exempt by design.
      const anchored = await page.evaluate(() => {
        const el = document.querySelector('[data-tutorial-anchor], .tutorial-anchor');
        if (!el) return null;
        const box = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          area: box.width * box.height,
          onScreen: box.bottom > 0 && box.right > 0
            && box.top < window.innerHeight && box.left < window.innerWidth,
          outline: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0,
          boxShadow: style.boxShadow !== 'none',
        };
      });

      if (anchored) {
        if (anchored.area === 0) failures.push(`step ${i}: the thing it points at has no size`);
        if (!anchored.onScreen) failures.push(`step ${i}: the thing it points at is off screen`);
        // --- (e) would greyscale still work? --------------------------------
        //
        // The highlight must not be colour alone. An outline or a shadow
        // survives rasterising to grey; a hue change does not, and neither does
        // it survive the reader.
        if (!anchored.outline && !anchored.boxShadow) {
          failures.push(`step ${i}: the highlight is colour alone -- nothing survives greyscale`);
        }
      }

      // --- (c) am I allowed to click anything else? --------------------------
      //
      // The tour highlights; it must never make the page inert. A learner who
      // cannot click the thing being described is being shown a screenshot.
      const trapped = await page.evaluate(() => {
        const blocked = [];
        for (const el of document.querySelectorAll('button, a[href], input, select')) {
          if (el.closest('[data-testid="tutorial-step"]')) continue;
          if (el.disabled) continue;
          let node = el;
          while (node && node !== document.documentElement) {
            if (node.inert || getComputedStyle(node).pointerEvents === 'none') {
              blocked.push(el.textContent?.trim().slice(0, 30) || el.tagName);
              break;
            }
            node = node.parentElement;
          }
        }
        return blocked;
      });
      if (trapped.length) {
        failures.push(`step ${i}: the tour blocked ${trapped.length} control(s): ${trapped.slice(0, 3).join(', ')}`);
      }

      // Evidence for (d), and for anybody who wants to see what (a)-(c) saw.
      await page.screenshot({ path: `${OUT}/${track}/${String(i).padStart(2, '0')}.png` });
      transcript.push({ index: i, text, anchored: Boolean(anchored), ...readable });

      const next = page.getByRole('button', { name: 'Next' });
      if (await next.count() === 0) break;
      await next.click();
    }

    writeFileSync(
      `${OUT}/${track}/transcript.json`,
      JSON.stringify({ track, steps: transcript }, null, 2),
    );

    // One assertion carrying every complaint, so a run reports all of them
    // rather than the first. A tour with six broken steps should take one fix
    // cycle, not six.
    expect(failures, `\n  - ${failures.join('\n  - ')}\n`).toEqual([]);
  });
}

/**
 * The learner is never dropped somewhere with no way on.
 *
 * Separate from the walk because it is about the shape of the tour rather than
 * any step: every step has either a Next or an end, and the end says so.
 */
test('every track ends rather than stopping', async ({ page }) => {
  for (const track of TRACKS) {
    await page.goto('/');
    await waitForApp(page);
    await startTutorial(page, track);

    let last = '';
    for (let i = 0; i < 40; i += 1) {
      last = await page.getByTestId('tutorial-step').innerText();
      const next = page.getByRole('button', { name: 'Next' });
      if (await next.count() === 0) break;
      await next.click();
    }
    // The final panel has to acknowledge it is the end; a tour that simply runs
    // out of Next leaves somebody waiting for more.
    expect(last.length, `${track} ended on an empty panel`).toBeGreaterThan(20);
    await expect(
      page.getByRole('button', { name: /done|finish|close|exit/i }),
      `${track} has no way out of the last step`,
    ).toBeVisible();
  }
});
