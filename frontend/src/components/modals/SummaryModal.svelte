<script>
  /** Event title, description and the two policy switches. §2.3. */
  import Modal from './Modal.svelte';
  import Field from '../inputs/Field.svelte';
  import { fieldAria, focusFirstError } from '../../lib/a11y.js';
  import LoadingButton from '../inputs/LoadingButton.svelte';
  import { validateSummary } from '../../lib/validation/forms.js';
  import { localZone } from '../../lib/format/dates.js';

  let { summary = null, isNew = true, onSave, onClose } = $props();

  // svelte-ignore state_referenced_locally
  let title = $state(summary?.title ?? '');
  // svelte-ignore state_referenced_locally
  let description = $state(summary?.description ?? '');
  // svelte-ignore state_referenced_locally
  let notifyOnSignup = $state(summary?.notifyOnSignup ?? true);
  // svelte-ignore state_referenced_locally
  let allowMultiuserSignups = $state(summary?.allowMultiuserSignups ?? false);
  // Held as a string so an empty box stays empty rather than showing a 0 the
  // organiser did not type; blank means "use the platform default".
  // svelte-ignore state_referenced_locally
  let reminderLeadTime = $state(
    summary?.reminderLeadTime == null ? '' : String(summary.reminderLeadTime),
  );
  // The zone used to be captured silently from the browser at creation and was
  // then unchangeable, so an organiser building an event while travelling — or
  // on a machine with the wrong zone set — had no way to see that it was wrong
  // and no way to correct it. It is a real field now.
  //
  // A new event defaults to the browser's zone, as it always did. An existing
  // one that never recorded a zone defaults to blank — meaning "render in each
  // viewer's own" — rather than to the editor's zone, so that editing the
  // description of an event created before zones existed does not quietly stamp
  // whichever zone the organiser happens to be in onto it.
  // svelte-ignore state_referenced_locally
  let timezone = $state(summary?.timezone ?? (isNew ? localZone() : ''));
  let errors = $state({});
  let busy = $state(false);

  // Every zone the engine will name. Chrome 99+, Firefox 93+ and Safari 15.4+;
  // the catch keeps the picker usable on anything older rather than rendering
  // an empty select.
  //
  // The current zone is added when the list omits it, which is not a hypothetical:
  // `supportedValuesOf` returns the canonical set and leaves out `UTC`, so a
  // browser running in UTC — every one in this test suite, and plenty in the
  // wild — would otherwise find its own zone missing from the picker and see a
  // blank selection.
  const zones = (() => {
    let list;
    try {
      list = Intl.supportedValuesOf('timeZone');
    } catch {
      list = [];
    }
    // `UTC` is added explicitly because `supportedValuesOf` returns the
    // canonical set and leaves it out, yet the engine resolves it, the server
    // accepts it, and it is what `Intl` reports for a browser running in UTC.
    // Without it a UTC organiser could neither see nor choose their own zone.
    const current = summary?.timezone ?? localZone();
    return [...new Set([...list, 'UTC', current].filter(Boolean))].sort();
  })();

  async function save() {
    const verdict = validateSummary({
      title, description, notifyOnSignup, allowMultiuserSignups, reminderLeadTime, timezone,
    });
    errors = verdict.errors;
    if (!verdict.ok) {
      focusFirstError();
      return;
    }

    busy = true;
    try {
      await onSave?.(verdict.values);
    } finally {
      busy = false;
    }
  }
</script>

<Modal title={isNew ? 'Create an Event' : 'Update an Event'} {onClose} onSubmit={save}>
  <Field label="Event Title" error={errors.title} id="event-title">
    <input
      id="event-title"
      {...fieldAria('event-title', errors.title)}
      class="input"
      class:is-danger={errors.title}
      type="text"
      placeholder="What's the name of your event?"
      bind:value={title}
      oninput={() => { errors = { ...errors, title: undefined }; }}
    />
  </Field>

  <Field label="Description" error={errors.description} id="event-description">
    <textarea
      id="event-description"
      {...fieldAria('event-description', errors.description)}
      class="textarea"
      class:is-danger={errors.description}
      rows="4"
      placeholder="Describe your event!"
      bind:value={description}
      oninput={() => { errors = { ...errors, description: undefined }; }}
    ></textarea>
  </Field>

  <div class="field">
    <div class="control">
      <input id="event-notify" type="checkbox" class="switch" bind:checked={notifyOnSignup} />
      <label class="switch" for="event-notify">
        Do you want to be notified when someone signs up?
      </label>
    </div>
  </div>

  <div class="field">
    <div class="control">
      <input id="event-multiuser" type="checkbox" class="switch" bind:checked={allowMultiuserSignups} />
      <label class="switch" for="event-multiuser">Allow multiple volunteers per signup?</label>
    </div>
  </div>

  <Field label="Time zone" error={errors.timezone} id="event-timezone">
    <div class="select is-fullwidth">
      <select
        id="event-timezone"
        {...fieldAria('event-timezone', errors.timezone)}
        class:is-danger={errors.timezone}
        bind:value={timezone}
      >
        <option value="">Show in each viewer’s own time zone</option>
        {#each zones as zone (zone)}
          <option value={zone}>{zone}</option>
        {/each}
      </select>
    </div>
    <p class="help">All times on this event are shown in this zone.</p>
  </Field>

  <Field
    label="Reminder lead time (minutes)"
    error={errors.reminderLeadTime}
    id="event-lead-time"
  >
    <!--
      Text, not number. Svelte binds a number input as a number, so anything the
      browser cannot parse arrives here as blank — and blank means "use the
      platform default". Pasting `1440abc` therefore saved the default and said
      nothing at all. As text the raw string survives, and `validateSummary`
      already rejects it: `Number('1440abc')` is NaN and fails the integer
      check. That no validator needed changing is the clearest sign the input
      type was the bug. The spinner arrows are the cost; one that discards what
      you typed is worse than none.
    -->
    <input
      id="event-lead-time"
      {...fieldAria('event-lead-time', errors.reminderLeadTime)}
      class="input"
      class:is-danger={errors.reminderLeadTime}
      type="text"
      inputmode="numeric"
      placeholder="Leave blank to use the default"
      bind:value={reminderLeadTime}
      oninput={() => { errors = { ...errors, reminderLeadTime: undefined }; }}
    />
    <p class="help">How far ahead volunteers who opted in are reminded. 1440 is a day.</p>
  </Field>

  {#snippet footer()}
    <LoadingButton type="submit" variant="is-success" loading={busy}>Save</LoadingButton>
  {/snippet}
</Modal>
