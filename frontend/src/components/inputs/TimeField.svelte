<script>
  /**
   * A time of day, as `HH:mm`.
   *
   * A native `<input type="time">` rather than the bulma-calendar picker the
   * event side uses. That picker is a megabyte of lazily-loaded chunk and it
   * answers with a date; a poll's row is a clock reading with no date at all,
   * so the native control is both the smaller dependency and the more honest
   * one. It also already speaks `HH:mm`, which is exactly what the wire wants.
   */
  import Field from './Field.svelte';
  import { fieldAria } from '../../lib/a11y.js';

  let {
    label = 'Time',
    id = 'time-field',
    value = $bindable('09:00'),
    error = null,
    oninput = null,
    /**
     * Earliest acceptable reading, as `HH:mm`.
     *
     * The browser's own guard, not the only one: `min` shows up in the picker
     * and in constraint validation, but it is advisory enough that the caller
     * still has to check. Both are worth having -- the native one stops the
     * mistake being made, and the explicit one stops it being submitted.
     */
    min = null,
  } = $props();
</script>

<Field {label} {error} {id}>
  <input
    {id}
    {...fieldAria(id, error)}
    class="input"
    class:is-danger={error}
    type="time"
    min={min ?? undefined}
    bind:value
    {oninput}
  />
</Field>
