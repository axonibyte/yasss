/**
 * The navbar's two new controls: the theme toggle and the mobile menu.
 *
 * Both are chrome rather than product, which is exactly why they are worth
 * testing — nothing else in the suite would notice if either stopped working,
 * because no other test needs them to do anything.
 */
import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers.js';

const PHONE = { width: 412, height: 800 };

/** What `<html data-theme>` currently says; null when following the system. */
const pinned = (page) => page.evaluate(
  () => document.documentElement.getAttribute('data-theme'),
);

test.describe('the theme toggle', () => {
  test('cycles system, light, dark and back', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    const toggle = page.getByTestId('theme-toggle');

    // Nothing pinned to begin with: a first-time visitor gets whatever their
    // OS asked for, which is the whole reason there are three states and not
    // two.
    expect(await pinned(page)).toBeNull();

    await toggle.click();
    expect(await pinned(page)).toBe('light');
    await toggle.click();
    expect(await pinned(page)).toBe('dark');
    await toggle.click();
    expect(await pinned(page)).toBeNull();
  });

  test('survives a reload, and going back to system forgets', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    const toggle = page.getByTestId('theme-toggle');

    await toggle.click();
    await toggle.click();
    expect(await pinned(page)).toBe('dark');

    await page.reload();
    await waitForApp(page);
    expect(await pinned(page)).toBe('dark');

    // Back round to system. Stored as an absence, so this visitor becomes
    // indistinguishable from one who never chose.
    await page.getByTestId('theme-toggle').click();
    expect(await pinned(page)).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBeNull();
  });

  test('names the setting, and shows what is actually rendered', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    const toggle = page.getByTestId('theme-toggle');

    // The accessible name carries the setting, because that is what pressing
    // the button changes.
    await expect(toggle).toHaveAccessibleName(/Match system/);
    await toggle.click();
    await expect(toggle).toHaveAccessibleName(/Light/);
    await toggle.click();
    await expect(toggle).toHaveAccessibleName(/Dark/);
  });

  test('wears the navbar\'s color, not the link blue', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);

    // `is-ghost` takes its color from `--bulma-button-ghost-color`, which
    // resolves to Bulma's link hue -- so the toggle arrived as the one blue
    // thing on the bar. The first fix declared `color` on `.theme-toggle` and
    // lost silently to `.button.is-ghost` on specificity, which is why this
    // compares against a neighbour rather than asserting a literal: a hex here
    // would have passed for the wrong reason in one theme and failed in the
    // other.
    const colorOf = (selector) => page.locator(selector)
      .evaluate((el) => getComputedStyle(el).color);

    for (const theme of ['system', 'light', 'dark']) {
      if (theme !== 'system') await page.getByTestId('theme-toggle').click();

      // Retried rather than read once after a sleep. Three things move
      // underneath this and each produced a wrong answer while it was being
      // written: the pointer resting on the button reports the hover color, a
      // read in the same tick as a theme change reports the previous one, and
      // Bulma transitions `color`, so an immediate read lands mid-fade —
      // rgb(62,71,84) on its way to rgb(64,70,84), which is a failure that
      // looks like a real mismatch and is not.
      //
      // `toPass` waits for the truth to settle without asserting how long that
      // takes, and still fails if the two genuinely differ.
      await expect(async () => {
        await page.mouse.move(0, 400);
        expect(
          await colorOf('.theme-toggle'),
          `the toggle does not match its neighbours in ${theme}`,
        ).toBe(await colorOf('.navbar-item[href="#create-event"]'));
      }).toPass({ timeout: 5000 });
    }
  });

  test('actually repaints the page, not just the attribute', async ({ page }) => {
    // The attribute is the mechanism; this is the thing the reader sees. Without
    // the [data-theme] blocks in app.scss the attribute would be set and nothing
    // would change, which every assertion above would happily pass.
    await page.goto('/');
    await waitForApp(page);
    // `html`, not `body`. Bulma paints the scheme background on the root element
    // and leaves body transparent, so reading body here returns rgba(0,0,0,0)
    // in every theme and the assertion passes whatever happens.
    const bg = () => page.evaluate(
      () => getComputedStyle(document.documentElement).backgroundColor,
    );

    await page.getByTestId('theme-toggle').click();   // light
    const light = await bg();
    await page.getByTestId('theme-toggle').click();   // dark
    const dark = await bg();
    expect(light).toBe('rgb(255, 255, 255)');
    expect(dark).not.toBe(light);
  });
});

