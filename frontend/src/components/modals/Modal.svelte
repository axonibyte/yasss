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
    /**
     * What Enter should do, when there is a sensible answer.
     *
     * Modals that take this get a real `<form>`, which is what makes implicit
     * submission work. There was not one `<form>` in the entire app: typing a
     * password and pressing Enter did nothing at all, and every field in every
     * modal was a dead end for anyone who does not reach for the mouse.
     *
     * Left unset for modals with nothing to submit — a share sheet, a rendered
     * markdown document — where a form would be a lie.
     */
    onSubmit = null,
    children,
    footer,
  } = $props();

  /** The dialog element, for focus containment. */
  let card = $state(null);

  function onKeydown(e) {
    if (closable && e.key === 'Escape') onClose?.();
  }

  // Only one modal is ever mounted at a time, so a fixed id is enough to point
  // `aria-labelledby` at the title.
  const titleId = 'modal-card-title';

  /**
   * Everything inside the card that can take focus, in document order.
   *
   * `offsetParent` filters out anything hidden — the cap input behind an
   * "unlimited" switch, a field on a step that is not showing — because a trap
   * that cycles through invisible controls is worse than none.
   */
  const focusable = () => Array.from(
    card?.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), '
      + 'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? [],
  ).filter((el) => el.offsetParent !== null);

  /**
   * Move focus in, keep it in, and put it back.
   *
   * The dialog already claimed `aria-modal="true"`, which tells assistive tech
   * that the rest of the page is inert — but nothing made it so. Focus stayed
   * wherever it was, Tab walked straight out into the page behind, and closing
   * the modal left focus on `<body>` so the next Tab started from the top of
   * the document. Claiming the semantics without honouring them is worse than
   * not claiming them.
   */
  function trap(node) {
    const previous = document.activeElement;

    // The first field, if there is one, so typing works immediately. Falling
    // back to the card itself rather than to the close button, which would put
    // "dismiss this" one Enter away from anyone who tabs in by reflex.
    const first = focusable()[0];
    (first ?? node).focus?.();

    function onKeydownTrap(e) {
      if (e.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      // Wrap at both ends. `document.activeElement` rather than `e.target`
      // because focus may be on the card itself, which is not in the list.
      if (e.shiftKey && (document.activeElement === firstItem || !node.contains(document.activeElement))) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    }

    node.addEventListener('keydown', onKeydownTrap);

    return {
      destroy() {
        node.removeEventListener('keydown', onKeydownTrap);
        // Back where they came from, if it is still there. A modal opened from
        // a grid tile should hand focus back to that tile, not to the top of
        // the document.
        if (previous instanceof HTMLElement && document.contains(previous)) previous.focus();
      },
    };
  }
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
  <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
  <div class="modal-card" bind:this={card} use:trap tabindex="-1">
    <header class="modal-card-head">
      <p class="modal-card-title" id={titleId}>{title}</p>
      {#if closable}
        <button class="delete" aria-label="close" onclick={() => onClose?.()}></button>
      {/if}
    </header>
    {#if onSubmit}
      <!--
        The body and the footer are one form, because the submit button lives in
        the footer and implicit submission only reaches a button inside the same
        form. `preventDefault` because there is nowhere to navigate to.

        `novalidate` is not optional. Wrapping these fields in a form switched on
        the browser's own constraint validation, which silently refuses to fire
        `submit` at all when an `<input type="email">` or a `type="number"` with
        a min is invalid — so the app's validation never ran, its messages never
        appeared, and the user got a native bubble that says less and cannot be
        styled or announced consistently. This app validates in
        `lib/validation/forms.js`, for every field, with messages written for it.
      -->
      <form novalidate onsubmit={(e) => { e.preventDefault(); onSubmit(); }}>
        <section class="modal-card-body">
          {@render children?.()}
        </section>
        <footer class="modal-card-foot">
          {@render footer?.()}
        </footer>
      </form>
    {:else}
      <section class="modal-card-body">
        {@render children?.()}
      </section>
      <footer class="modal-card-foot">
        {@render footer?.()}
      </footer>
    {/if}
  </div>
</div>
