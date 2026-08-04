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

  // Only one modal is ever mounted at a time, so a fixed id is enough to point
  // `aria-labelledby` at the title.
  const titleId = 'modal-card-title';
</script>

<svelte:window onkeydown={onKeydown} />

<!--
  `role="dialog"` and `aria-modal` rather than a bare div: without them the
  dialog announced no name at all and assistive tech was free to walk into the
  page behind it, which is still fully in the accessibility tree. Bulma styles
  by class, so this changes nothing visually.
-->
<div class="modal is-active" role="dialog" aria-modal="true" aria-labelledby={titleId}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="modal-background" onclick={() => closable && onClose?.()}></div>
  <div class="modal-card">
    <header class="modal-card-head">
      <p class="modal-card-title" id={titleId}>{title}</p>
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
