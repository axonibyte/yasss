<script>
  /**
   * Add or edit a volunteer, with one input per custom field.
   *
   * docs/legacy/02-aesthetics.md §2.8. The legacy generated these inputs
   * imperatively and identified them by parsing an index out of the element id,
   * which is why an unrecognized detail type produced no input and then threw
   * during validation, returning null with no message — a form that could not
   * be submitted and gave no reason.
   */
  import Modal from './Modal.svelte';
  import Field from '../inputs/Field.svelte';
  import LoadingButton from '../inputs/LoadingButton.svelte';
  import { DETAIL_TYPES } from '../../lib/validation/detailTypes.js';
  import { validateVolunteer } from '../../lib/validation/forms.js';

  let {
    volunteer,
    details = [],
    isNew = true,
    /** Signed-in account's address, offered as the reminder default. */
    accountEmail = null,
    onSave,
    onDelete,
    onClose,
  } = $props();

  // The form edits a snapshot, not the live entity: nothing is written back
  // until Save, so cancelling leaves the volunteer untouched. Capturing the
  // initial value is therefore the intent — this modal is remounted for each
  // volunteer, so there is no stale-prop hazard.
  // svelte-ignore state_referenced_locally
  let name = $state(volunteer?.name ?? '');
  // svelte-ignore state_referenced_locally
  let values = $state(new Map(volunteer?.values ?? []));
  // svelte-ignore state_referenced_locally
  let remindersEnabled = $state(volunteer?.remindersEnabled ?? false);
  // svelte-ignore state_referenced_locally
  let reminderEmail = $state(volunteer?.reminderEmail ?? '');
  let errors = $state({});
  let busy = $state(false);

  // Signed-in volunteers do not have to retype an address the platform already
  // holds, and one that matches their account needs no confirmation email.
  const emailPlaceholder = $derived(
    accountEmail ? accountEmail : 'Where should we send the reminder?',
  );

  // Already confirmed and unchanged: say so rather than implying another
  // confirmation email is coming, because none will be sent.
  const alreadyConfirmed = $derived(
    Boolean(volunteer?.reminderConfirmed) && !reminderEmail.trim(),
  );

  /** Details we can actually render; unknown types are skipped, not fatal. */
  const renderable = $derived(details.filter((d) => DETAIL_TYPES[d.type]));

  const clearError = (key) => {
    if (errors[key]) errors = { ...errors, [key]: undefined };
  };

  function setValue(key, value) {
    values.set(key, value);
    values = new Map(values);
    clearError(key);
  }

  async function save() {
    const verdict = validateVolunteer(
      { name, values, remindersEnabled, reminderEmail },
      renderable,
      { accountEmail },
    );
    errors = verdict.errors;
    if (!verdict.ok) return;

    busy = true;
    try {
      await onSave?.({
        name: verdict.values.name,
        values,
        remindersEnabled,
        reminderEmail: verdict.values.reminderEmail,
      });
    } finally {
      busy = false;
    }
  }

  async function remove() {
    busy = true;
    try {
      await onDelete?.();
    } finally {
      busy = false;
    }
  }
</script>

<Modal title={isNew ? 'Add a Volunteer' : 'Update a Volunteer'} {onClose}>
  <Field label="Name" error={errors.name} id="vol-name">
    <input
      id="vol-name"
      class="input"
      class:is-danger={errors.name}
      type="text"
      placeholder="What's the volunteer's name?"
      bind:value={name}
      oninput={() => clearError('name')}
    />
  </Field>

  {#each renderable as detail (detail.key)}
    {@const spec = DETAIL_TYPES[detail.type]}
    {@const id = `vol-detail-${detail.key}`}
    {#if spec.input === 'switch'}
      <div class="field">
        <div class="control">
          <input
            {id}
            type="checkbox"
            class="switch is-rtl"
            checked={values.get(detail.key) === true}
            onchange={(e) => setValue(detail.key, e.currentTarget.checked)}
          />
          <label class="switch" for={id}>
            {detail.label}{detail.required ? ' (required)' : ''}
          </label>
        </div>
        {#if errors[detail.key]}
          <p class="help is-danger">{errors[detail.key]}</p>
        {/if}
      </div>
    {:else}
      <Field
        label={`${detail.label}${detail.required ? ' (required)' : ''}`}
        error={errors[detail.key]}
        {id}
      >
        <input
          {id}
          class="input"
          class:is-danger={errors[detail.key]}
          type={spec.input === 'number' ? 'number' : 'text'}
          min={spec.input === 'number' ? 0 : undefined}
          placeholder={detail.hint}
          value={values.get(detail.key) ?? ''}
          oninput={(e) => setValue(detail.key, e.currentTarget.value)}
          onblur={detail.type === 'EMAIL'
            ? (e) => setValue(detail.key, e.currentTarget.value.trim().toLowerCase())
            : undefined}
        />
      </Field>
    {/if}
  {/each}

  <div class="field">
    <div class="control">
      <input
        id="vol-reminders"
        type="checkbox"
        class="switch is-rtl"
        bind:checked={remindersEnabled}
        onchange={() => clearError('reminderEmail')}
      />
      <label class="switch" for="vol-reminders">Email me a reminder before the event</label>
    </div>
  </div>

  {#if remindersEnabled}
    <Field label="Reminder Email" error={errors.reminderEmail} id="vol-reminder-email">
      <input
        id="vol-reminder-email"
        class="input"
        class:is-danger={errors.reminderEmail}
        type="email"
        placeholder={emailPlaceholder}
        bind:value={reminderEmail}
        oninput={() => clearError('reminderEmail')}
        onblur={() => { reminderEmail = reminderEmail.trim().toLowerCase(); }}
      />
      {#if alreadyConfirmed}
        <p class="help">Your reminders are confirmed.</p>
      {:else}
        <p class="help">We'll send one email to confirm. You can unsubscribe from any of them.</p>
      {/if}
    </Field>
  {/if}

  {#snippet footer()}
    <div class="buttons">
      <LoadingButton variant="is-success" loading={busy} onclick={save}>
        Save Volunteer
      </LoadingButton>
      {#if !isNew}
        <LoadingButton variant="is-warning" loading={busy} onclick={remove}>
          Remove Volunteer
        </LoadingButton>
      {/if}
    </div>
  {/snippet}
</Modal>
