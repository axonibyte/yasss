/**
 * Input fuzzing for the volunteer-facing surfaces, against the real stack.
 *
 * These are the pages an anonymous stranger reaches from a shared link, which
 * makes them the ones where a thrown error is least excusable and least likely
 * to be reported. They are also where the client and server patterns have to
 * agree exactly: the detail-type regexes here are anchored mirrors of
 * `model/Detail.java`, so anything the client waves through must survive the
 * insert — and the volunteer endpoint is the one that answers 500, not 400,
 * when it does not.
 *
 * Custom fields are configured in CREATE mode and then exercised against a
 * published event, because a volunteer's answers only ever go over the wire.
 */
import {
  addActivity, addDetail, addWindow, classifySave, clearToasts, closeModal,
  expect, MODAL, publish, publishMinimalEvent, ready, runCase, setSwitch,
  signInAsAdmin, startWizard, test, typeInto, uniqueTitle, visitEvent,
} from './helpers/harness.js';
import {
  DETAIL_ANSWERS, OPTIONAL_TEXT, REMINDER_EMAILS, REQUIRED_TEXT,
} from './helpers/corpus.js';
import { SUBMIT_RSVPS } from '../shared/labels.js';

/** The volunteer picker's "Add Volunteer" button. */
const addVolunteer = (page) => page.getByRole('button', { name: 'Add Volunteer' }).click();

/**
 * Open the add-volunteer form on a published event.
 *
 * The guest prompt fires once, for the first volunteer only, so it is checked
 * for rather than assumed.
 */
async function openVolunteerForm(page) {
  await addVolunteer(page);
  const proceed = page.getByRole('button', { name: "No thanks, I'm good!" });
  if (await proceed.count()) await proceed.click();
  await expect(page.locator(MODAL)).toHaveCount(1);
}

// --- custom fields ---------------------------------------------------------

test.describe('custom fields', () => {
  test('the label takes every shape of text, or says why not', async ({ page }) => {
    await startWizard(page);

    for (const c of REQUIRED_TEXT) {
      const verdict = await runCase(page, {
        open: async () => {
          await page.getByRole('button', { name: 'Add a Field' }).click();
          await page.locator('#detail-type').selectOption('STRING');
        },
        fill: () => typeInto(page.locator('#detail-label'), c.value),
        save: 'Save Detail',
      });

      expect(verdict.outcome, `detail label ${c.name}: ${verdict.message}`).toBe(c.expect);
      if (c.expect === 'rejected') {
        expect(verdict.message, `detail label ${c.name} refused silently`).not.toBe('');
      }
    }
  });

  test('the hint is optional but still bounded', async ({ page }) => {
    await startWizard(page);

    for (const c of OPTIONAL_TEXT) {
      const verdict = await runCase(page, {
        open: async () => {
          await page.getByRole('button', { name: 'Add a Field' }).click();
          await page.locator('#detail-type').selectOption('STRING');
          await page.locator('#detail-label').fill(`hint ${c.name}`);
        },
        fill: () => typeInto(page.locator('#detail-hint'), c.value),
        save: 'Save Detail',
      });
      expect(verdict.outcome, `detail hint ${c.name}: ${verdict.message}`).toBe(c.expect);
    }
  });

  test('a type has to be chosen', async ({ page }) => {
    await startWizard(page);
    await page.getByRole('button', { name: 'Add a Field' }).click();
    await page.locator('#detail-label').fill('No type picked');

    const verdict = await classifySave(page, 'Save Detail');
    expect(verdict.outcome, verdict.message).toBe('rejected');
    expect(verdict.message).toContain('detail type');
    await closeModal(page);
  });

  test('every type can be created and reordered', async ({ page }) => {
    await startWizard(page);
    for (const type of ['STRING', 'INTEGER', 'EMAIL', 'PHONE', 'BOOLEAN']) {
      await addDetail(page, { type, label: `Field ${type}`, required: type === 'BOOLEAN' });
    }

    const rows = page.locator('#view-event-details tbody tr');
    // Five fields plus the header row.
    await expect(rows).toHaveCount(6);

    // Walk the last field to the top, which exercises the renumbering that
    // reconciles array position with the server's priority.
    for (let i = 0; i < 4; i += 1) {
      await page.getByRole('button', { name: 'Move Field BOOLEAN up' }).click();
    }
    await expect(rows.nth(1)).toContainText('Field BOOLEAN');
    await expect(page.getByRole('button', { name: 'Move Field BOOLEAN up' })).toBeDisabled();
  });
});

