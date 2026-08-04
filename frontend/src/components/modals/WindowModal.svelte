<script>
  /** A time window. §2.5. */
  import Modal from './Modal.svelte';
  import { focusFirstError } from '../../lib/a11y.js';
  import DateRangePicker from '../inputs/DateRangePicker.svelte';
  import LoadingButton from '../inputs/LoadingButton.svelte';
  import { validateWindow } from '../../lib/validation/forms.js';

  let { win = null, isNew = true, onSave, onDelete, onClose } = $props();

  // svelte-ignore state_referenced_locally
  let begin = $state(win?.begin ?? null);
  // svelte-ignore state_referenced_locally
  let end = $state(win?.end ?? null);
  let errors = $state({});
  let busy = $state(false);

  async function save() {
    const verdict = validateWindow({ begin, end });
    errors = verdict.errors;
    if (!verdict.ok) {
      focusFirstError();
      return;
    }
    busy = true;
    try { await onSave?.(verdict.values); } finally { busy = false; }
  }

  async function remove() {
    busy = true;
    try { await onDelete?.(); } finally { busy = false; }
  }
</script>

<Modal title={isNew ? 'Add a Window' : 'Update a Window'} {onClose} onSubmit={save}>
  <div class="field">
    <div class="label">Window</div>
    <!-- Only a new window is floored at tomorrow; an existing one may sit in
         the past and must stay editable. -->
    <DateRangePicker bind:begin bind:end restrictToFuture={isNew} />
    {#if errors.range}
      <p class="help is-danger">{errors.range}</p>
    {/if}
  </div>

  {#snippet footer()}
    <div class="buttons">
      <LoadingButton type="submit" variant="is-success" loading={busy}>Save Window</LoadingButton>
      {#if !isNew}
        <LoadingButton variant="is-warning" loading={busy} onclick={remove}>
          Remove Window
        </LoadingButton>
      {/if}
    </div>
  {/snippet}
</Modal>
