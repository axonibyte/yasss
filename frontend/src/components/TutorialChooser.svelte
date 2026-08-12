<script>
  /**
   * Which tutorial, before any of it starts.
   *
   * Asked in two questions rather than one, because the honest first question
   * is not "which tour" but "which side of this are you on". A newcomer knows
   * immediately whether they are running the thing or invited to it; they do
   * not yet know whether they want a poll or an event, because those are our
   * words, not theirs.
   *
   * So: organizing or attending, and then -- only once that is settled -- do
   * you already know when it happens, or are you still working that out. Both
   * of those are questions somebody can answer about their own life without
   * knowing anything about this product.
   *
   * The flat list this replaced offered four peers, two of which ("I'm
   * organizing an event", "Show me every event setting") were the same person
   * at different depths, and asked them to choose before they could know.
   *
   * Rendered from `GROUPS` and `TRACKS` rather than listed here, so a new track
   * appears by existing rather than by somebody remembering this file.
   */
  import Modal from './modals/Modal.svelte';
  import { GROUPS, tracksIn } from '../state/tutorial.svelte.js';

  let { onChoose, onClose } = $props();

  /** Which group is open, or null while the first question stands. */
  let group = $state(null);

  const heading = $derived(
    group === null ? 'What would you like to learn?' : GROUPS[group].label,
  );
</script>

<Modal title={heading} {onClose}>
  <div class="content">
    {#if group === null}
      <p>Each takes a couple of minutes, and nothing you do is saved.</p>
      <div class="buttons is-centered mt-4">
        {#each Object.entries(GROUPS) as [key, meta], i (key)}
          <!--
            Equal in weight, so they share a color and differ in fill. Bulma's
            link blue is not in this platform's palette and read as a stray
            control from another app.

            `is-fullwidth` so they stack into readable full-width rows on a
            phone instead of wrapping mid-sentence into a ragged block.
          -->
          <button
            class="button is-primary is-fullwidth"
            class:is-outlined={i > 0}
            data-testid={`tutorial-group-${key}`}
            onclick={() => { group = key; }}
          >{meta.label}</button>
        {/each}
      </div>
    {:else}
      <p>Which of these is closer?</p>
      <div class="buttons is-centered mt-4">
        {#each tracksIn(group) as [track, meta], i (track)}
          <button
            class="button is-primary is-fullwidth"
            class:is-outlined={i > 0}
            data-testid={`tutorial-track-${track}`}
            onclick={() => onChoose(track)}
          >{meta.label}</button>
        {/each}
      </div>
      <!--
        A way back, because the first question is easy to answer wrongly and
        the modal's only other exit discards the whole thing.
      -->
      <p class="has-text-centered">
        <button
          class="button is-ghost is-small"
          data-testid="tutorial-back"
          onclick={() => { group = null; }}
        >← That's not me</button>
      </p>
    {/if}
  </div>
</Modal>