// --- volunteers ------------------------------------------------------------

test.describe('volunteers', () => {
  test('the name takes every shape of text, or says why not', async ({ page }) => {
    await publishMinimalEvent(page, 'VolName');

    for (const c of REQUIRED_TEXT) {
      const verdict = await runCase(page, {
        open: () => openVolunteerForm(page),
        fill: () => typeInto(page.locator('#vol-name'), c.value),
        save: 'Save Volunteer',
      });

      expect(verdict.outcome, `volunteer name ${c.name}: ${verdict.message}`).toBe(c.expect);
      if (c.expect === 'rejected') {
        expect(verdict.message, `volunteer name ${c.name} refused silently`).not.toBe('');
      }
      // Accepted volunteers are local until submit; drop them so the picker
      // does not fill up and the guest prompt logic stays predictable.
      if (verdict.outcome === 'accepted') {
        await page.getByRole('button', { name: 'Update Volunteer' }).click();
        const removed = await classifySave(page, 'Remove Volunteer');
        expect(removed.outcome, removed.message).toBe('accepted');
        await clearToasts(page);
      }
    }
  });

  test.describe('answers to custom fields', () => {
    test.describe.configure({ timeout: 180_000 });

    for (const [type, cases] of Object.entries(DETAIL_ANSWERS)) {
      // BOOLEAN is a switch, not a text box; it gets its own test below.
      if (type === 'BOOLEAN') continue;

      test(`a required ${type} field accepts only what the server will`, async ({ page }) => {
        await startWizard(page, uniqueTitle(`Ans${type}`));
        await addActivity(page, 'Setup');
        await addWindow(page);
        await addDetail(page, { type, label: `Answer ${type}`, required: true });

        // Multi-user signups, or the server allows this browser exactly one
        // volunteer and "Add Volunteer" vanishes after the first submit --
        // leaving every case after the first with nowhere to type.
        await page.getByRole('button', { name: 'Edit Summary' }).click();
        await setSwitch(page, 'event-multiuser', true);
        expect((await classifySave(page, 'Save')).outcome).toBe('accepted');
        await publish(page);

        const field = page.locator('input[id^="vol-detail-"]').first();

        for (const c of cases) {
          const verdict = await runCase(page, {
            open: () => openVolunteerForm(page),
            fill: async () => {
              await page.locator('#vol-name').fill(`Ada ${c.name}`);
              await typeInto(field, c.typed);
            },
            save: 'Save Volunteer',
          });

          expect(verdict.outcome, `${type} ${c.name} (${JSON.stringify(String(c.typed).slice(0, 40))}): ${verdict.message}`)
            .toBe(c.expect);

          if (verdict.outcome === 'accepted') {
            // Submitting is the only thing that proves the server agrees: the
            // client's pattern is a mirror of the server's, and a mirror can be
            // wrong in either direction.
            await page.getByRole('button', { name: SUBMIT_RSVPS }).click();
            await expect(
              page.getByText('RSVP successfully submitted!'),
              `${type} ${c.name} passed the client and failed the server`,
            ).toBeVisible({ timeout: 20_000 });
            await clearToasts(page);
          }
        }
      });
    }

    test('a required checkbox has to be ticked', async ({ page }) => {
      await startWizard(page, uniqueTitle('AnsBool'));
      await addActivity(page, 'Setup');
      await addWindow(page);
      await addDetail(page, { type: 'BOOLEAN', label: 'Agree', required: true });
      await publish(page);

      await openVolunteerForm(page);
      await page.locator('#vol-name').fill('Ada');
      const unticked = await classifySave(page, 'Save Volunteer');
      expect(unticked.outcome, unticked.message).toBe('rejected');

      const box = page.locator('input[id^="vol-detail-"]').first();
      await page.locator(`label[for="${await box.getAttribute('id')}"]`).click();
      const ticked = await classifySave(page, 'Save Volunteer');
      expect(ticked.outcome, ticked.message).toBe('accepted');
    });

    test('an optional checkbox records a deliberate no', async ({ page }) => {
      // As the owner, because a volunteer is disclosed on read only to their
      // own account or to the event's organiser -- an anonymous signup is
      // invisible even to the browser that made it, so there would be nothing
      // to read back.
      await page.goto('/');
      await ready(page);
      await signInAsAdmin(page);

      await startWizard(page, uniqueTitle('AnsBoolOpt'));
      await addActivity(page, 'Setup');
      await addWindow(page);
      await addDetail(page, { type: 'BOOLEAN', label: 'Bring a dish', required: false });
      const eventId = await publish(page);

      await openVolunteerForm(page);
      await page.locator('#vol-name').fill('Grace');
      expect((await classifySave(page, 'Save Volunteer')).outcome).toBe('accepted');
      await page.getByRole('button', { name: SUBMIT_RSVPS }).click();
      await expect(page.getByText('RSVP successfully submitted!')).toBeVisible({
        timeout: 20_000,
      });

      // "Not ticked" is an answer, not an absent one -- it has to come back.
      await visitEvent(page, eventId);
      await page.getByRole('button', { name: 'Update Volunteer' }).click();
      await expect(page.locator('input[id^="vol-detail-"]').first()).not.toBeChecked();
    });
  });

  test('reminder opt-in needs an address the server will take', async ({ page }) => {
    await publishMinimalEvent(page, 'Reminders');

    for (const c of REMINDER_EMAILS) {
      const verdict = await runCase(page, {
        open: async () => {
          await openVolunteerForm(page);
          await page.locator('#vol-name').fill('Ada');
          await setSwitch(page, 'vol-reminders', true);
        },
        fill: () => typeInto(page.locator('#vol-reminder-email'), c.typed),
        save: 'Save Volunteer',
      });

      expect(verdict.outcome, `reminder email ${c.name} (${c.typed}): ${verdict.message}`)
        .toBe(c.expect);

      if (verdict.outcome === 'accepted') {
        await page.getByRole('button', { name: 'Update Volunteer' }).click();
        expect((await classifySave(page, 'Remove Volunteer')).outcome).toBe('accepted');
        await clearToasts(page);
      }
    }
  });

  test('an internationalised address is normalised by the browser', async ({ page }) => {
    await publishMinimalEvent(page, 'Idn');
    await openVolunteerForm(page);
    await page.locator('#vol-name').fill('Ada');
    await setSwitch(page, 'vol-reminders', true);
    await typeInto(page.locator('#vol-reminder-email'), 'v@exämple.com');

    // Worth pinning: the anchored pattern is ASCII-only and would refuse this,
    // but `input[type=email]` punycodes it first, so the validator never sees
    // the unicode. If a future input type stops doing that, this flips and the
    // pattern becomes a trap for anyone with a non-ASCII domain.
    await expect(page.locator('#vol-reminder-email')).toHaveValue('v@xn--exmple-cua.com');
    expect((await classifySave(page, 'Save Volunteer')).outcome).toBe('accepted');
  });
});

