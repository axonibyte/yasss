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

  let { onClose } = $props();

  let currentEmail = $state('');
  let email = $state('');
  let password = $state('');
  let confirmPassword = $state('');
  let errors = $state({});
  let busy = $state(false);

  $effect(() => {
    let cancelled = false;
    api.getUser(session.account)
      .then((res) => { if (!cancelled) currentEmail = res.user?.email ?? ''; })
      .catch(() => { /* the placeholder just stays empty */ });
    return () => { cancelled = true; };
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
