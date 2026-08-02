<script>
  /**
   * A button that shows a spinner while its action is in flight.
   *
   * The legacy's setLoaderBtn also tried to add a `has-text-*` class to hide
   * the label, but its modifier detection tested `endsWith` against a single
   * space-joined string, so it never matched anything (behavior §6.15). Bulma's
   * own `.is-loading` already makes the label transparent, so the whole
   * mechanism was redundant.
   */
  let {
    variant = 'is-primary',
    loading = false,
    disabled = false,
    type = 'button',
    onclick,
    children,
    ...rest
  } = $props();
</script>

<button
  {type}
  class="button {variant}"
  class:is-loading={loading}
  disabled={disabled || loading}
  {onclick}
  {...rest}
>{@render children?.()}</button>
