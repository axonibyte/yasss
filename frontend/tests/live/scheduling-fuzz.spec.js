/**
 * Input fuzzing for the event-scheduling surfaces, against the real stack.
 *
 * Scheduling is where the edge cases live, because it is the only part of the
 * app where the client holds a whole graph in memory and hands it to the server
 * in one go. A value the client accepts and the server refuses is not a
 * cosmetic problem here — it surfaces at publish time, after the organiser has
 * built the entire event, as a toast with no field attached to it.
 *
 * Most of the fuzzing runs in CREATE mode on purpose. Nothing is persisted
 * until publish, so a case costs a modal open and close rather than a round
 * trip, and the client's own validators are exactly what is under test. The
 * round-trip behaviour gets its own describe block at the bottom, where the
 * server is the thing being asked.
 */
import {
  addActivity, addWindow, classifySave, clearToasts, closeModal, expect, MODAL,
  modalButton, openPicker, publish, runCase, savePicker, clearPicker,
  nudgeTime, ready, setSwitch, signInAsAdmin, startWizard, test, toggleSwitch,
  typeInto, uniqueTitle,
} from './helpers/harness.js';
import {
  CAPS, LEAD_TIMES, OPTIONAL_TEXT, REQUIRED_TEXT, REQUIRED_TEXT_SHORT, SLOT_CAPS,
} from './helpers/corpus.js';

const openSummary = (page) => page.getByRole('button', { name: 'Edit Summary' }).click();

// --- the event summary -----------------------------------------------------

test.describe('event summary', () => {
  test('the title takes every shape of text, or says why not', async ({ page }) => {
    await startWizard(page);

    for (const c of REQUIRED_TEXT) {
      const verdict = await runCase(page, {
        open: () => openSummary(page),
        fill: () => typeInto(page.locator('#event-title'), c.value),
        save: 'Save',
      });

      expect(verdict.outcome, `title ${c.name}: ${verdict.message}`).toBe(c.expect);
      if (c.expect === 'rejected') {
        expect(verdict.message, `title ${c.name} was refused without saying why`).not.toBe('');
      }
      // Restore a usable title so the next case starts from a valid event.
      if (verdict.outcome === 'accepted') {
        await openSummary(page);
        await page.locator('#event-title').fill(uniqueTitle('Fuzz'));
        await modalButton(page, 'Save').click();
        await expect(page.locator(MODAL)).toHaveCount(0);
      }
    }
  });

  test('the description is optional and takes anything', async ({ page }) => {
    await startWizard(page);

    for (const c of OPTIONAL_TEXT) {
      const verdict = await runCase(page, {
        open: () => openSummary(page),
        fill: () => typeInto(page.locator('#event-description'), c.value),
        save: 'Save',
      });
      expect(verdict.outcome, `description ${c.name}: ${verdict.message}`).toBe(c.expect);
    }
  });

  test('the reminder lead time is bounded', async ({ page }) => {
    await startWizard(page);

    for (const c of LEAD_TIMES) {
      const verdict = await runCase(page, {
        open: () => openSummary(page),
        fill: () => typeInto(page.locator('#event-lead-time'), c.typed),
        save: 'Save',
      });
      expect(verdict.outcome, `lead time ${c.name} (${c.typed}): ${verdict.message}`)
        .toBe(c.expect);
    }
  });

  test('the policy switches survive being toggled repeatedly', async ({ page }) => {
    await startWizard(page);

    for (let i = 0; i < 6; i += 1) {
      await openSummary(page);
      await toggleSwitch(page, 'event-notify');
      await toggleSwitch(page, 'event-multiuser');
      const verdict = await classifySave(page, 'Save');
      expect(verdict.outcome, `toggle round ${i}`).toBe('accepted');
    }
  });
});

// --- activities ------------------------------------------------------------

