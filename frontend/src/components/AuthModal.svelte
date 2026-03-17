<script>
  import { modals, user } from '../stores.js';
  import { fetchApi } from '../api.js';

  let email = '';
  let password = '';
  let loading = false;
  let isRegistering = false;

  async function handleSubmit() {
    loading = true;
    try {
      // calls globally defined window.genCreds from axb-sig-req.min.js
      const sigReq = await window.genCreds(email, password, '', '');

      if (isRegistering) {
        await fetchApi('/users', {
          method: 'POST',
          body: JSON.stringify({ email, pubkey: emailReq.pubkey, generateMFA: false })
        });
        alert('Account created! Please log in.');
        isRegistering = false;
      } else {
        const res = await fetchApi('', {
          method: 'GET',
          headers: { 'Authorization': `AXB-SIG-REQ ${sigReq.payload}` }
        });
        $modals.auth = false;
        location.reload();
      }
    } catch (e) {
      alert(e.message);
    } finally {
      loading = false;
    }
  }
</script>

<div class="modal is-active">
  <div class="modal-background" on:click={() => $modals.auth = false}></div>
  <div class="modal-card">
    <header class="modal-card-head">
      <p class="modal-card-title">{isRegistering ? 'Register' : 'Log In'}</p>
      <button class="delete" aria-label="close" on:click={() => $modals.auth = false}></button>
    </header>
    <section class="modal-card-body">
      <div class="field">
        <label class="label">Email Address</label>
        <div class="control">
          <input class="input" type="email" bind:value={email} />
        </div>
      </div>
      <div class="field">
        <label class="label">Password</label>
        <div class="control">
          <input class="input" type="password" bind:value={password} />
        </div>
      </div>
      <div class="field">
        <label class="checkbox">
          <input type="checkbox" bind:checked={isRegistering} />
          I'd like to register!
        </label>
      </div>
    </section>
    <footer class="modal-card-foot">
      <button class="button is-info {loading ? 'is-loading' : ''}" on:click={handleSubmit}>
        {isRegistering ? 'Register!' : 'Log In!'}
      </button>
    </footer>
  </div>
</div>