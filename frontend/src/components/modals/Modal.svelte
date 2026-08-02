<script>
  /**
   * Bulma modal-card shell. docs/legacy/02-aesthetics.md §2.
   *
   * Every legacy modal shared this structure and was toggled by adding
   * `is-active`; here mounting the component is what makes it active.
   */
  let {
    title = '',
    onClose,
    closable = true,
    children,
    footer,
  } = $props();

  function onKeydown(e) {
    if (closable && e.key === 'Escape') onClose?.();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="modal is-active">
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="modal-background" onclick={() => closable && onClose?.()}></div>
  <div class="modal-card">
    <header class="modal-card-head">
      <p class="modal-card-title">{title}</p>
      {#if closable}
        <button class="delete" aria-label="close" onclick={() => onClose?.()}></button>
      {/if}
    </header>
    <section class="modal-card-body">
      {@render children?.()}
    </section>
    <footer class="modal-card-foot">
      {@render footer?.()}
    </footer>
  </div>
</div>
