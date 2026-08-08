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
  import EventCodeEntry from './components/EventCodeEntry.svelte';
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
  import ConfirmModal from './components/modals/ConfirmModal.svelte';
  import SummaryModal from './components/modals/SummaryModal.svelte';
  import ActivityModal from './components/modals/ActivityModal.svelte';
  import WindowModal from './components/modals/WindowModal.svelte';
  import DetailModal from './components/modals/DetailModal.svelte';
  import SlotModal from './components/modals/SlotModal.svelte';
  import TutorialPanel from './components/TutorialPanel.svelte';
  import TutorialChooser from './components/TutorialChooser.svelte';

  import { session, connectSessionToApi } from './state/session.svelte.js';
  import { route } from './state/route.svelte.js';
  import { currentEvent, Mode } from './state/event.svelte.js';
  import { Volunteer } from './state/entities.svelte.js';
  import { toastSuccess, toastDanger, toastError } from './state/toast.js';
  import { configureCaptcha, requireCaptcha } from './lib/captcha.js';
  import { setPasswordMinLength } from './lib/validation/policy.js';
  import { loadEvent, openReport, saveSummary } from './state/actions/eventActions.js';
  import { toggleRsvp } from './state/actions/rsvpActions.js';
  import { publishEvent } from './state/actions/publishActions.js';
  import * as structure from './state/actions/structureActions.js';
  import {
    deleteVolunteer, hasUnsavedWork, saveVolunteer, submitVolunteers,
  } from './state/actions/volunteerActions.js';
  import * as api from './lib/api/index.js';
  import { theme } from './state/theme.svelte.js';
  import { tutorial, loadPracticeEvent, stepIds } from './state/tutorial.svelte.js';
  import { DEFAULT_COPY } from './lib/tutorial/defaults.js';
  import { copyFor } from './lib/tutorial/deck.js';

  let loading = $state(true);
  let modal = $state(null);
  let eventLoaded = $state(false);
  /** True while a publish or RSVP submission is in flight; disables both buttons. */
  let eventBusy = $state(false);
  /**
   * A navigation is in flight.
   *
   * Separate from `eventBusy`, which marks a mutation and is answered by the
   * LoadingButton that started it. This one covers the page, because opening an
   * event *is* a page transition and there is no button left on screen to spin:
   * the dashboard just sat there for the length of the request.
   */
  let navigating = $state(false);

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
    // First, and before any await: the stored choice has to be on the document
    // before the first paint or the reader sees a flash of the other theme.
    theme.start();

    // The legacy loaded reCAPTCHA unconditionally and read `debug` here too;
    // the site key decides whether the CAPTCHA machinery is used at all.
    try {
      const info = await api.getApiInfo({ anonymous: true });
      configureCaptcha(info.captcha);
      // The password minimum is the operator's, not ours. It cannot be checked
      // server-side — the password never gets there — so the server states it
      // and we apply it. An older server that does not report one leaves the
      // built-in default standing.
      setPasswordMinLength(info.passwordMinLength);
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

    // Last, and only when nothing else claimed the page. `?event=...&tutorial`
    // is a link somebody could plausibly build by hand, and in that case the
    // event they were pointed at is the thing they came for -- starting a tour
    // over the top of it would be the tutorial overriding the user's intent
    // rather than serving it.
    if (route.tutorial !== null && !eventLoaded) {
      const track = route.tutorial;
      route.clearTutorial();
      if (track === 'organizer' || track === 'volunteer') await beginTutorial(track);
      // A bare `?tutorial`, or a track nobody recognises: ask rather than guess.
      else tutorial.open();
    }

    // Back and Forward move within our own history once anything has pushed an
    // entry, so the app has to follow the URL rather than assume it only ever
    // changes when we change it.
    route.listen(async (previousEventId) => {
      // Chromium fires popstate for a fragment-link click as well as for
      // history traversal, and every navbar item is an `href="#login"`-style
      // link. Without this guard, opening any modal from the navbar closed it
      // again in the same tick — the click set `modal`, the hash change fired
      // popstate, and the handler below cleared it. Which event we are looking
      // at is not knowable, but whether the route actually moved is, and that
      // is the only thing worth reacting to.
      if (route.eventId === previousEventId) return;

      modal = null;
      if (!route.eventId) {
        eventLoaded = false;
        event.reset();
        return;
      }
      // Already showing it: Forward back onto the event we never left, or a
      // change to some other parameter. Re-fetching would only flicker.
      if (route.eventId === event.id) return;
      // Covered by the loader for the same reason as openEvent: Back onto an
      // event is a page transition with no button to spin.
      navigating = true;
      try {
        eventLoaded = await loadEvent(event, route.eventId);
      } finally {
        navigating = false;
      }
    });
  }

  // --- event interactions --------------------------------------------------

  async function openEvent(eventId) {
    // The URL moves first so Back works, but the load is what takes the time,
    // and there used to be nothing on screen saying so — the dashboard simply
    // sat there. Worse, a failed load left the address bar reading `?event=X`
    // on a page still showing the dashboard, so reloading reproduced the error
    // and there was no obvious way back.
    if (navigating) return;
    navigating = true;
    route.goToEvent(eventId);
    try {
      eventLoaded = await loadEvent(event, eventId);
      // `loadEvent` has already said what went wrong. Drop the id so the URL
      // matches what is actually on screen.
      if (!eventLoaded) route.goHome();
    } finally {
      navigating = false;
    }
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
    const apply = (v) => {
      volunteer.name = v.name;
      volunteer.remindersEnabled = v.remindersEnabled;
      volunteer.reminderEmail = v.reminderEmail;
      volunteer.values.clear();
      for (const [k, val] of v.values) volunteer.values.set(k, val);
    };

    // Snapshotted because `saveVolunteer` serialises the entity itself, so the
    // new values have to be on it before the request goes out. What this did
    // was write them and then close the modal unconditionally — so a failed
    // save left the new name on screen against the old server state, with the
    // form gone and no way to retry. Every other mutation in the app gets this
    // right; this one did not.
    const previous = {
      name: volunteer.name,
      remindersEnabled: volunteer.remindersEnabled,
      reminderEmail: volunteer.reminderEmail,
      values: new Map(volunteer.values),
    };

    apply({ name, values, remindersEnabled, reminderEmail });

    // Only persisted volunteers hit the network; the rest go with the submit.
    if (volunteer.persisted && !(await saveVolunteer(event, volunteer))) {
      // `saveVolunteer` has already toasted why. Roll the entity back and leave
      // the modal open: it edits its own snapshot, so the user's typing is
      // still in the form and Save can simply be pressed again.
      apply(previous);
      return;
    }
    modal = null;
  }

  async function submitRsvps() {
    // Guarded like publish. `pendingVolunteers` filters on `!persisted` and ids
    // only arrive with the responses, so a second click while the first was in
    // flight submitted the very same volunteers again.
    if (eventBusy) return;
    eventBusy = true;
    try {
      const captcha = await requestCaptcha();
      await submitVolunteers(event, { account: session.account, captcha });
    } catch (e) {
      toastError(e, "Couldn't submit your RSVP, sorry.");
    } finally {
      eventBusy = false;
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
    // `modal.isNew` is what the caller asked for; `event.persisted` is whatever
    // happened to be on screen. Branching on the latter meant "Create Event" —
    // a navbar link that is live on every screen, including an event you are
    // looking at — sent the new title out as a PATCH against *that* event, and
    // the empty description box wiped its description on the way past.
    const creating = modal?.isNew === true;

    if (!creating && event.persisted) {
      // Editing a published event: send only what changed.
      const previous = {
        title: event.title,
        description: event.description,
        notifyOnSignup: event.notifyOnSignup,
        allowMultiuserSignups: event.allowMultiuserSignups,
        reminderLeadTime: event.reminderLeadTime,
        // Without this key the diff never saw a zone change, so the PATCH the
        // dto layer was already prepared to send could never be built and the
        // zone was effectively frozen at whatever the browser reported when the
        // event was created.
        timezone: event.timezone,
      };
      const ok = await saveSummary(event, values, previous);
      if (!ok) return;
    } else if (creating || !eventLoaded) {
      // First step of the wizard: reset and start building locally. The URL is
      // cleared too, so a reload does not resurrect the event that was on
      // screen when the wizard was opened.
      if (route.eventId) route.goHome();
      event.reset();
      eventLoaded = true;
    }
    Object.assign(event, values);
    modal = null;
  }

  async function publish() {
    if (eventBusy) return;
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

    // Wrapped, because `requestCaptcha` *rejects* when the visitor dismisses the
    // challenge. This was the only CAPTCHA caller without a catch: the rejection
    // escaped an unawaited promise, nothing was toasted, nothing happened, and
    // the user clicked Publish again.
    const guarded = async () => {
      eventBusy = true;
      try {
        await run();
      } catch (e) {
        toastError(e, "Couldn't publish your event... sorry.");
      } finally {
        eventBusy = false;
      }
    };

    if (session.loggedIn) {
      await guarded();
    } else {
      // Publishing anonymously means never being able to edit it again.
      modal = { kind: 'guest', context: 'publish', proceed: guarded };
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

  /**
   * Back to the dashboard, in-app.
   *
   * The brand was a plain `href="/"`, so the only route back was a full reload,
   * which discards every unsaved volunteer and any half-built event. The unload
   * guard still fires for genuine navigation away; this path asks the same
   * question itself, because in-app navigation does not trigger it.
   */
  // --- tutorial ------------------------------------------------------------

  /**
   * Open the track chooser.
   *
   * Guarded, because every entry point to this is live while the user may be
   * halfway through building a real event -- the navbar item is on every
   * screen. Starting the tutorial loads the practice event over whatever is in
   * `currentEvent`, so this is exactly as destructive as "Create Event" is, and
   * gets the same question.
   */
  function startTutorial() {
    if (hasUnsavedWork(event)) {
      confirmDestructive({
        title: 'Start the tutorial?',
        detail: 'You have unsaved work on this event. Starting the tutorial will lose it.',
        confirmLabel: 'Start tutorial',
        proceed: () => { modal = null; tutorial.open(); },
      });
      return;
    }
    tutorial.open();
  }

  async function beginTutorial(track) {
    loadPracticeEvent(event);
    eventLoaded = true;

    // The deck is optional in the strongest sense: `PublicTextEndpoint` logs and
    // carries on when a text is unconfigured, so *every* deployment is in this
    // state until somebody writes the file. A failed fetch therefore is not an
    // error worth reporting to a learner -- it is the default, and the built-in
    // copy is what it falls back to. Same shape as CoaSection's.
    let deck = null;
    try {
      deck = await api.getText('tutorial');
    } catch {
      /* no deck configured, or unreachable; the defaults carry it */
    }
    tutorial.begin(track, event, copyFor(stepIds, DEFAULT_COPY, deck));
  }

  /**
   * Leave the tutorial, taking the practice event with it.
   *
   * `event.reset()` clears `sandbox` along with everything else, so nothing of
   * the practice event survives into whatever the user does next -- which
   * matters more than usual here, because a stale `sandbox` flag on a real
   * event would silently stop it saving.
   */
  function exitTutorial() {
    tutorial.stop();
    eventLoaded = false;
    event.reset();
    route.goHome();
  }

  // The panel is fixed to the bottom of the viewport, so the page needs room
  // under its own content or the panel covers the button a step is pointing at.
  $effect(() => {
    document.body.classList.toggle('tutorial-running', tutorial.running);
    return () => document.body.classList.remove('tutorial-running');
  });

  function goHome() {
    if (hasUnsavedWork(event)
        && !window.confirm('You have unsaved work on this event. Leave it behind?')) {
      return;
    }
    modal = null;
    eventLoaded = false;
    event.reset();
    route.goHome();
  }

  /**
   * Interpose a confirmation before something irreversible.
   *
   * Swaps the current modal for the question and puts the original back on
   * cancel, so the editor the user was in is exactly where they land if they
   * change their mind — rather than stacking a second dialog over the first,
   * which would need a second focus trap and give Escape two meanings.
   *
   * The subject is captured here rather than read off `modal` inside `proceed`,
   * because by then `modal` is the confirmation.
   */
  function confirmDestructive({ title, detail, confirmLabel, proceed }) {
    const previous = modal;
    modal = {
      kind: 'confirm',
      title,
      detail,
      confirmLabel,
      proceed,
      cancel: () => { modal = previous; },
    };
  }

  function logout() {
    session.logout();
    // Logging out is something the user asked for and got. It was reported with
    // `toastError`, which is `is-danger` — the same red banner as a failed save.
    toastSuccess("You've been logged out!");
  }
</script>

<svelte:window onbeforeunload={beforeUnload} />

<PageLoader active={loading || navigating} />

<NavBar
  loggedIn={session.loggedIn}
  onCreateEvent={startWizard}
  onTutorial={startTutorial}
  onHome={goHome}
  onLogin={() => { modal = { kind: 'auth' }; }}
  onAccount={() => { modal = { kind: 'profile' }; }}
  onLogout={logout}
/>

{#if eventLoaded}
  <EventSection
    {event}
    busy={eventBusy}
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
  <EventCodeEntry onGo={openEvent} />
  {#if session.loggedIn}
    <DashboardSection onSelect={openEvent} />
  {:else}
    <CoaSection onCreateEvent={startWizard} onTutorial={startTutorial} />
  {/if}
{/if}

{#if tutorial.choosing}
  <TutorialChooser onChoose={beginTutorial} onClose={() => tutorial.stop()} />
{/if}

{#if tutorial.running}
  <TutorialPanel
    html={tutorial.html}
    position={tutorial.position}
    total={tutorial.total}
    anchor={tutorial.step?.anchor ?? null}
    canGoBack={tutorial.index > 0}
    atEnd={tutorial.atEnd}
    onBack={() => tutorial.back(event)}
    onNext={() => tutorial.next(event)}
    onExit={exitTutorial}
  />
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
  <!--
    The shared link carries the code when there is one: eight characters someone
    can copy off a screen, rather than thirty-six of hex. The UUID form keeps
    working, so every link already in the world is unaffected.
  -->
  <ShareModal
    url={route.eventUrl(event.code ?? event.id)}
    code={event.code}
    onClose={() => { modal = null; }}
  />
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
    onDelete={() => {
      const volunteer = modal.volunteer;
      confirmDestructive({
        title: 'Remove this volunteer?',
        detail: `${volunteer?.name ?? 'This volunteer'} and every slot they claimed `
          + 'will be released. This cannot be undone.',
        confirmLabel: 'Remove Volunteer',
        proceed: async () => {
          await deleteVolunteer(event, volunteer);
          modal = null;
        },
      });
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
    onDelete={() => {
      const activity = modal.activity;
      confirmDestructive({
        title: 'Remove this activity?',
        detail: `"${activity?.label ?? 'This activity'}" goes, along with its slots `
          + 'and every RSVP in them. This cannot be undone.',
        confirmLabel: 'Remove Activity',
        proceed: async () => {
          await structure.removeActivity(event, activity);
          modal = null;
        },
      });
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
    onDelete={() => {
      const win = modal.win;
      confirmDestructive({
        title: 'Remove this window?',
        detail: 'Every activity loses its slot for this time, and every RSVP in '
          + 'those slots goes with it. This cannot be undone.',
        confirmLabel: 'Remove Window',
        proceed: async () => {
          await structure.removeWindow(event, win);
          modal = null;
        },
      });
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
    onDelete={() => {
      const detail = modal.detail;
      confirmDestructive({
        title: 'Remove this custom field?',
        detail: `Every answer volunteers have already given for `
          + `"${detail?.label ?? 'this field'}" is deleted with it. This cannot be undone.`,
        confirmLabel: 'Remove Field',
        proceed: async () => {
          await structure.removeDetail(event, detail);
          modal = null;
        },
      });
    }}
    onClose={() => { modal = null; }}
  />
{:else if modal?.kind === 'confirm'}
  <ConfirmModal
    title={modal.title}
    detail={modal.detail}
    confirmLabel={modal.confirmLabel}
    onConfirm={modal.proceed}
    onCancel={modal.cancel}
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
