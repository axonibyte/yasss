<script>
  /**
   * A labelled form field with inline error presentation.
   *
   * The legacy appended a red `Error` pill with a tooltip into the label and
   * only cleared it on the next submit attempt, so a corrected field stayed red
   * until you tried again (behavior §3.7). Here the error is a prop, and the
   * owning form clears it on input.
   *
   * The legacy also used `<div class="label">` almost everywhere, which Bulma
   * styles identically but leaves with no accessible association; these are
   * real labels.
   */
  let { label = '', error = null, id = null, children } = $props();
</script>

<div class="field">
  {#if label}
    <label class="label" for={id}>
      {label}{#if error}&ensp;<button
          type="button"
          class="tag is-danger has-tooltip-right"
          data-tooltip={error}
          aria-label={error}
        >Error</button>{/if}
    </label>
  {/if}
  <div class="control">
    {@render children?.()}
  </div>
  {#if error}
    <p class="help is-danger">{error}</p>
  {/if}
</div>
