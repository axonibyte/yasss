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
  import EventSection from './components/sections/EventSection.svelte';
  import AuthModal from './components/modals/AuthModal.svelte';
  import ProfileModal from './components/modals/ProfileModal.svelte';
  import PasswordResetModal from './components/modals/PasswordResetModal.svelte';
  import MarkdownModal from './components/modals/MarkdownModal.svelte';
  import CaptchaModal from './components/modals/CaptchaModal.svelte';
  import VolunteerModal from './components/modals/VolunteerModal.svelte';
  import ShareModal from './components/modals/ShareModal.svelte';
  import GuestPromptModal from './components/modals/GuestPromptModal.svelte';
  import SummaryModal from './components/modals/SummaryModal.svelte';
  import ActivityModal from './components/modals/ActivityModal.svelte';
  import WindowModal from './components/modals/WindowModal.svelte';
  import DetailModal from './components/modals/DetailModal.svelte';
  import SlotModal from './components/modals/SlotModal.svelte';

  import { session, connectSessionToApi } from './state/session.svelte.js';
  import { route } from './state/route.svelte.js';
  import { currentEvent, Mode } from './state/event.svelte.js';
  import { Volunteer } from './state/entities.svelte.js';
  import { toastSuccess, toastDanger, toastError } from './state/toast.js';
  import { configureCaptcha, requireCaptcha } from './lib/captcha.js';
  import { loadEvent, openReport, saveSummary } from './state/actions/eventActions.js';
  import { toggleRsvp } from './state/actions/rsvpActions.js';
  import { publishEvent } from './state/actions/publishActions.js';
  import * as structure from './state/actions/structureActions.js';
  import {
    deleteVolunteer, hasUnsavedWork, saveVolunteer, submitVolunteers,
  } from './state/actions/volunteerActions.js';
  import * as api from './lib/api/index.js';

  let loading = $state(true);
  let modal = $state(null);
  let eventLoaded = $state(false);

  const event = currentEvent;

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
    const { action, user, volunteer, token } = route;
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

      // Both reminder links are one-click and unauthenticated, so they resolve
      // to a toast rather than a modal. The server answers 200 whatever the
      // token turns out to be -- it will not confirm or deny that a token is
      // live to an anonymous caller -- so the message is worded as an outcome
      // rather than a promise.
      case 'confirm-reminders':
        route.clearAction();
        try {
          await api.confirmReminders(route.eventId, volunteer, token);
          toastSuccess("You're all set — we'll remind you before the event.");
        } catch (e) {
          toastError(e, "Couldn't confirm your reminders... sorry.");
        }
        break;

      case 'unsubscribe-reminders':
        route.clearAction();
        try {
          await api.unsubscribeReminders(route.eventId, volunteer, token);
          toastSuccess("You've been unsubscribed. We won't email you reminders again.");
        } catch (e) {
          toastError(e, "Couldn't unsubscribe you... sorry.");
        }
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
    // Awaited so the "Modify Event" affordance is never wrong on a cold load
    // straight to ?event= — until this resolves it stays hidden, not misleading.
    if (session.loggedIn) await session.loadOwnedEvents();

    if (route.eventId) {
      eventLoaded = await loadEvent(event, route.eventId);
      if (eventLoaded && route.share) {
        modal = { kind: 'share' };
        route.clearShare();
      }
    }

    await handleRouteAction();
  }

  // --- event interactions --------------------------------------------------

  async function openEvent(eventId) {
    route.goToEvent(eventId);
    eventLoaded = await loadEvent(event, eventId);
  }

  function addVolunteer() {
    // The guest prompt fires only for the first volunteer, as it did before —
    // repeating it on every add would be nagging.
    if (!session.loggedIn && event.volunteers.length === 0) {
      modal = { kind: 'guest', context: 'voladd' };
      return;
    }
    modal = { kind: 'volunteer', volunteer: null };
  }

  function saveNewVolunteer({ name, values, remindersEnabled, reminderEmail }) {
    const volunteer = new Volunteer({ name, values, remindersEnabled, reminderEmail });
    event.addVolunteer(volunteer);
    modal = null;
  }

  async function saveExistingVolunteer(
    volunteer,
    { name, values, remindersEnabled, reminderEmail },
  ) {
    volunteer.name = name;
    volunteer.remindersEnabled = remindersEnabled;
    volunteer.reminderEmail = reminderEmail;
    volunteer.values.clear();
    for (const [k, v] of values) volunteer.values.set(k, v);
    // Only persisted volunteers hit the network; the rest go with the submit.
    if (volunteer.persisted) await saveVolunteer(event, volunteer);
    modal = null;
  }

  async function submitRsvps() {
    try {
      const captcha = await requestCaptcha();
      await submitVolunteers(event, { account: session.account, captcha });
    } catch (e) {
      toastError(e, "Couldn't submit your RSVP, sorry.");
    }
  }

  // Persistence is deferred by design, so unsubmitted work is genuinely at
  // risk — the legacy lost it silently. Warn before it disappears.
  function beforeUnload(e) {
    if (!hasUnsavedWork(event)) return;
    e.preventDefault();
    e.returnValue = '';
  }

  // --- creation wizard and edit mode ---------------------------------------

  /** Start a new event. The summary modal is step one. */
  function startWizard() {
    modal = { kind: 'summary', summary: null, isNew: true };
  }

  async function saveSummaryModal(values) {
    if (event.persisted) {
      // Editing a published event: send only what changed.
      const previous = {
        title: event.title,
        description: event.description,
        notifyOnSignup: event.notifyOnSignup,
        allowMultiuserSignups: event.allowMultiuserSignups,
        reminderLeadTime: event.reminderLeadTime,
      };
      const ok = await saveSummary(event, values, previous);
      if (!ok) return;
    } else if (!eventLoaded) {
      // First step of the wizard: reset and start building locally.
      event.reset();
      eventLoaded = true;
    }
    Object.assign(event, values);
    modal = null;
  }

  async function publish() {
    const run = async () => {
      const captcha = await requestCaptcha();
      const result = await publishEvent(event, { account: session.account, captcha });
      if (!result.ok) return;

      if (result.redirect) {
        window.location.replace(result.redirect);
        return;
      }
      await session.loadOwnedEvents();
      // Reload from the server so ids, ordering and slot state are authoritative.
      route.goToEvent(result.eventId, { share: true });
      eventLoaded = await loadEvent(event, result.eventId);
      if (eventLoaded) modal = { kind: 'share' };
      else modal = null;
    };

    if (session.loggedIn) {
      await run();
    } else {
      // Publishing anonymously means never being able to edit it again.
      modal = { kind: 'guest', context: 'publish', proceed: run };
    }
  }

  /** Slot clicks mean "toggle my RSVP" when viewing and "edit" when not. */
  function onSlotClick(activity, win) {
    if (event.mode === Mode.VIEW) {
      toggleRsvp(event, activity, win);
      return;
    }
    modal = { kind: 'slot', activity, win };
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

<svelte:window onbeforeunload={beforeUnload} />

<PageLoader active={loading} />

<NavBar
  loggedIn={session.loggedIn}
  onCreateEvent={startWizard}
  onLogin={() => { modal = { kind: 'auth' }; }}
  onAccount={() => { modal = { kind: 'profile' }; }}
  onLogout={logout}
/>

{#if eventLoaded}
  <EventSection
    {event}
    onEditSummary={() => { modal = { kind: 'summary', summary: event, isNew: false }; }}
    onShare={() => { modal = { kind: 'share' }; }}
    onViewReport={() => openReport(event.id)}
    onAddVolunteer={addVolunteer}
    onUpdateVolunteer={() => {
      modal = { kind: 'volunteer', volunteer: event.selectedVolunteer };
    }}
    onActivityClick={(activity) => {
      modal = { kind: 'activity', activity, isNew: false };
    }}
    onWindowClick={(win) => { modal = { kind: 'window', win, isNew: false }; }}
    onDetailClick={(detail) => { modal = { kind: 'detail', detail, isNew: false }; }}
    onDetailMove={(detail, delta) => structure.moveDetail(event, detail, delta)}
    {onSlotClick}
    onAddActivity={() => { modal = { kind: 'activity', activity: null, isNew: true }; }}
    onAddWindow={() => { modal = { kind: 'window', win: null, isNew: true }; }}
    onAddField={() => { modal = { kind: 'detail', detail: null, isNew: true }; }}
    onPublish={publish}
    onEnterEdit={() => { event.editing = true; }}
    onExitEdit={() => { event.editing = false; }}
    onSubmitRsvps={submitRsvps}
  />
{:else}
  <IntroSection />
  {#if session.loggedIn}
    <DashboardSection onSelect={openEvent} />
  {:else}
    <CoaSection onCreateEvent={startWizard} />
  {/if}
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
{:else if modal?.kind === 'share'}
  <ShareModal url={route.eventUrl(event.id)} onClose={() => { modal = null; }} />
{:else if modal?.kind === 'guest'}
  <GuestPromptModal
    context={modal.context}
    onSignIn={() => { modal = { kind: 'auth' }; }}
    onProceed={() => {
      const proceed = modal.proceed;
      modal = proceed ? null : { kind: 'volunteer', volunteer: null };
      proceed?.();
    }}
    onClose={() => { modal = null; }}
  />
{:else if modal?.kind === 'volunteer'}
  <VolunteerModal
    volunteer={modal.volunteer}
    details={event.details}
    isNew={modal.volunteer === null}
    accountEmail={session.email}
    onSave={(data) => (modal.volunteer
      ? saveExistingVolunteer(modal.volunteer, data)
      : saveNewVolunteer(data))}
    onDelete={async () => {
      await deleteVolunteer(event, modal.volunteer);
      modal = null;
    }}
    onClose={() => { modal = null; }}
  />
{:else if modal?.kind === 'summary'}
  <SummaryModal
    summary={modal.summary}
    isNew={modal.isNew}
    onSave={saveSummaryModal}
    onClose={() => { modal = null; }}
  />
{:else if modal?.kind === 'activity'}
  <ActivityModal
    activity={modal.activity}
    isNew={modal.isNew}
    canMoveLeft={event.activities.indexOf(modal.activity) > 0}
    canMoveRight={
      modal.activity !== null
        && event.activities.indexOf(modal.activity) < event.activities.length - 1
    }
    onMove={async (delta) => {
      if (await structure.moveActivity(event, modal.activity, delta)) modal = null;
    }}
    onSave={async (values) => {
      const ok = modal.activity
        ? await structure.updateActivity(event, modal.activity, values)
        : await structure.addActivity(event, values);
      if (ok) modal = null;
    }}
    onDelete={async () => {
      if (await structure.removeActivity(event, modal.activity)) modal = null;
    }}
    onClose={() => { modal = null; }}
  />
{:else if modal?.kind === 'window'}
  <WindowModal
    win={modal.win}
    isNew={modal.isNew}
    onSave={async (values) => {
      const ok = modal.win
        ? await structure.updateWindow(event, modal.win, values)
        : await structure.addWindow(event, values);
      if (ok) modal = null;
    }}
    onDelete={async () => {
      if (await structure.removeWindow(event, modal.win)) modal = null;
    }}
    onClose={() => { modal = null; }}
  />
{:else if modal?.kind === 'detail'}
  <DetailModal
    detail={modal.detail}
    isNew={modal.isNew}
    onSave={async (values) => {
      const ok = modal.detail
        ? await structure.updateDetail(event, modal.detail, values)
        : await structure.addDetail(event, values);
      if (ok) modal = null;
    }}
    onDelete={async () => {
      if (await structure.removeDetail(event, modal.detail)) modal = null;
    }}
    onClose={() => { modal = null; }}
  />
{:else if modal?.kind === 'slot'}
  <SlotModal
    activityLabel={modal.activity.label}
    windowLabel={`${modal.win.labelParts.begin} - ${modal.win.labelParts.end}`}
    slot={event.slot(modal.activity, modal.win)}
    onSave={async (values) => {
      if (await structure.updateSlot(event, modal.activity, modal.win, values)) modal = null;
    }}
    onEditActivity={() => { modal = { kind: 'activity', activity: modal.activity, isNew: false }; }}
    onEditWindow={() => { modal = { kind: 'window', win: modal.win, isNew: false }; }}
    onClose={() => { modal = null; }}
  />
{/if}
