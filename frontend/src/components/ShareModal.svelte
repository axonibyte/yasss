<script>
  import { modals, currentEvent } from '../stores.js';
  import { showToast } from '../toast.js';

  $: shareUrl = `${window.location.origin}?event=${$currentEvent.summary.id}`;

  function copyToClipboard() {
    navigator.clipboard.writeText(shareUrl);
    showToast('Copied!', 'is-success');
    $modals.share = false;
  }
</script>

<div class="modal is-active">
  <div class="modal-background" on:click={() => $modals.share = false}></div>
  <div class="modal-card">
    <header class="modal-card-head">
      <p class="modal-card-title">Share this event!</p>
      <button class="delete" on:click={() => $modals.share = false}></button>
    </header>
    <section class="modal-card-body">
      <p class="mb-4">You can visit this event by visiting the URL below:</p>
      <input class="input is-primary" type="text" readonly value={shareUrl} />
    </section>
    <footer class="modal-card-foot">
      <button class="button is-success" on:click={copyToClipboard}>Copy to Clipboard</button>
    </footer>
  </div>
</div>