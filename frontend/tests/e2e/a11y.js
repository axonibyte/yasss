import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';

/**
 * Scan the page and fail on serious or critical violations.
 *
 * The severity floor is the whole design of this helper, so it is worth saying
 * why. A Bulma application produces dozens of `minor` and `moderate` findings —
 * landmark advice, heading order, decorative contrast — and treating those as
 * failures leaves two options, both bad: fix all of them now, or suppress them
 * one at a time until the suppression list is the test. `serious` and
 * `critical` are the ones that stop somebody using the page, and there are few
 * enough of them to actually fix.
 *
 * Note the split of responsibilities: `withTags` decides which *rules run*,
 * `impact` decides which *findings fail*. Both are needed.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} [options]
 * @param {string} [options.include] restrict the scan to a selector
 * @param {string[]} [options.exclude] selectors to skip
 * @param {string[]} [options.allow] rule ids to tolerate; each needs a comment
 *   at the call site saying why
 */
export async function expectAccessible(page, { include, exclude = [], allow = [] } = {}) {
  let builder = new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);

  // Scanning a modal by its card rather than the whole page: a violation in the
  // page behind it would otherwise fail every modal test at once, and one fix
  // would look like six.
  if (include) builder = builder.include(include);
  for (const selector of exclude) builder = builder.exclude(selector);

  const { violations } = await builder.analyze();

  const failing = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .filter((v) => !allow.includes(v.id))
    .map((v) => `${v.impact} ${v.id}: ${v.help}\n    ${v.nodes.map((n) => n.target.join(' ')).join('\n    ')}`);

  expect(failing, 'axe found serious or critical violations').toEqual([]);
}
