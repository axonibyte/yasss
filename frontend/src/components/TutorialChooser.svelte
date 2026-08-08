<script>
  /**
   * Which tutorial, before any of it starts.
   *
   * Two tracks because there are two newcomers and they arrive by different
   * doors: the organiser is on the landing page deciding whether this tool does
   * what they need, and the volunteer is holding a link somebody sent them and
   * has never seen the landing page at all. Asking is cheaper than guessing --
   * and guessing wrong means the first thing a volunteer is taught is how to
   * build something they will never build.
   */
  import Modal from './modals/Modal.svelte';

  let { onChoose, onClose } = $props();
</script>

<Modal title="What would you like to learn?" {onClose}>
  <div class="content">
    <p>Both take a couple of minutes, and nothing you do is saved.</p>
    <div class="buttons is-centered mt-4">
      <button
        class="button is-primary"
        data-testid="tutorial-track-organiser"
        onclick={() => onChoose('organiser')}
      >
        I want to organise something
      </button>
      <button
        class="button is-link"
        data-testid="tutorial-track-volunteer"
        onclick={() => onChoose('volunteer')}
      >
        Somebody sent me a link
      </button>
    </div>
  </div>
</Modal>
