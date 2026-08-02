<script>
  /**
   * The event's public URL. docs/legacy/02-aesthetics.md §2.1.
   *
   * The query-parameter form is not cosmetic — the server has no SPA fallback,
   * and its own emails link to exactly this shape.
   */
  import Modal from './Modal.svelte';
  import { toastSuccess, toastDanger } from '../../state/toast.js';

  let { url, onClose } = $props();

  let input = $state(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toastSuccess('Copied!');
    } catch {
      // Clipboard access can be denied; selecting the text is the fallback.
      input?.select();
      toastDanger("Couldn't copy automatically — the link is selected for you.");
    }
  }
</script>

<Modal title="Share this event!" {onClose}>
  <p class="mb-4">You can visit this event by visiting the URL below:</p>
  <div class="field">
    <div class="control">
      <input
        bind:this={input}
        class="input is-primary"
        type="text"
        readonly
        placeholder="Event URL"
        value={url}
        aria-label="Event URL"
      />
    </div>
  </div>

  {#snippet footer()}
    <div class="buttons">
      <button class="button is-success" onclick={copy}>Copy to Clipboard</button>
    </div>
  {/snippet}
</Modal>
