<script>
  /**
   * The public URL of an event, or of a poll. docs/legacy/02-aesthetics.md §2.1.
   *
   * The query-parameter form is not cosmetic — the server has no SPA fallback,
   * and its own emails link to exactly this shape.
   *
   * `noun` exists because this sheet is now shared with polls and said "event"
   * three times, including in two accessible names. It defaults to `event`, so
   * the event case is unchanged down to the announced label -- which is what
   * the existing specs assert, and what anybody using a screen reader has
   * already learned.
   */
  import Modal from './Modal.svelte';
  import { toastSuccess, toastDanger } from '../../state/toast.js';
  import { formatCode } from '../../lib/eventCode.js';

  let { url, code = null, noun = 'event', onClose } = $props();

  /** Sentence-initial, for the two places the noun starts a phrase. */
  const Noun = $derived(noun.charAt(0).toUpperCase() + noun.slice(1));

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
    <p class="mb-2">Anyone can find this {noun} with its code:</p>
    <div class="field">
      <div class="control">
        <!--
          The test hook keeps its original name even though the sheet is now
          shared with polls: it is a selector rather than copy, three specs
          point at it, and renaming it would buy nothing.
        -->
        <input
          bind:this={codeInput}
          class="input is-primary is-large has-text-centered has-text-weight-bold"
          type="text"
          readonly
          value={pretty}
          aria-label="{Noun} code"
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
        placeholder="{Noun} URL"
        value={url}
        aria-label="{Noun} URL"
      />
    </div>
  </div>

  {#snippet footer()}
    <div class="buttons">
      <button class="button is-success" onclick={copy}>Copy to Clipboard</button>
    </div>
  {/snippet}
</Modal>
