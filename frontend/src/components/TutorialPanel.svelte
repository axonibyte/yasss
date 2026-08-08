<script>
  /**
   * The tutorial's docked step panel.
   *
   * **Deliberately not a modal.** Every other overlay in this app is a
   * `Modal.svelte`, which claims `aria-modal` and honours it with a real focus
   * trap. That is right for a dialog and wrong for this: the whole method here
   * is that the learner clicks the thing being described, so trapping focus in
   * the panel would make the tutorial the one surface where you cannot do what
   * it just told you to do.
   *
   * So: a `region`, docked, with the step text in a polite live region so a
   * screen reader hears each step without focus being taken from wherever the
   * learner put it. The anchor gets a highlight class and nothing more --
   * nothing outside is made `inert`, nothing is covered by a scrim.
   */
  import { renderMarkdownWithPrimaryLinks } from '../lib/markdown.js';

  let {
    /** Rendered markdown for the current step. */
    html = '',
    position = 1,
    total = 1,
    anchor = null,
    canGoBack = false,
    atEnd = false,
    onBack,
    onNext,
    onExit,
  } = $props();

  const rendered = $derived(renderMarkdownWithPrimaryLinks(html));

  /**
   * Put the highlight on the step's anchor, and take it off again.
   *
   * Queried per step rather than held as a reference: the grid re-renders as
   * the learner claims squares, so an element captured at step 3 may not be in
   * the document by step 4. A missing anchor is not an error -- the step simply
   * has nothing to point at, which is also the null case.
   */
  $effect(() => {
    if (!anchor) return undefined;
    const el = document.querySelector(anchor);
    if (!el) return undefined;
    el.classList.add('tutorial-anchor');
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return () => el.classList.remove('tutorial-anchor');
  });

  function onKeydown(e) {
    if (e.key === 'Escape') onExit?.();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<section
  id="tutorial-panel"
  class="tutorial-panel"
  role="region"
  aria-label="Tutorial"
>
  <div class="tutorial-panel-inner">
    <!--
      `aria-live` on the wrapper rather than on the text itself: replacing the
      element a live region lives on is how announcements get missed, so the
      announcing container has to outlive its contents.
    -->
    <div class="content is-small" aria-live="polite" data-testid="tutorial-step">
      <!-- eslint-disable-next-line svelte/no-at-html-tags -- operator-authored config, not user input -->
      {@html rendered}
    </div>

    <div class="tutorial-panel-controls">
      <p class="is-size-7 has-text-weight-semibold" data-testid="tutorial-position">
        Step {position} of {total}
      </p>
      <div class="buttons are-small">
        <button class="button" onclick={onExit}>Exit tutorial</button>
        <button class="button" disabled={!canGoBack} onclick={onBack}>Back</button>
        <button class="button is-primary" onclick={atEnd ? onExit : onNext}>
          {atEnd ? 'Finish' : 'Next'}
        </button>
      </div>
    </div>
  </div>
</section>
