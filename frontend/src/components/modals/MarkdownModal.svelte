<script>
  /**
   * Renders one of the operator-authored texts (terms, privacy).
   *
   * The legacy never populated this modal's title, so both documents opened
   * with an empty header bar (behavior §6.26f).
   */
  import Modal from './Modal.svelte';
  import { getText } from '../../lib/api/index.js';
  import { renderMarkdownWithPrimaryLinks } from '../../lib/markdown.js';
  import { toastError } from '../../state/toast.js';

  let { title, textId, onClose } = $props();

  let html = $state('');
  let loading = $state(true);

  $effect(() => {
    let canceled = false;
    getText(textId)
      .then((src) => { if (!canceled) html = renderMarkdownWithPrimaryLinks(src); })
      // The legacy had no failure path here at all, so a fetch error left the
      // modal blank with no explanation.
      .catch((e) => { if (!canceled) toastError(e, "Couldn't load that document, sorry."); })
      .finally(() => { if (!canceled) loading = false; });
    return () => { canceled = true; };
  });
</script>

<Modal {title} {onClose}>
  <div class="content">
    {#if loading}
      <progress class="progress is-small is-primary" max="100">Loading</progress>
    {:else}
      <!-- eslint-disable-next-line svelte/no-at-html-tags -- operator-authored config, not user input -->
      {@html html}
    {/if}
  </div>
</Modal>
