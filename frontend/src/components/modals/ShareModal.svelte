<script>
  /**
   * The event's public URL. docs/legacy/02-aesthetics.md §2.1.
   *
   * The query-parameter form is not cosmetic — the server has no SPA fallback,
   * and its own emails link to exactly this shape.
   */
  import Modal from './Modal.svelte';
  import { toastSuccess, toastDanger } from '../../state/toast.js';
  import { formatCode } from '../../lib/eventCode.js';

  let { url, code = null, onClose } = $props();

  let input = $state(null);
  let codeInput = $state(null);

  /** `XXXX-XXXX`. The hyphen is display only; the server stores neither it nor case. */
  const pretty = $derived(formatCode(code));

  async function copyText(text, el) {
    try {
      await navigator.clipboard.writeText(text);
      toastSuccess('Copied!');
    } catch {
      // Clipboard access can be denied; selecting the text is the fallback.
      el?.select();
      toastDanger("Couldn't copy automatically — it's selected for you.");
    }
  }

  const copy = () => copyText(url, input);
  const copyCode = () => copyText(pretty, codeInput);
</script>

<Modal title="Share this event!" {onClose}>
  {#if pretty}
    <!--
      The code first, deliberately. It is the half anyone can read down a
      telephone, write on a whiteboard or print on a flyer; the URL is for
      pasting.
    -->
    <p class="mb-2">Anyone can find this event with its code:</p>
    <div class="field">
      <div class="control">
        <input
          bind:this={codeInput}
          class="input is-primary is-large has-text-centered has-text-weight-bold"
          type="text"
          readonly
          value={pretty}
          aria-label="Event code"
          data-testid="event-code"
        />
      </div>
      <p class="help">Case and punctuation do not matter — {pretty.toLowerCase()} works too.</p>
    </div>
    <button class="button is-small is-light mb-4" onclick={copyCode}>Copy the code</button>
  {/if}

  <p class="mb-4">Or by visiting the URL below:</p>
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
