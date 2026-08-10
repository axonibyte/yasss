<script>
  /**
   * Which tutorial, before any of it starts.
   *
   * One per newcomer, and they arrive by different doors: the organizer is on
   * the landing page deciding whether this tool does what they need; the
   * volunteer is holding a link somebody sent them and has never seen the
   * landing page at all; the builder already knows what it does and wants to
   * know what every switch means; and the poll organizer came for the other
   * feature entirely. Asking is cheaper than guessing -- and guessing wrong
   * means the first thing a volunteer is taught is how to build something they
   * will never build.
   *
   * Rendered from `TRACKS` rather than listed here, so a new track appears in
   * the chooser by existing rather than by somebody remembering this file.
   */
  import Modal from './modals/Modal.svelte';
  import { TRACKS } from '../state/tutorial.svelte.js';

  let { onChoose, onClose } = $props();
</script>

<Modal title="What would you like to learn?" {onClose}>
  <div class="content">
    <p>Each takes a couple of minutes, and nothing you do is saved.</p>
    <div class="buttons is-centered mt-4">
      {#each Object.entries(TRACKS) as [track, meta], i (track)}
        <!--
          Equal in weight, so they share a colour and differ in fill. Bulma's
          link blue is not in this platform's palette and read as a stray
          control from another app.
        -->
        <button
          class="button is-primary"
          class:is-outlined={i > 0}
          data-testid={`tutorial-track-${track}`}
          onclick={() => onChoose(track)}
        >{meta.label}</button>
      {/each}
    </div>
  </div>
</Modal>
