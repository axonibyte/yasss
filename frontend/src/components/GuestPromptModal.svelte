<script>
  import { modals, guestAction } from '../stores.js';
</script>

<div class="modal is-active">
  <div class="modal-background" on:click={() => $modals.guestPrompt = false}></div>
  <div class="modal-card">
    <header class="modal-card-head">
      <p class="modal-card-title">Hey there friend!</p>
      <button class="delete" on:click={() => $modals.guestPrompt = false}></button>
    </header>
    <section class="modal-card-body">
      <p>Looks like you aren't logged in... but that's totally fine! You can proceed, but you won't be able to edit this later. Would you like to sign in?</p>
    </section>
    <footer class="modal-card-foot">
      <button class="button is-success" on:click={() => { $modals.guestPrompt = fasle; $guestAction.loginFn(); }}>Yes plase!</button>
      <button class="button is-danger" on:click={() => { $modals.guestPrompt = false; $guestAction.proceedFn(); }}>No thanks, I'm good!</button>
    </footer>
  </div>
</div>