test.describe('activities', () => {
  test('the label takes every shape of text, or says why not', async ({ page }) => {
    await startWizard(page);

    for (const c of REQUIRED_TEXT) {
      const verdict = await runCase(page, {
        open: () => page.getByRole('button', { name: 'Add an Activity' }).click(),
        fill: () => typeInto(page.locator('#activity-label'), c.value),
        save: 'Save Activity',
      });

      expect(verdict.outcome, `activity label ${c.name}: ${verdict.message}`).toBe(c.expect);
      if (c.expect === 'rejected') {
        expect(verdict.message, `activity label ${c.name} refused silently`).not.toBe('');
      }
    }
  });

  test('the description is optional and takes anything', async ({ page }) => {
    await startWizard(page);

    for (const c of OPTIONAL_TEXT) {
      const verdict = await runCase(page, {
        open: () => page.getByRole('button', { name: 'Add an Activity' }).click(),
        fill: async () => {
          await page.locator('#activity-label').fill(`desc ${c.name}`);
          await typeInto(page.locator('#activity-description'), c.value);
        },
        save: 'Save Activity',
      });
      expect(verdict.outcome, `activity description ${c.name}: ${verdict.message}`)
        .toBe(c.expect);
    }
  });

  test('both caps clamp into range as they are typed', async ({ page }) => {
    await startWizard(page);

    for (const field of ['activity-vol-cap', 'activity-slot-cap']) {
      for (const c of CAPS) {
        await page.getByRole('button', { name: 'Add an Activity' }).click();
        await page.locator('#activity-label').fill(`cap ${field} ${c.name}`);

        // Unchecking "unlimited" is what reveals the number input at all.
        await setSwitch(page, `${field}-unlimited`, false);
        await typeInto(page.locator(`#${field}`), c.typed);
        // The box snaps to the clamped value on commit, not mid-keystroke.
        await page.locator(`#${field}`).blur();

        // What the field shows must be what will be saved.
        await expect(
          page.locator(`#${field}`),
          `${field} ${c.name} (typed ${JSON.stringify(c.typed)})`,
        ).toHaveValue(String(c.clamped));

        const verdict = await classifySave(page, 'Save Activity');
        expect(verdict.outcome, `${field} ${c.name}: ${verdict.message}`).toBe('accepted');
        await clearToasts(page);
      }
    }
  });

  test('toggling unlimited back and forth remembers the number', async ({ page }) => {
    await startWizard(page);
    await page.getByRole('button', { name: 'Add an Activity' }).click();
    await page.locator('#activity-label').fill('memory');

    await setSwitch(page, 'activity-vol-cap-unlimited', false);
    await typeInto(page.locator('#activity-vol-cap'), '37');
    await setSwitch(page, 'activity-vol-cap-unlimited', true);
    await expect(page.locator('#activity-vol-cap')).toHaveCount(0);
    await setSwitch(page, 'activity-vol-cap-unlimited', false);
    await expect(page.locator('#activity-vol-cap')).toHaveValue('37');

    expect((await classifySave(page, 'Save Activity')).outcome).toBe('accepted');
  });
});

// --- windows ---------------------------------------------------------------

test.describe('windows', () => {
  test('the default range saves without being touched', async ({ page }) => {
    await startWizard(page);
    // The picker publishes its defaults eagerly; pressing Save immediately is
    // the case that used to ask for a range the field was already showing.
    await page.getByRole('button', { name: 'Add a Window' }).click();
    const verdict = await classifySave(page, 'Save Window');
    expect(verdict.outcome, verdict.message).toBe('accepted');
  });

  test('saving before the picker has finished loading still works', async ({ page }) => {
    await startWizard(page);
    await page.getByRole('button', { name: 'Add a Window' }).click();
    // No wait at all: a megabyte of calendar may still be in flight.
    const verdict = await classifySave(page, 'Save Window');
    expect(verdict.outcome, verdict.message).toBe('accepted');
  });

  test('an emptied range is refused with a reason', async ({ page }) => {
    await startWizard(page);
    await page.getByRole('button', { name: 'Add a Window' }).click();
    await clearPicker(page);

    const verdict = await classifySave(page, 'Save Window');
    expect(verdict.outcome, verdict.message).toBe('rejected');
    expect(verdict.message).toContain('window range');
    await closeModal(page);
  });

  test('a same-day window that ends before it begins is refused', async ({ page }) => {
    await startWizard(page);
    await page.getByRole('button', { name: 'Add a Window' }).click();
    await openPicker(page);

    // The date cells normalise start against end, but the two clocks do not:
    // winding the end hour back past the start is a range a user can really
    // produce, and the server answers 500 for it rather than 400.
    await nudgeTime(page, 'end', 'hours', -12);
    await savePicker(page);

    const verdict = await classifySave(page, 'Save Window');
    expect(verdict.outcome, verdict.message).toBe('rejected');
    expect(verdict.message).toContain('end after it begins');
    await closeModal(page);
  });

  test('an inverted range can be corrected and then saved', async ({ page }) => {
    await startWizard(page);
    await page.getByRole('button', { name: 'Add a Window' }).click();
    await openPicker(page);
    await nudgeTime(page, 'end', 'hours', -12);
    await savePicker(page);
    expect((await classifySave(page, 'Save Window')).outcome).toBe('rejected');

    // The error must not wedge the form: putting the clock back makes it valid.
    await openPicker(page);
    await nudgeTime(page, 'end', 'hours', 12);
    await savePicker(page);
    const verdict = await classifySave(page, 'Save Window');
    expect(verdict.outcome, verdict.message).toBe('accepted');
  });

  test('many windows stack up without the grid coming apart', async ({ page }) => {
    await startWizard(page);
    await addActivity(page, 'Setup');

    for (let i = 0; i < 8; i += 1) await addWindow(page);

    // Nine rows: one header plus eight windows, each with one activity cell.
    await expect(page.locator('#view-event-table')).toBeVisible();
    const cells = page.locator('#view-event-table .grid > *');
    expect(await cells.count()).toBe(2 + 8 * 2);
  });
});

