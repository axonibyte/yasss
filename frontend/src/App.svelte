<script>
  /**
   * Application shell: boot sequence, chrome, section switching, modal host.
   *
   * The event view itself arrives in Phase 3; this covers the boot sequence,
   * the authentication surface, and the inbound `?action=` entry points that
   * the server's emails link to.
   */
  import NavBar from './components/NavBar.svelte';
  import Footer from './components/Footer.svelte';
  import PageLoader from './components/PageLoader.svelte';
  import IntroSection from './components/IntroSection.svelte';
  import CoaSection from './components/sections/CoaSection.svelte';
  import DashboardSection from './components/sections/DashboardSection.svelte';
  import AuthModal from './components/modals/AuthModal.svelte';
  import ProfileModal from './components/modals/ProfileModal.svelte';
  import PasswordResetModal from './components/modals/PasswordResetModal.svelte';
  import MarkdownModal from './components/modals/MarkdownModal.svelte';
  import CaptchaModal from './components/modals/CaptchaModal.svelte';

  import { session, connectSessionToApi } from './state/session.svelte.js';
  import { route } from './state/route.svelte.js';
  import { toastSuccess, toastDanger, toastError } from './state/toast.js';
  import { configureCaptcha, requireCaptcha } from './lib/captcha.js';
  import * as api from './lib/api/index.js';

  let loading = $state(true);
  let modal = $state(null);

  /** Resolves the pending CAPTCHA challenge, when one is on screen. */
  let captchaResolve = null;
  let captchaReject = null;

  connectSessionToApi({
    onSessionLost: () => toastDanger('Your user session was lost! Please log in again.'),
  });

  /**
   * Present the CAPTCHA modal and resolve with its token. Short-circuits when
   * the deployment has no site key or the visitor is already signed in, so
   * callers can await this unconditionally.
   */
  const requestCaptcha = () => requireCaptcha(() => new Promise((resolve, reject) => {
    captchaResolve = resolve;
    captchaReject = reject;
    modal = { kind: 'captcha' };
  }));

  function closeCaptcha() {
    modal = null;
    captchaReject?.(new Error('The CAPTCHA was dismissed.'));
    captchaResolve = captchaReject = null;
  }

  function onCaptchaToken(token) {
    modal = null;
    captchaResolve?.(token);
    captchaResolve = captchaReject = null;
  }

  /** Inbound links from server-sent email. */
  async function handleRouteAction() {
    const { action, user, token } = route;
    if (!action) return;

    switch (action) {
      case 'verify-user':
        route.clearAction();
        try {
          await api.verifyUser(user, token, await requestCaptcha());
          toastSuccess('Successfully verified your account!');
        } catch (e) {
          toastError(e, "Couldn't verify your account... sorry.");
        }
        break;

      case 'reset-user':
        modal = { kind: 'reset', userId: user, token };
        route.clearAction();
        break;

      case 'terms':
        modal = { kind: 'markdown', title: 'Terms of Service', textId: 'terms' };
        route.clearAction();
        break;

      case 'privacy':
        modal = { kind: 'markdown', title: 'Privacy Policy', textId: 'privacy' };
        route.clearAction();
        break;

      case 'payment-success':
        toastSuccess('Your event was successfully published!');
        route.clearAction();
        break;

      case 'payment-canceled':
        toastDanger('Event publishing was canceled.');
        route.clearAction();
        break;
    }
  }

  async function boot() {
    // The legacy loaded reCAPTCHA unconditionally and read `debug` here too;
    // the site key decides whether the CAPTCHA machinery is used at all.
    try {
      const info = await api.getApiInfo({ anonymous: true });
      configureCaptcha(info.captcha);
    } catch {
      // A failure here is not fatal — the app renders and CAPTCHAs stay off.
    }

    // Validate the stored token before anything reads session state, so the
    // dashboard is never rendered against a session that has already expired.
    await session.refresh();
    if (session.loggedIn) await session.loadOwnedEvents();

    await handleRouteAction();
  }

  // The legacy dismissed the splash on a fixed 1s timer rather than on
  // readiness; keep that as a floor so the page does not flash.
  const minimumSplash = new Promise((r) => setTimeout(r, 1000));
  Promise.allSettled([boot(), minimumSplash]).then(() => { loading = false; });

  function logout() {
    session.logout();
    toastError({ message: "You've been logged out!" }, "You've been logged out!");
  }
</script>

<PageLoader active={loading} />

<NavBar
  loggedIn={session.loggedIn}
  onCreateEvent={() => { /* wizard arrives in Phase 4 */ }}
  onLogin={() => { modal = { kind: 'auth' }; }}
  onAccount={() => { modal = { kind: 'profile' }; }}
  onLogout={logout}
/>

<IntroSection />

{#if session.loggedIn}
  <DashboardSection onSelect={(id) => route.goToEvent(id)} />
{:else}
  <CoaSection onCreateEvent={() => { /* wizard arrives in Phase 4 */ }} />
{/if}

<Footer
  onTerms={() => { modal = { kind: 'markdown', title: 'Terms of Service', textId: 'terms' }; }}
  onPrivacy={() => { modal = { kind: 'markdown', title: 'Privacy Policy', textId: 'privacy' }; }}
/>

{#if modal?.kind === 'auth'}
  <AuthModal
    onClose={() => { modal = null; }}
    onLoggedIn={() => {}}
    {requestCaptcha}
  />
{:else if modal?.kind === 'profile'}
  <ProfileModal onClose={() => { modal = null; }} />
{:else if modal?.kind === 'reset'}
  <PasswordResetModal
    userId={modal.userId}
    token={modal.token}
    onClose={() => { modal = null; }}
    {requestCaptcha}
  />
{:else if modal?.kind === 'markdown'}
  <MarkdownModal
    title={modal.title}
    textId={modal.textId}
    onClose={() => { modal = null; }}
  />
{:else if modal?.kind === 'captcha'}
  <CaptchaModal onToken={onCaptchaToken} onCancel={closeCaptcha} />
{/if}
