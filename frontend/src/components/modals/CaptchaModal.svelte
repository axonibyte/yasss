<script>
  /**
   * Presents a reCAPTCHA checkbox and resolves with a token.
   *
   * A fallback, not the usual path. A policy-based challenge key mints its
   * token through `execute()` and shows the visitor nothing unless its own
   * policy says otherwise, so this is only reached when the deployment turns
   * out to hold a checkbox key -- which `requireCaptcha` discovers by trying
   * the other way first.
   *
   * Only ever mounted when the server reported a site key and the visitor is
   * anonymous; `requireCaptcha` short-circuits otherwise.
   */
  import Modal from './Modal.svelte';
  import { renderWidget } from '../../lib/captcha.js';

  let { onToken, onCancel } = $props();

  let container = $state(null);
  let failed = $state(null);

  $effect(() => {
    if (!container) return;
    let canceled = false;
    renderWidget(container)
      .then((token) => { if (!canceled) onToken?.(token); })
      .catch((e) => { if (!canceled) failed = e.message; });
    return () => { canceled = true; };
  });
</script>

<Modal title="Are you human?" onClose={onCancel}>
  <p class="mb-4">
    Please forgive the intrusion, but we just want to make sure that you're
    human and not a bot trying to cause us grief. We'd be very grateful if you
    would please complete the CAPTCHA below before proceeding. Thank you!
  </p>
  <div bind:this={container}></div>
  {#if failed}
    <p class="help is-danger mt-3">{failed}</p>
  {/if}

  {#snippet footer()}
    <p>Thank you for helping us out!</p>
  {/snippet}
</Modal>
