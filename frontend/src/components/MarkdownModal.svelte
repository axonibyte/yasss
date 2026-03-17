<script>
  import { onMount } from 'svelte';
  import { modals, markdownContent } from '../stores.js';

  let htmlContent = 'Loading...';

  onMount(async() => {
    const res = await fetch($markdownContent.url);
    const md = await res.text();
    const converter = new window.showdown.Converter();
    htmlContent = converter.makeHtml(md);
  });
</script>

<div class="modal is-active">
  <div class="modal-background" on:click={() => $modals.markdown = false}></div>
  <div class="modal-card">
    <header class="modal-card-head">
      <p class="modal-card-title">{$markdownContent.title}</p>
      <button class="delete" on:click={() => $modals.markdown = false}></button>
    </header>
    <section class="modal-card-body">
      <div class="content">{@html htmlContent}</div>
    </section>
  </div>
</div>