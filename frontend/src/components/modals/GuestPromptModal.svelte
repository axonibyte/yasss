<script>
  /**
   * Offers an anonymous user the chance to sign in before doing something they
   * will not be able to edit afterwards.
   *
   * docs/legacy/02-aesthetics.md §2.11. Two contexts share the modal; the
   * legacy selected between them by toggling paragraph visibility by class.
   */
  import Modal from './Modal.svelte';

  /**
   * @type {{ context: 'publish'|'voladd', noun?: string, onSignIn: () => void,
   *          onProceed: () => void, onClose: () => void }}
   */
  let { context, noun = 'event', onSignIn, onProceed, onClose } = $props();

  // The modal is shared with the poll flow, where every mention of "event" read
  // as though the wrong button had been pressed -- at the one moment the
  // decision is irreversible. Defaulted to `event` so the two event call sites
  // are untouched.
  const article = $derived(/^[aeiou]/i.test(noun) ? 'an' : 'a');
</script>

<Modal title="Hey there friend!" {onClose}>
  <p class="mb-4">Looks like you aren't logged in... but that's totally fine!</p>

  {#if context === 'publish'}
    <p class="mb-4">
      You can absolutely publish {article} {noun} without creating an account.
      But, it means you won't be able to go back and edit your {noun}
      submission.
    </p>
  {:else}
    <p class="mb-4">
      You're more than welcome to add a volunteer without creating an account.
      But, it means you won't be able to go back and edit details after you've
      finished signing up.
    </p>
  {/if}

  <p>
    Would you like to sign in or create an account so you can go back and edit
    your {noun} later?
  </p>

  {#snippet footer()}
    <div class="buttons">
      <button class="button is-success" onclick={onSignIn}>Yes please!</button>
      <button class="button is-danger" onclick={onProceed}>No thanks, I'm good!</button>
    </div>
  {/snippet}
</Modal>
