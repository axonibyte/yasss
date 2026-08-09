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
  import { fieldAria } from '../../lib/a11y.js';

  let {
    id,
    label,
    switchLabel,
    /** Labels the number input; the heading above labels the switch. */
    numberLabel = 'How many?',
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
    const trimmed = String(raw).trim();
    // A number input reports '' for anything it could not parse — a pasted
    // word, a lone '-', a half-typed exponent. `Number('')` is 0, which used to
    // clamp straight up to `min`: pasting "abc" silently became 1, with no
    // error and nothing on screen to explain where the number came from.
    // Keeping the last good value is both safer and what `onCommit` already
    // assumes, since it snaps the box back to `capped` on blur.
    if (trimmed === '') return;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return;
    capped = Math.min(Math.max(Math.trunc(n), min), max);
    value = capped;
  }

  /**
   * Snap the box to the value that will actually be saved.
   *
   * The clamp runs on input, but the input is not bound — so when clamping
   * leaves `capped` where it already was (typing `0` into a field showing the
   * minimum, say) Svelte sees no change and leaves the box displaying what was
   * typed. The number went out as 1 and the organizer was looking at 0.
   *
   * Done on change rather than on input so it does not fight someone midway
   * through typing a longer number.
   */
  function onCommit(el) {
    el.value = String(capped);
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
  <!-- the group heading above labels the switch, not this input -->
  <Field label={numberLabel} {error} {id}>
    <input
      {id}
      {...fieldAria(id, error)}
      class="input"
      class:is-danger={error}
      type="number"
      {min}
      {max}
      {placeholder}
      value={capped}
      oninput={(e) => onInput(e.currentTarget.value)}
      onchange={(e) => onCommit(e.currentTarget)}
    />
  </Field>
{/if}
