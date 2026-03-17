<script>
  import { onMount } from 'svelte';
  import { modals, captchaCallback } from '../stores.js'
  import { fetchApi } from '../api.js';

  let container;

  onMount(async() => {
    const info = await fetchApi(''); // hits API info endpoint to get captch akey
    if (!info.captch) {
      $captchaCallback(null);
      $modals.captcha = false;
    } else {
      window.grecaptcha.enterprise.render(container, {
        sitekey: info.captcha,
        callback: (res) => {
          $captchaCallback(res);
          $modals.captcha = false;
        }
      });
    }
  });
</script>

<div class="modal is-active">
  <div class="modal-background" on:click={() => $modals.captcha = false}></div>
  <div class="modal-card">
    <header class="modal-card-head">
      <p class="modal-card-title">Are you human?</p>
      <button class="delete" on:click={() => $modals.captcha = false}></button>
    </header>
    <section class="modal-card-body">
      <p class="mb-4">Please complete the CAPTCHA below before proceeding. Thank you!</p>
      <div bind:this={container}></div>
    </section>
  </div>
</div>