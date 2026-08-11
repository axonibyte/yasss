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
  import CapField from '../inputs/CapField.svelte';
  import { focusFirstError } from '../../lib/a11y.js';
  import LoadingButton from '../inputs/LoadingButton.svelte';
  import { validateSlot } from '../../lib/validation/forms.js';

  let {
    activityLabel, windowLabel, slot,
    onSave, onClose, onEditActivity, onEditWindow,
  } = $props();

  // svelte-ignore state_referenced_locally
  let enabled = $state(slot?.enabled ?? false);
  // 0 is CapField's spelling of unlimited, which is also the server's, so the
  // switch state does not need tracking separately here.
  // svelte-ignore state_referenced_locally
  let cap = $state(slot?.cap ?? 0);
  let errors = $state({});
  let busy = $state(false);

  async function save() {
    // Folding "unlimited" into a zero is safe here where it would not have been
    // against a bare input: CapField never yields an empty or half-typed value,
    // because it keeps the last good number and snaps the box back on blur. So
    // a zero can only mean the switch, never a cleared field.
    const verdict = validateSlot({ enabled, unlimited: cap === 0, cap });
    errors = verdict.errors;
    if (!verdict.ok) {
      focusFirstError();
      return;
    }
    busy = true;
    try { await onSave?.(verdict.values); } finally { busy = false; }
  }
</script>

<Modal title="Edit a Slot" {onClose} onSubmit={save}>
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

  <div class="field" data-field="slot-enabled">
    <div class="label">Enable Slot</div>
    <div class="control">
      <input id="slot-enabled" type="checkbox" class="switch is-warning" bind:checked={enabled} />
      <label class="switch" for="slot-enabled">Enable this slot?</label>
    </div>
  </div>

  {#if enabled}
    <!--
      CapField rather than a hand-rolled copy of it. This modal reimplemented
      the switch and the number box and lost both of the things that make the
      component worth having: the paste guard, which stops a pasted word
      becoming a silent 1, and the blur snap-back, which stops the box showing a
      number different from the one that will be saved.
    -->
    <CapField
      id="slot-cap"
      label="Slot Volunteer Cap"
      switchLabel="Unlimited volunteers for this slot?"
      numberLabel="Volunteers for this slot"
      placeholder="How many volunteers for this slot?"
      error={errors.cap}
      bind:value={cap}
    />
  {/if}

  {#snippet footer()}
    <div class="buttons is-right">
      <LoadingButton type="submit" variant="is-success" loading={busy}>Update Slot</LoadingButton>
    </div>
  {/snippet}
</Modal>
