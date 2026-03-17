<script>
  import { modals, user } from '../stores.js';
  import { fetchApi } from '../api.js';
  import { showToast } from '../toast.js';

  let email = $user?.email || '';
  let password = '';
  let confirm = '';
  let loading = false;

  async function updateProfile() {
    if (password && password !== confirm)
      return showToast('Passwords do not match.', 'is-danger');
    loading = true;
    try {
      let payload = {};
      if (email !== $user.email) payload.email = email;
      if (password) {
        const sigReq = await window.genCreds(email, password, '', '');
        payload.pubkey = sigReq.pubkey;
      }
      if (Object.keys(payload).length > 0) {
        await fetchApi(`/users/${$user.account}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
        showToast('Profile updated!', 'is-success');
      }
      $modals.profile = false;
    } catch (e) {
      showToast(e.message, 'is-danger');
    } finally {
      loading = false;
    }
  }
</script>

<div class="modal is-active">
  <div class="modal-background" on:click={() => $modals.profile = false}></div>
  <div class="modal-card">
    <header class="modal-card-head">
      <p class="modal-card-title">Update Profile</p>
      <button class="delete" on:click={() => $modals.profile = false}></button>
    </header>
    <section class="modal-card-body">
      <div class="field">
        <label class="label">Email</label>
        <input class="input" type="email" bind:value={email} />
      </div>
      <div class="field">
        <label class="label">New Password</label>
        <input class="input" type="password" bind:value={password} />
      </div>
      {#if password}
        <div class="field">
          <label class="label">Confirm Password</label>
          <input class="input" type="password" bind:value={confirm} />
        </div>
      {/if}
    </section>
    <footer class="modal-card-foot">
      <button class="button is-info {loading ? 'is-loading' : ''}" on:click={updateProfile}>Update</button>
    </footer>
  </div>
</div>