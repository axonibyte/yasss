<script>
  /** Event title, description and the two policy switches. §2.3. */
  import Modal from './Modal.svelte';
  import Field from '../inputs/Field.svelte';
  import LoadingButton from '../inputs/LoadingButton.svelte';
  import { validateSummary } from '../../lib/validation/forms.js';

  let { summary = null, isNew = true, onSave, onClose } = $props();

  // svelte-ignore state_referenced_locally
  let title = $state(summary?.title ?? '');
  // svelte-ignore state_referenced_locally
  let description = $state(summary?.description ?? '');
  // svelte-ignore state_referenced_locally
  let notifyOnSignup = $state(summary?.notifyOnSignup ?? true);
  // svelte-ignore state_referenced_locally
  let allowMultiuserSignups = $state(summary?.allowMultiuserSignups ?? false);
  let errors = $state({});
  let busy = $state(false);

  async function save() {
    const verdict = validateSummary({
      title, description, notifyOnSignup, allowMultiuserSignups,
    });
    errors = verdict.errors;
    if (!verdict.ok) return;

    busy = true;
    try {
      await onSave?.(verdict.values);
    } finally {
      busy = false;
    }
  }
</script>

<Modal title={isNew ? 'Create an Event' : 'Update an Event'} {onClose}>
  <Field label="Event Title" error={errors.title} id="event-title">
    <input
      id="event-title"
      class="input"
      class:is-danger={errors.title}
      type="text"
      placeholder="What's the name of your event?"
      bind:value={title}
      oninput={() => { errors = { ...errors, title: undefined }; }}
    />
  </Field>

  <Field label="Description" id="event-description">
    <textarea
      id="event-description"
      class="textarea"
      rows="4"
      placeholder="Describe your event!"
      bind:value={description}
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

  {#snippet footer()}
    <LoadingButton variant="is-success" loading={busy} onclick={save}>Save</LoadingButton>
  {/snippet}
</Modal>