// --- slots -----------------------------------------------------------------

test.describe('slots', () => {
  /** A one-activity, one-window event has exactly one slot cell to poke at. */
  async function oneSlot(page) {
    await startWizard(page);
    await addActivity(page, 'Setup');
    await addWindow(page);
    // Only interactive tiles render a button, so the blank corner is absent
    // from this list and the single slot is simply the last one: activity
    // header, window header, slot.
    return page.locator('#view-event-table .grid > * button').last();
  }

  test('the slot cap is bounded, and zero is not a way to mean unlimited', async ({ page }) => {
    const cell = await oneSlot(page);

    for (const c of SLOT_CAPS) {
      await cell.click();
      await expect(page.locator(MODAL)).toHaveCount(1);
      await setSwitch(page, 'slot-enabled', true);
      await setSwitch(page, 'slot-unlimited', false);
      await typeInto(page.locator('#slot-cap'), c.typed);

      const verdict = await classifySave(page, 'Update Slot');
      expect(verdict.outcome, `slot cap ${c.name} (${JSON.stringify(c.typed)}): ${verdict.message}`)
        .toBe(c.expect);
      if (verdict.outcome !== 'accepted') await closeModal(page);
      await clearToasts(page);
    }
  });

  test('enabling and disabling repeatedly stays consistent', async ({ page }) => {
    const cell = await oneSlot(page);

    for (let i = 0; i < 5; i += 1) {
      await cell.click();
      await setSwitch(page, 'slot-enabled', false);
      expect((await classifySave(page, 'Update Slot')).outcome).toBe('accepted');
      await expect(cell).toContainText('Unavailable');

      await cell.click();
      await setSwitch(page, 'slot-enabled', true);
      expect((await classifySave(page, 'Update Slot')).outcome).toBe('accepted');
      await expect(cell).not.toContainText('Unavailable');
    }
  });

  test('the slot modal hands off to the activity and window editors', async ({ page }) => {
    const cell = await oneSlot(page);

    await cell.click();
    await page.locator(MODAL).getByRole('button', { name: 'Edit' }).first().click();
    await expect(page.locator('.modal-card-title')).toHaveText('Update an Activity');
    await closeModal(page);

    await cell.click();
    await page.locator(MODAL).getByRole('button', { name: 'Edit' }).nth(1).click();
    await expect(page.locator('.modal-card-title')).toHaveText('Update a Window');
    await closeModal(page);
  });
});

// --- the grid --------------------------------------------------------------

test.describe('the activity grid', () => {
  test('pages through more activities than fit, at both ends', async ({ page }) => {
    await startWizard(page);
    await addWindow(page);
    for (let i = 0; i < 7; i += 1) await addActivity(page, `Act ${i}`);

    const slider = page.locator('#view-event-slider');
    await expect(slider).toBeVisible();
    // Four activity columns visible, so the last page starts at 7 - 3.
    await expect(slider).toHaveAttribute('max', '4');

    for (const step of ['1', '4', '2', '4', '1']) {
      await slider.fill(step);
      await expect(slider).toHaveValue(step);
      // Always five columns: the label column plus four activities.
      expect(await page.locator('#view-event-table .grid > *').count()).toBe(10);
    }
  });

  test('removing activities from under the slider keeps it in range', async ({ page }) => {
    await startWizard(page);
    await addWindow(page);
    for (let i = 0; i < 7; i += 1) await addActivity(page, `Act ${i}`);

    await page.locator('#view-event-slider').fill('4');

    // Delete from the far end while the slider sits past what will remain.
    for (let i = 0; i < 4; i += 1) {
      await page.locator('#view-event-table .grid > *').nth(1).click();
      await expect(page.locator('.modal-card-title')).toHaveText('Update an Activity');
      const verdict = await classifySave(page, 'Remove Activity');
      expect(verdict.outcome, verdict.message).toBe('accepted');
      await clearToasts(page);
    }

    // Three left, so the slider is gone entirely and the grid still renders.
    await expect(page.locator('#view-event-slider')).toHaveCount(0);
    await expect(page.locator('#view-event-table')).toBeVisible();
  });

  test('an event with no activities or windows says so', async ({ page }) => {
    await startWizard(page);
    await expect(page.locator('#view-event-table')).toContainText("haven't added any windows");
  });
});

