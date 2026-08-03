<script>
  /**
   * Activity label, description and the two caps. §2.4.
   *
   * The legacy's label read "Acitvity Volunteer Cap"; normalized here and
   * recorded in docs/rewrite-deltas.md.
   */
  import Modal from './Modal.svelte';
  import Field from '../inputs/Field.svelte';
  import CapField from '../inputs/CapField.svelte';
  import LoadingButton from '../inputs/LoadingButton.svelte';
  import { validateActivity } from '../../lib/validation/forms.js';

  let {
    activity = null,
    isNew = true,
    /** Whether a move in each direction is possible; hides the dead ends. */
    canMoveLeft = false,
    canMoveRight = false,
    onSave,
    onDelete,
    onMove,
    onClose,
  } = $props();

  // svelte-ignore state_referenced_locally
  let label = $state(activity?.label ?? '');
  // svelte-ignore state_referenced_locally
  let description = $state(activity?.description ?? '');
  // svelte-ignore state_referenced_locally
  let volunteerCap = $state(activity?.volunteerCap ?? 0);
  // svelte-ignore state_referenced_locally
  let slotCapDefault = $state(activity?.slotCapDefault ?? 0);
  let errors = $state({});
  let busy = $state(false);

  async function save() {
    const verdict = validateActivity({ label, description, volunteerCap, slotCapDefault });
    errors = verdict.errors;
    if (!verdict.ok) return;
    busy = true;
    try { await onSave?.(verdict.values); } finally { busy = false; }
  }

  async function remove() {
    busy = true;
    try { await onDelete?.(); } finally { busy = false; }
  }

  async function move(delta) {
    busy = true;
    try { await onMove?.(delta); } finally { busy = false; }
  }
</script>

<Modal title={isNew ? 'Add an Activity' : 'Update an Activity'} {onClose}>
  <Field label="Activity" error={errors.label} id="activity-label">
    <input
      id="activity-label"
      class="input"
      class:is-danger={errors.label}
      type="text"
      placeholder="What's the activity?"
      bind:value={label}
      oninput={() => { errors = { ...errors, label: undefined }; }}
    />
  </Field>

  <Field label="Description" id="activity-description">
    <textarea
      id="activity-description"
      class="textarea"
      rows="4"
      placeholder="Describe the activity!"
      bind:value={description}
    ></textarea>
  </Field>

  <CapField
    id="activity-vol-cap"
    label="Activity Volunteer Cap"
    switchLabel="Unlimited volunteers for this activity?"
    numberLabel="Volunteers for this activity"
    placeholder="How many volunteers do you need for this activity?"
    error={errors.volunteerCap}
    bind:value={volunteerCap}
  />

  <CapField
    id="activity-slot-cap"
    label="Slot Volunteer Cap Default"
    switchLabel="Unlimited volunteers per slot by default?"
    numberLabel="Volunteers per slot by default"
    placeholder="How many volunteers per slot by default?"
    error={errors.slotCapDefault}
    bind:value={slotCapDefault}
  />

  {#snippet footer()}
    <div class="buttons">
      <LoadingButton variant="is-success" loading={busy} onclick={save}>Save Activity</LoadingButton>
      {#if !isNew && canMoveLeft}
        <LoadingButton variant="is-info" loading={busy} onclick={() => move(-1)}>
          Move Left
        </LoadingButton>
      {/if}
      {#if !isNew && canMoveRight}
        <LoadingButton variant="is-info" loading={busy} onclick={() => move(1)}>
          Move Right
        </LoadingButton>
      {/if}
      {#if !isNew}
        <LoadingButton variant="is-warning" loading={busy} onclick={remove}>
          Remove Activity
        </LoadingButton>
      {/if}
    </div>
  {/snippet}
</Modal>
