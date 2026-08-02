<script>
  /**
   * A capacity input paired with an "unlimited" switch.
   *
   * The sense is inverted and that is deliberate: checked means unlimited,
   * which the server represents as 0. docs/legacy/02-aesthetics.md §2.4.
   *
   * The legacy clamped these with a delegated-looking handler that was actually
   * bound directly, so dynamically-created inputs never got clamped at all.
   * Being a component, this one always does.
   */
  import Field from './Field.svelte';

  let {
    id,
    label,
    switchLabel,
    placeholder = '',
    /** 0 means unlimited. */
    value = $bindable(0),
    error = null,
    min = 1,
    max = 255,
  } = $props();

  // The switch and the remembered number are seeded from the incoming value
  // once; the parent binding is written back on change, not read continuously.
  // svelte-ignore state_referenced_locally
  let unlimited = $state(value === 0);
  // Remembered so toggling unlimited off restores what was typed.
  // svelte-ignore state_referenced_locally
  let capped = $state(value === 0 ? min : value);

  function onToggle(checked) {
    unlimited = checked;
    value = checked ? 0 : capped;
  }

  function onInput(raw) {
    const n = Number(raw);
    capped = Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), min), max) : min;
    value = capped;
  }
</script>

<div class="field">
  <div class="label">{label}</div>
  <div class="control">
    <input
      id="{id}-unlimited"
      type="checkbox"
      class="switch"
      checked={unlimited}
      onchange={(e) => onToggle(e.currentTarget.checked)}
    />
    <label class="switch" for="{id}-unlimited">{switchLabel}</label>
  </div>
</div>

{#if !unlimited}
  <Field {error} {id}>
    <input
      {id}
      class="input"
      class:is-danger={error}
      type="number"
      {min}
      {max}
      {placeholder}
      value={capped}
      oninput={(e) => onInput(e.currentTarget.value)}
    />
  </Field>
{/if}
