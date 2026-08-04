<script>
  /** A custom sign-up field. §2.6. */
  import Modal from './Modal.svelte';
  import Field from '../inputs/Field.svelte';
  import { fieldAria } from '../../lib/a11y.js';
  import LoadingButton from '../inputs/LoadingButton.svelte';
  import { DETAIL_TYPE_OPTIONS } from '../../lib/validation/detailTypes.js';
  import { validateDetail } from '../../lib/validation/forms.js';

  let { detail = null, isNew = true, onSave, onDelete, onClose } = $props();

  // svelte-ignore state_referenced_locally
  let type = $state(detail?.type ?? '');
  // svelte-ignore state_referenced_locally
  let label = $state(detail?.label ?? '');
  // svelte-ignore state_referenced_locally
  let hint = $state(detail?.hint ?? '');
  // svelte-ignore state_referenced_locally
  let required = $state(detail?.required ?? false);
  let errors = $state({});
  let busy = $state(false);

  async function save() {
    const verdict = validateDetail({ type, label, hint, required });
    errors = verdict.errors;
    if (!verdict.ok) return;
    busy = true;
    try { await onSave?.(verdict.values); } finally { busy = false; }
  }

  async function remove() {
    busy = true;
    try { await onDelete?.(); } finally { busy = false; }
  }
</script>

<Modal title={isNew ? 'Add a Detail' : 'Update a Detail'} {onClose}>
  <Field label="Type" error={errors.type} id="detail-type">
    <div class="select" class:is-danger={errors.type}>
      <select id="detail-type"
      {...fieldAria('detail-type', errors.type)} bind:value={type}>
        <option value="" disabled>What type of detail?</option>
        {#each DETAIL_TYPE_OPTIONS as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </div>
  </Field>

  <Field label="Field" error={errors.label} id="detail-label">
    <input
      id="detail-label"
      {...fieldAria('detail-label', errors.label)}
      class="input"
      class:is-danger={errors.label}
      type="text"
      placeholder="What do you need from your volunteers?"
      bind:value={label}
      oninput={() => { errors = { ...errors, label: undefined }; }}
    />
  </Field>

  <Field label="Description" error={errors.hint} id="detail-hint">
    <textarea
      id="detail-hint"
      {...fieldAria('detail-hint', errors.hint)}
      class="textarea"
      class:is-danger={errors.hint}
      rows="4"
      placeholder="You can put additional instructions or requirements here if you want."
      bind:value={hint}
      oninput={() => { errors = { ...errors, hint: undefined }; }}
    ></textarea>
  </Field>

  <div class="field">
    <div class="control">
      <input id="detail-required" type="checkbox" class="switch" bind:checked={required} />
      <label class="switch" for="detail-required">Should users be required to answer this?</label>
    </div>
  </div>

  {#snippet footer()}
    <div class="buttons">
      <LoadingButton variant="is-success" loading={busy} onclick={save}>Save Detail</LoadingButton>
      {#if !isNew}
        <LoadingButton variant="is-warning" loading={busy} onclick={remove}>
          Remove Detail
        </LoadingButton>
      {/if}
    </div>
  {/snippet}
</Modal>
