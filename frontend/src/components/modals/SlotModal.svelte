<script>
  /**
   * One grid cell: whether the activity is offered in this window, and its cap.
   * §2.7.
   *
   * The legacy let you jump from here to the activity or window editor by
   * synthesizing a click on a grid cell looked up by a stored index — which was
   * stale or undefined whenever the grid had been scrolled, so it clicked the
   * wrong cell or threw. These are plain callbacks with the entity in hand.
   */
  import Modal from './Modal.svelte';
  import Field from '../inputs/Field.svelte';
  import LoadingButton from '../inputs/LoadingButton.svelte';
  import { validateSlot } from '../../lib/validation/forms.js';

  let {
    activityLabel, windowLabel, slot,
    onSave, onClose, onEditActivity, onEditWindow,
  } = $props();

  // svelte-ignore state_referenced_locally
  let enabled = $state(slot?.enabled ?? false);
  // svelte-ignore state_referenced_locally
  let cap = $state(slot?.cap ?? 0);
  // svelte-ignore state_referenced_locally
  let unlimited = $state((slot?.cap ?? 0) === 0);
  let errors = $state({});
  let busy = $state(false);

  async function save() {
    const verdict = validateSlot({ enabled, cap: unlimited ? 0 : cap });
    errors = verdict.errors;
    if (!verdict.ok) return;
    busy = true;
    try { await onSave?.(verdict.values); } finally { busy = false; }
  }
</script>

<Modal title="Edit a Slot" {onClose}>
  <div class="field">
    <div class="label">
      Activity&ensp;<button type="button" class="tag is-warning" onclick={onEditActivity}>
        Edit
      </button>
    </div>
    <div class="control">
      <input class="input" type="text" value={activityLabel} disabled />
    </div>
  </div>

  <div class="field">
    <div class="label">
      Window&ensp;<button type="button" class="tag is-warning" onclick={onEditWindow}>
        Edit
      </button>
    </div>
    <div class="control">
      <input class="input" type="text" value={windowLabel} disabled />
    </div>
  </div>

  <div class="field">
    <div class="label">Enable Slot</div>
    <div class="control">
      <input id="slot-enabled" type="checkbox" class="switch is-warning" bind:checked={enabled} />
      <label class="switch" for="slot-enabled">Enable this slot?</label>
    </div>
  </div>

  {#if enabled}
    <div class="field">
      <div class="label">Slot Volunteer Cap</div>
      <div class="control">
        <input id="slot-unlimited" type="checkbox" class="switch" bind:checked={unlimited} />
        <label class="switch" for="slot-unlimited">Unlimited volunteers for this slot?</label>
      </div>
    </div>
    {#if !unlimited}
      <!-- the heading above labels the switch, not this input -->
      <Field label="Volunteers for this slot" error={errors.cap} id="slot-cap">
        <input
          id="slot-cap"
          class="input"
          class:is-danger={errors.cap}
          type="number"
          min="1"
          max="255"
          placeholder="How many volunteers for this slot?"
          bind:value={cap}
        />
      </Field>
    {/if}
  {/if}

  {#snippet footer()}
    <div class="buttons is-right">
      <LoadingButton variant="is-success" loading={busy} onclick={save}>Update Slot</LoadingButton>
    </div>
  {/snippet}
</Modal>