test.describe('the mobile menu', () => {
  test.use({ viewport: PHONE });

  test('hides the items behind a burger, and opens on press', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);

    const burger = page.getByTestId('navbar-burger');
    const create = page.getByRole('link', { name: 'Create Event' });

    await expect(burger).toBeVisible();
    await expect(create).toBeHidden();
    await expect(burger).toHaveAttribute('aria-expanded', 'false');

    await burger.click();
    await expect(create).toBeVisible();
    await expect(burger).toHaveAttribute('aria-expanded', 'true');
  });

  test('closes itself once an item is chosen', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);

    await page.getByTestId('navbar-burger').click();
    await page.getByRole('link', { name: 'Log In' }).click();

    // The menu covers the page on a phone, so leaving it open over the modal it
    // just opened would hide the thing the visitor asked for.
    await expect(page.locator('.modal.is-active')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create Event' })).toBeHidden();
  });

  test('is a button, not a link pretending to be one', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    // Bulma's own markup is `<a role="button">` with no href, which is not a tab
    // stop and so cannot be reached by keyboard at all.
    const burger = page.getByTestId('navbar-burger');
    await expect(burger).toHaveRole('button');
    await burger.focus();
    await expect(burger).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('link', { name: 'Create Event' })).toBeVisible();
  });
});

test.describe('on a wide screen', () => {
  test('there is no burger and the items are simply there', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await expect(page.getByTestId('navbar-burger')).toBeHidden();
    await expect(page.getByRole('link', { name: 'Create Event' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Tutorial' })).toBeVisible();
  });
});

/**
 * Nothing on the page is Bulma's link blue.
 *
 * Written as a sweep rather than as three assertions about the burger, the
 * toggle and the wordmark, because those three were found one at a time: fixing
 * the toggle revealed the burger's bars, fixing the bars revealed a 10% blue
 * hover wash underneath them. Each was invisible until the one in front of it
 * was gone. A rule states the thing that was actually wanted -- no link blue
 * anywhere -- and finds the next one without being told where to look.
 *
 * The test is "the blue channel dominates both others by a wide margin", which
 * is deliberately crude: Bulma's link is rgb(66,88,255) and scores 167, while
 * the scheme's grey text rgb(64,70,84) scores 14. A palette that one day
 * genuinely wants a blue will fail this and should, with a person deciding.
 */
const blueHunt = () => {
  const out = [];
  for (const el of document.querySelectorAll('*')) {
    if (!el.offsetParent && el.tagName !== 'BODY') continue;
    for (const prop of ['color', 'backgroundColor', 'borderTopColor', 'fill']) {
      const raw = getComputedStyle(el)[prop] || '';
      const m = /rgba?\((\d+), ?(\d+), ?(\d+)(?:, ?([\d.]+))?/.exec(raw);
      if (!m) continue;
      if (m[4] !== undefined && Number(m[4]) === 0) continue;
      const [r, g, b] = [+m[1], +m[2], +m[3]];
      if (b - Math.max(r, g) > 60) {
        const cls = String(el.className || '').split(' ').filter(Boolean)[0] || '';
        out.push(el.tagName.toLowerCase() + (cls ? '.' + cls : '') + ' ' + prop + '=' + raw);
      }
    }
  }
  return out.filter((v, i, a) => a.indexOf(v) === i);
};

test.describe('the palette', () => {
  for (const [width, where] of [[1280, 'desktop'], [412, 'phone']]) {
    for (const theme of ['light', 'dark']) {
      test(`has no link blue on ${where} in ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.goto('/');
        await waitForApp(page);
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);

        if (width === 412) {
          // Open *and* hovered: the burger's blue wash lives on :hover, so a
          // sweep of the resting state walked straight past it.
          await page.getByTestId('navbar-burger').click();
          await page.getByTestId('navbar-burger').hover();
        }

        await expect(async () => {
          const found = await page.evaluate(blueHunt);
          expect(found, `link blue is still being painted: ${found.join(', ')}`).toEqual([]);
        }).toPass({ timeout: 5000 });
      });
    }
  }
});

test.describe('the wordmark', () => {
  test('is lighter than body text, and left to axe for contrast', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);

    const brand = await page.locator('.navbar-brand strong')
      .evaluate((el) => getComputedStyle(el).color);

    // Only that it moved, and which way. An earlier version of this test
    // computed the contrast ratio here against `.navbar`'s background and
    // passed at 4.88:1 while axe failed the same element at 4.34:1 -- axe
    // resolves the *effective* background an element sits on, and this test was
    // guessing white. Re-implementing that resolution badly is worse than not
    // having it: the axe pass in a11y.spec.js is the arbiter, and this only
    // pins the intent that the wordmark is not the body-text primary.
    const l = (c) => c.match(/\d+/g).slice(0, 3).map(Number).reduce((a, b) => a + b, 0);
    expect(l(brand), 'the wordmark is no lighter than the old muddy green')
      .toBeGreaterThan(l('rgb(0, 107, 91)'));
  });
});
