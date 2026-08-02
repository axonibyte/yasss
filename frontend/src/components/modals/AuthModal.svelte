<script>
  /**
   * Log in / register / request a credential reset.
   *
   * One modal covering three flows, as the legacy did — a switch flips the
   * title, swaps the footer buttons and reveals the confirmation field
   * (docs/legacy/02-aesthetics.md §2.9). The `toggle-auth-confirm-pass` class
   * protocol that drove it imperatively becomes ordinary conditionals here.
   */
  import Modal from './Modal.svelte';
  import Field from '../inputs/Field.svelte';
  import LoadingButton from '../inputs/LoadingButton.svelte';
  import { session } from '../../state/session.svelte.js';
  import { toastSuccess, toastInfo, toastError } from '../../state/toast.js';
  import { validateLogin, validateRegistration } from '../../lib/validation/forms.js';
  import { genCreds } from '../../lib/crypto/creds.js';
  import * as api from '../../lib/api/index.js';

  let { onClose, onLoggedIn, requestCaptcha } = $props();

  let registering = $state(false);
  let email = $state('');
  let password = $state('');
  let confirmPassword = $state('');
  let errors = $state({});
  let busy = $state(false);

  const clearError = (field) => {
    if (errors[field]) errors = { ...errors, [field]: undefined };
  };

  async function logIn() {
    const verdict = validateLogin({ email, password });
    errors = verdict.errors;
    if (!verdict.ok) return;

    busy = true;
    try {
      await session.login(verdict.values.email, verdict.values.password);
      toastSuccess('Logged in!');
      onLoggedIn?.();
      onClose?.();
    } catch (e) {
      toastError(e, 'Invalid credentials. Try again?');
    } finally {
      busy = false;
    }
  }

  async function register() {
    const verdict = validateRegistration({ email, password, confirmPassword });
    errors = verdict.errors;
    if (!verdict.ok) return;

    busy = true;
    try {
      const captcha = await requestCaptcha();
      const { pubkey } = await genCreds(verdict.values.email, verdict.values.password);
      await api.registerUser(verdict.values.email, pubkey, captcha);
      toastSuccess('Your new account was successfully created :)');
      onClose?.();
    } catch (e) {
      toastError(e, 'We ran into an issue creating your account.');
    } finally {
      busy = false;
    }
  }

  async function requestReset() {
    // Deliberately vague, and deliberately identical whether or not the account
    // exists — the response must not confirm whether an address is registered.
    const address = email.trim().toLowerCase();
    if (address === '') {
      errors = { email: 'Please specify a valid email address.' };
      return;
    }

    busy = true;
    try {
      const captcha = await requestCaptcha();
      await api.requestPasswordReset(address, captcha);
    } catch {
      // swallowed on purpose; see above
    } finally {
      busy = false;
      toastInfo(
        `If an account with the email address ${address} exists, a reset email will be sent.`);
      onClose?.();
    }
  }
</script>

<Modal title={registering ? 'Register' : 'Log In'} {onClose}>
  <Field label="Email Address" error={errors.email} id="auth-email">
    <input
      id="auth-email"
      class="input"
      class:is-danger={errors.email}
      type="email"
      placeholder="What's your email address?"
      bind:value={email}
      oninput={() => clearError('email')}
      onblur={() => { email = email.trim().toLowerCase(); }}
    />
  </Field>

  <Field label="Password" error={errors.password} id="auth-password">
    <input
      id="auth-password"
      class="input"
      class:is-danger={errors.password}
      type="password"
      bind:value={password}
      oninput={() => clearError('password')}
    />
  </Field>

  <div class="field">
    <div class="control">
      <input
        id="auth-new-account"
        type="checkbox"
        class="switch"
        bind:checked={registering}
      />
      <label class="switch" for="auth-new-account">Click here if you'd like to register!</label>
    </div>
  </div>

  {#if registering}
    <Field error={errors.confirmPassword} id="auth-confirm">
      <input
        id="auth-confirm"
        class="input"
        class:is-danger={errors.confirmPassword}
        type="password"
        placeholder="Please confirm your password."
        bind:value={confirmPassword}
        oninput={() => clearError('confirmPassword')}
      />
    </Field>
  {/if}

  {#snippet footer()}
    <div class="buttons">
      {#if registering}
        <LoadingButton variant="is-info" loading={busy} onclick={register}>Register!</LoadingButton>
      {:else}
        <LoadingButton variant="is-info" loading={busy} onclick={logIn}>Log In!</LoadingButton>
        <LoadingButton variant="is-danger" loading={busy} onclick={requestReset}>
          Reset Account
        </LoadingButton>
      {/if}
    </div>
  {/snippet}
</Modal>