// --- what the server actually accepts --------------------------------------

test.describe('round trip against the server', () => {
  test.describe.configure({ timeout: 120_000 });

  test('a title the client accepts survives publish', async ({ page }) => {
    // The interesting half of the corpus: everything the client says yes to
    // has to be something the server also says yes to, or the organiser loses
    // the whole event at the last step.
    for (const c of REQUIRED_TEXT_SHORT.filter((x) => x.expect === 'accepted')) {
      await startWizard(page, c.value);
      await addActivity(page, 'Setup');
      await addWindow(page);

      await page.getByRole('button', { name: 'Publish Event' }).click();
      const guest = page.getByRole('button', { name: "No thanks, I'm good!" });
      if (await guest.count()) await guest.click();

      await expect(
        page.getByText('Successfully created your event!'),
        `publishing a title of shape "${c.name}" failed`,
      ).toBeVisible({ timeout: 20_000 });
      await page.waitForURL(/\?event=/, { timeout: 20_000 });
      await clearToasts(page);
    }
  });

  test('an over-long title is caught at the field, not at publish', async ({ page }) => {
    // The point of catching it here is that the alternative is catching it
    // after the organiser has built activities, windows and slots on top of a
    // title that was never going to save.
    await startWizard(page);
    await addActivity(page, 'Setup');
    await addWindow(page);

    const verdict = await runCase(page, {
      open: () => page.getByRole('button', { name: 'Edit Summary' }).click(),
      fill: () => typeInto(page.locator('#event-title'), 'L'.repeat(300)),
      save: 'Save',
    });
    expect(verdict.outcome, verdict.message).toBe('rejected');
    expect(verdict.message.toLowerCase()).toContain('255');

    // ...and the event is still publishable once the title is put right.
    await runCase(page, {
      open: () => page.getByRole('button', { name: 'Edit Summary' }).click(),
      fill: () => typeInto(page.locator('#event-title'), uniqueTitle('Recovered')),
      save: 'Save',
    });
    await publish(page);
  });

  test('editing a published event pushes each change as it is made', async ({ page }) => {
    // Editing needs an owner: publishing anonymously deliberately forfeits the
    // ability to come back to it, so the sign-in is load-bearing, not scenery.
    await page.goto('/');
    await ready(page);
    await signInAsAdmin(page);
    await startWizard(page);
    await addActivity(page, 'Setup');
    await addWindow(page);
    await publish(page);

    await page.getByRole('button', { name: 'Modify Event' }).click();

    // Each of these is a live PATCH, so a client/server disagreement shows up
    // as a toast rather than as an inline error.
    for (const c of REQUIRED_TEXT_SHORT.filter((x) => x.expect === 'accepted')) {
      await page.locator('#view-event-table .grid > *').nth(1).click();
      await expect(page.locator('.modal-card-title')).toHaveText('Update an Activity');
      await typeInto(page.locator('#activity-label'), c.value);

      const verdict = await classifySave(page, 'Save Activity');
      expect(verdict.outcome, `live activity label ${c.name}: ${verdict.message}`)
        .toBe('accepted');
      await clearToasts(page);
    }
  });

  test('a long activity label is refused before it reaches the server', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    await signInAsAdmin(page);
    await startWizard(page);
    await addActivity(page, 'Setup');
    await addWindow(page);
    await publish(page);
    await page.getByRole('button', { name: 'Modify Event' }).click();

    await page.locator('#view-event-table .grid > *').nth(1).click();
    await typeInto(page.locator('#activity-label'), 'M'.repeat(300));

    const verdict = await classifySave(page, 'Save Activity');
    expect(verdict.outcome, verdict.message).toBe('rejected');
    await closeModal(page);
  });
});
