<script>
  /**
   * Consumes an emailed reset link: `?action=reset-user&user=…&token=…`.
   *
   * The new keypair derives from the password alone — the empty scrypt salt
   * means the email is not an input — so this signs with an empty address, as
   * the legacy did.
   */
  import Modal from './Modal.svelte';
  import Field from '../inputs/Field.svelte';
  import LoadingButton from '../inputs/LoadingButton.svelte';
  import { toastSuccess, toastError } from '../../state/toast.js';
  import { validatePasswordReset } from '../../lib/validation/forms.js';
  import { genCreds } from '../../lib/crypto/creds.js';
  import * as api from '../../lib/api/index.js';

  let { userId, token, onClose, requestCaptcha } = $props();

  let password = $state('');
  let confirmPassword = $state('');
  let errors = $state({});
  let busy = $state(false);

  const clearError = (f) => { if (errors[f]) errors = { ...errors, [f]: undefined }; };

  async function save() {
    const verdict = validatePasswordReset({ password, confirmPassword });
    errors = verdict.errors;
    if (!verdict.ok) return;

    busy = true;
    try {
      const captcha = await requestCaptcha();
      const { pubkey } = await genCreds('', verdict.values.password);
      await api.applyPasswordReset(userId, token, pubkey, captcha);
      toastSuccess('Successfully reset your account!');
      onClose?.();
    } catch (e) {
      toastError(e, "Couldn't reset your account... sorry.");
    } finally {
      busy = false;
    }
  }
</script>

<Modal title="Choose a New Password" onClose={onClose}>
  <Field label="New password" error={errors.password} id="reset-password">
    <input
      id="reset-password"
      class="input"
      class:is-danger={errors.password}
      type="password"
      bind:value={password}
      oninput={() => clearError('password')}
    />
  </Field>

  <Field label="Please confirm your password." error={errors.confirmPassword} id="reset-confirm">
    <input
      id="reset-confirm"
      class="input"
      class:is-danger={errors.confirmPassword}
      type="password"
      bind:value={confirmPassword}
      oninput={() => clearError('confirmPassword')}
    />
  </Field>

  {#snippet footer()}
    <div class="buttons">
      <LoadingButton variant="is-info" loading={busy} onclick={save}>Reset Password</LoadingButton>
    </div>
  {/snippet}
</Modal>
