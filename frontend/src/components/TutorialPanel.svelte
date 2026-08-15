<script>
  /**
   * The tutorial's docked step panel.
   *
   * **Deliberately not a modal.** Every other overlay in this app is a
   * `Modal.svelte`, which claims `aria-modal` and honors it with a real focus
   * trap. That is right for a dialog and wrong for this: the whole method here
   * is that the learner clicks the thing being described, so trapping focus in
   * the panel would make the tutorial the one surface where you cannot do what
   * it just told you to do.
   *
   * So: a docked `region` -- which is what a `<section>` with an accessible name
 * already is, hence no explicit role; stating it again is what the compiler
 * warns about -- with the step text in a polite live region so a
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
   *
   * `querySelectorAll`, not `querySelector`. Some of what a step describes is
   * not one element: "every column is a day" is four columns, and marking the
   * first match meant marking the whole table instead -- which included the
   * time axis and the blank corner, neither of which is a day. A step that
   * genuinely points at one thing writes a selector that matches one thing.
   *
   * The retry is for the steps that open a modal. The panel and the modal are
   * driven by two different effects off the same step change, so on the flush
   * where the step advances the modal's fields may not be mounted yet; without
   * a second look those steps would silently highlight nothing.
   */
  $effect(() => {
    if (!anchor) return undefined;

    let marked = [];
    const clear = () => {
      for (const el of marked) el.classList.remove('tutorial-anchor');
      marked = [];
    };
    const mark = () => {
      marked = [...document.querySelectorAll(anchor)];
      for (const el of marked) el.classList.add('tutorial-anchor');
      // The first one, so a multi-element anchor scrolls to the top of the set
      // rather than to whichever of them happens to be last.
      //
      // Instant, not smooth. A smooth scroll is asynchronous, so for the few
      // hundred milliseconds it animates, the step's words are on screen and
      // the thing they describe is not -- which is the exact failure this tour
      // was rewritten to remove, and which tutorial-audit.spec.js flags on four
      // steps across four tracks. The animation was never load-bearing; landing
      // together with the copy is.
      marked[0]?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      return marked.length > 0;
    };

    let frame = 0;
    if (!mark()) frame = requestAnimationFrame(() => { frame = 0; mark(); });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      clear();
    };
  });

  function onKeydown(e) {
    if (e.key === 'Escape') onExit?.();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<section
  id="tutorial-panel"
  class="tutorial-panel"
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
        <!--
          On the last step Finish and Exit did the same thing, side by side,
          which asks the reader to work out the difference between two buttons
          that have none. Exit is for leaving early; once there is nothing left
          to leave, Finish is the only sensible word for it.
        -->
        {#if !atEnd}
          <button class="button" onclick={onExit}>Exit tutorial</button>
        {/if}
        <button class="button" disabled={!canGoBack} onclick={onBack}>Back</button>
        <button class="button is-primary" onclick={atEnd ? onExit : onNext}>
          {atEnd ? 'Finish' : 'Next'}
        </button>
      </div>
    </div>
  </div>
</section>