// --- RSVPs -----------------------------------------------------------------

test.describe('RSVPs', () => {
  test('a slot can be claimed and released repeatedly', async ({ page }) => {
    await publishMinimalEvent(page, 'Rsvp');
    await openVolunteerForm(page);
    await page.locator('#vol-name').fill('Ada');
    expect((await classifySave(page, 'Save Volunteer')).outcome).toBe('accepted');

    // The cell always exists; the button inside it only while the cell is
    // actually actionable, so assertions read the cell and clicks use the
    // button.
    const cell = page.locator('#view-event-table .grid > *').last();
    const button = cell.locator('button');

    for (let i = 0; i < 5; i += 1) {
      await button.click();
      await expect(cell).toContainText('Booked');
      await button.click();
      await expect(cell).toContainText('Available');
    }
  });

  test('a claimed slot survives being submitted and reloaded', async ({ page }) => {
    // Signed in, because the reload has to see the volunteer to see their
    // claim, and only the organiser or the volunteer's own account is told
    // about them.
    await page.goto('/');
    await ready(page);
    await signInAsAdmin(page);
    const { id } = await publishMinimalEvent(page, 'RsvpPersist');
    await openVolunteerForm(page);
    await page.locator('#vol-name').fill('Grace Hopper');
    expect((await classifySave(page, 'Save Volunteer')).outcome).toBe('accepted');

    const cell = page.locator('#view-event-table .grid > *').last();
    await cell.locator('button').click();
    await expect(cell).toContainText('Booked');

    await page.getByRole('button', { name: SUBMIT_RSVPS }).click();
    await expect(page.getByText('RSVP successfully submitted!')).toBeVisible({
      timeout: 20_000,
    });

    await visitEvent(page, id);
    await expect(page.locator('#view-event-table .grid > *').last())
      .toContainText('Booked');
  });

  test('a full slot cannot be claimed by the next volunteer', async ({ page }) => {
    // Cap of one, so the second volunteer meets a wall rather than a 400.
    await startWizard(page, uniqueTitle('Capped'));
    await page.getByRole('button', { name: 'Add an Activity' }).click();
    await page.locator('#activity-label').fill('Setup');
    await setSwitch(page, 'activity-slot-cap-unlimited', false);
    await typeInto(page.locator('#activity-slot-cap'), '1');
    await page.locator('#activity-slot-cap').blur();
    expect((await classifySave(page, 'Save Activity')).outcome).toBe('accepted');
    await addWindow(page);

    // Multi-user signups, or one browser cannot add a second volunteer at all.
    await page.getByRole('button', { name: 'Edit Summary' }).click();
    await setSwitch(page, 'event-multiuser', true);
    expect((await classifySave(page, 'Save')).outcome).toBe('accepted');
    await publish(page);

    const cell = page.locator('#view-event-table .grid > *').last();
    const button = cell.locator('button');

    await openVolunteerForm(page);
    await page.locator('#vol-name').fill('First');
    expect((await classifySave(page, 'Save Volunteer')).outcome).toBe('accepted');
    await button.click();
    await expect(cell).toContainText('Booked');
    await page.getByRole('button', { name: SUBMIT_RSVPS }).click();
    await expect(page.getByText('RSVP successfully submitted!')).toBeVisible({
      timeout: 20_000,
    });
    await clearToasts(page);

    await openVolunteerForm(page);
    await page.locator('#vol-name').fill('Second');
    expect((await classifySave(page, 'Save Volunteer')).outcome).toBe('accepted');

    // The cell reports the wall rather than letting the click through to a
    // request the server would refuse -- and it stops being a button at all,
    // so there is nothing to click in the first place.
    await expect(cell).toContainText('At Capacity');
    await expect(button).toHaveCount(0);
  });

  test('switching between volunteers keeps each one their own slots', async ({ page }) => {
    await startWizard(page, uniqueTitle('TwoVols'));
    await addActivity(page, 'Setup');
    await addWindow(page);
    await page.getByRole('button', { name: 'Edit Summary' }).click();
    await setSwitch(page, 'event-multiuser', true);
    expect((await classifySave(page, 'Save')).outcome).toBe('accepted');
    await publish(page);

    const cell = page.locator('#view-event-table .grid > *').last();
    const button = cell.locator('button');
    const picker = page.getByLabel('Select a volunteer');

    await openVolunteerForm(page);
    await page.locator('#vol-name').fill('Alice');
    expect((await classifySave(page, 'Save Volunteer')).outcome).toBe('accepted');
    await button.click();
    await expect(cell).toContainText('Booked');

    await openVolunteerForm(page);
    await page.locator('#vol-name').fill('Bob');
    expect((await classifySave(page, 'Save Volunteer')).outcome).toBe('accepted');
    // Bob is selected on add and holds nothing.
    await expect(cell).toContainText('Available');

    await picker.selectOption({ label: 'Alice' });
    await expect(cell).toContainText('Booked');
    await picker.selectOption({ label: 'Bob' });
    await expect(cell).toContainText('Available');
  });

  test('a passer-by is not told who else signed up', async ({ page }) => {
    const { id } = await publishMinimalEvent(page, 'Privacy');
    await openVolunteerForm(page);
    await page.locator('#vol-name').fill('Someone Private');
    expect((await classifySave(page, 'Save Volunteer')).outcome).toBe('accepted');
    await page.getByRole('button', { name: SUBMIT_RSVPS }).click();
    await expect(page.getByText('RSVP successfully submitted!')).toBeVisible({
      timeout: 20_000,
    });

    // A fresh, anonymous visitor gets an empty picker: the read endpoint
    // discloses a volunteer only to their own account or to the organiser.
    await page.context().clearCookies();
    await visitEvent(page, id);
    await expect(page.getByLabel('Select a volunteer')).toBeDisabled();
    await expect(page.getByText('Someone Private')).toHaveCount(0);
  });

  test('an unselectable grid survives being clicked all over', async ({ page }) => {
    // No volunteer selected: every cell click is a no-op, and the legacy
    // indexed its volunteer array with NaN here and threw.
    await publishMinimalEvent(page, 'NoVol');

    const cells = page.locator('#view-event-table .grid > * button');
    const count = await cells.count();
    for (let i = 0; i < count; i += 1) {
      await cells.nth(i).click({ force: true });
    }
    await expect(page.locator('#view-event-table')).toBeVisible();
  });
});
