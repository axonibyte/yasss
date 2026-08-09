<script>
  /**
   * Change the account's email address and/or password.
   *
   * Both fields are optional; submitting an empty form is a no-op. The legacy
   * returned `true` synchronously here, so the modal closed before the PATCH
   * resolved and a failure surfaced as a toast behind an already-dismissed
   * dialog (behavior §6.26a). This awaits the request and closes on success.
   */
  import Modal from './Modal.svelte';
  import Field from '../inputs/Field.svelte';
  import { fieldAria, focusFirstError } from '../../lib/a11y.js';
  import LoadingButton from '../inputs/LoadingButton.svelte';
  import { session } from '../../state/session.svelte.js';
  import { toastSuccess, toastError } from '../../state/toast.js';
  import { validateProfileUpdate } from '../../lib/validation/forms.js';
  import { genCreds } from '../../lib/crypto/creds.js';
  import * as api from '../../lib/api/index.js';
  import { isSupported, register as createPasskey } from '../../lib/crypto/webauthn.js';

  let { onClose } = $props();

  let currentEmail = $state('');
  let email = $state('');
  let password = $state('');
  let confirmPassword = $state('');
  let errors = $state({});
  let busy = $state(false);

  let passkeys = $state([]);
  let passkeysOffered = $state(false);
  let passkeyBusy = $state(false);

  async function refreshPasskeys() {
    if (!session.account) return;
    try {
      const res = await api.listPasskeys(session.account);
      passkeys = res.passkeys ?? [];
      passkeysOffered = isSupported();
    } catch {
      // A server too old to know about passkeys, or one whose relying party did not
      // resolve. Either way the section simply does not appear.
      passkeysOffered = false;
    }
  }

  $effect(() => { refreshPasskeys(); });

  async function addPasskey() {
    passkeyBusy = true;
    try {
      const options = await api.beginPasskeyRegistration(session.account);
      const created = await createPasskey(options);
      // Canceled. Not an error, and not worth a toast.
      if (!created) return;
      await api.finishPasskeyRegistration(session.account, created);
      toastSuccess('Passkey added.');
      await refreshPasskeys();
    } catch (e) {
      toastError(e, 'That passkey could not be added.');
    } finally {
      passkeyBusy = false;
    }
  }

  async function dropPasskey(id) {
    passkeyBusy = true;
    try {
      await api.removePasskey(session.account, id);
      toastSuccess('Passkey removed.');
      await refreshPasskeys();
    } catch (e) {
      toastError(e, 'That passkey could not be removed.');
    } finally {
      passkeyBusy = false;
    }
  }

  $effect(() => {
    let canceled = false;
    api.getUser(session.account)
      .then((res) => { if (!canceled) currentEmail = res.user?.email ?? ''; })
      .catch(() => { /* the placeholder just stays empty */ });
    return () => { canceled = true; };
  });

  const clearError = (f) => { if (errors[f]) errors = { ...errors, [f]: undefined }; };

  async function save() {
    const verdict = validateProfileUpdate({ email, password, confirmPassword });
    errors = verdict.errors;
    if (!verdict.ok) {
      focusFirstError();
      return;
    }

    const changes = {};
    if (verdict.values.email) changes.email = verdict.values.email;
    if (verdict.values.password) {
      // The keypair derives from the password alone, but sign with whichever
      // address will be current so the payload matches the account.
      const { pubkey } = await genCreds(
        verdict.values.email ?? currentEmail, verdict.values.password);
      changes.pubkey = pubkey;
    }

    if (Object.keys(changes).length === 0) {
      onClose?.();
      return;
    }

    busy = true;
    try {
      await api.updateUser(session.account, changes);
      toastSuccess('Successfully updated your profile!');
      onClose?.();
    } catch (e) {
      toastError(e, "Couldn't update your profile... sorry.");
    } finally {
      busy = false;
    }
  }
</script>

<Modal title="Update Your Profile" {onClose} onSubmit={save}>
  {#if passkeysOffered}
    <div class="field">
      <!-- svelte-ignore a11y_label_has_associated_control -->
      <label class="label">Passkeys</label>
      {#if passkeys.length === 0}
        <p class="help">
          A passkey signs you in with your device's screen lock instead of a password, and
          cannot be phished.
        </p>
      {:else}
        <ul class="block-list is-small">
          {#each passkeys as passkey (passkey.id)}
            <li>
              {passkey.label ?? 'Passkey'}
              <span class="has-text-grey is-size-7">
                {#if passkey.backupState}synced{:else}this device only{/if}
              </span>
              <button
                type="button"
                class="button is-small is-danger is-light is-pulled-right"
                disabled={passkeyBusy}
                onclick={() => dropPasskey(passkey.id)}
              >Remove</button>
            </li>
          {/each}
        </ul>
      {/if}
      <button
        type="button"
        class="button is-small"
        disabled={passkeyBusy}
        onclick={addPasskey}
      >Add a passkey</button>
    </div>
    <hr />
  {/if}

  <Field label="Change your email address?" error={errors.email} id="profile-email">
    <input
      id="profile-email"
      {...fieldAria('profile-email', errors.email)}
      class="input"
      class:is-danger={errors.email}
      type="email"
      placeholder={currentEmail || 'me@email.tld'}
      bind:value={email}
      oninput={() => clearError('email')}
      onblur={() => { email = email.trim().toLowerCase(); }}
    />
  </Field>

  <!--
    This field was passed no `error` prop at all, so a password rule could
    never have shown here even once there was one to break.
  -->
  <Field label="Change your password?" error={errors.password} id="profile-password">
    <input
      id="profile-password"
      {...fieldAria('profile-password', errors.password)}
      class="input"
      class:is-danger={errors.password}
      type="password"
      bind:value={password}
      oninput={() => clearError('password')}
    />
  </Field>

  {#if password.length > 0}
    <Field label="Please confirm your password." error={errors.confirmPassword} id="profile-confirm">
      <input
        id="profile-confirm"
        {...fieldAria('profile-confirm', errors.confirmPassword)}
        class="input"
        class:is-danger={errors.confirmPassword}
        type="password"
        bind:value={confirmPassword}
        oninput={() => clearError('confirmPassword')}
      />
    </Field>
  {/if}

  {#snippet footer()}
    <div class="buttons">
      <LoadingButton type="submit" variant="is-info" loading={busy}>Update Profile</LoadingButton>
    </div>
  {/snippet}
</Modal>
