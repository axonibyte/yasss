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
   *
   * The pill is a `<span>` in the help line rather than a `<button>` inside the
   * `<label>`, which is what it was until it was found to be doing real damage:
   * interactive content is not permitted inside a label, so it added a tab stop
   * that existed only while the field was invalid, clicking it activated the
   * label, and it changed the field's accessible name from "Email Address" to
   * "Email Address Error" — enough to break every `getByLabel` the moment a
   * test actually exercised a failure. Its tooltip repeated the message printed
   * directly beneath it, so nothing was lost by dropping it.
   *
   * The error text carries `id="{id}-error"`; inputs are supplied by the caller
   * as a snippet, so the `aria-describedby` that points at it has to be set at
   * the call site. `fieldAria` in `lib/a11y.js` exists for that.
   */
  let { label = '', error = null, id = null, children } = $props();
</script>

<div class="field">
  {#if label}
    <label class="label" for={id}>{label}</label>
  {/if}
  <div class="control">
    {@render children?.()}
  </div>
  {#if error}
    <p class="help is-danger" id={id ? `${id}-error` : undefined}>
      <span class="tag is-danger">Error</span>&ensp;{error}
    </p>
  {/if}
</div>
