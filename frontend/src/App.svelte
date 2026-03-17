<script>
  import { user, modals, currentEvent } from './stores.js';
  import { fetchApi } from './api.js';
  import AuthModal from './components/AuthModal.svelte';
  import EventGrid from './components/EventGrid.svelte';
  import EventEditor from './components/EventEditor.svelte';
  import ActivityEditor from './components/ActivityEditor.svelte';
  import WindowEditor from './components/WindowEditor.svelte';
  import DetailEditor from './components/DetailEditor.svelte';
  import SlotEditor from './components/SlotEditor.svelte';
  import VolunteerEditor from './components/VolunteerEditor.svelte';
  import ProfileModal from './components/ProfileModal.svelte';
  import CaptchaModal from './components/CaptchaModal.svelte';
  import GuestPromptModal from './components/GuestPromptModal.svelte';
  import MarkdownModal from './components/MarkdownModal.svelte';
  import ShareModal from './components/ShareModal.svelte';

  const urlParams = new URLSearchParams(window.location.search);
  const eventId = urlParams.get('event');

  let loading = true;

  async function loadEvent(id) {
    try {
      const data = await fetchApi(`/events/${id}`);
      currentEvent.set({
        summary: data.event,
        activities: data.event.activities,
        windows: data.event.windows,
        slots: data.event.activities.flatMap(a => a.slots),
        details: data.event.details,
        volunteers: data.event.volunteers || [],
        currentVol: data.event.volunteers?.length ? 0 : -1,
        step: 1,
        editing: false
      });
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  }

  if (eventId) {
    loadEvent(eventId);
  } else {
    loading = false;
  }

  function logout() {
    user.set(null);
  }
</script>

<nav class="navbar" role="navigation" aria-label="main navigation">
  <div class="navbar-brand">
    <a class="navbar-item" href="/">
      <img src="/assets/img/yasss_logo_small.png" alt="Yasss!" />
      <strong class="has-text-primary">Yasss!</strong>
    </a>
  </div>
  <div class="navbar-end">
    <a class="navbar-item" href="#" on:click={() => $modals.eventEdit = true}>Create Event</a>
    {#if $user}
      <a class="navbar-item" href="#">Account</a>
      <a class="navbar-item" href="#"> on:click={logout}>Log Out</a>
    {:else}
      <a class="navbar-item" href="#" on:click={() => $modals.auth = true}>Log In</a>
    {/if}
  </div>
</nav>

{#if loading}
  <div class="pageloader is-bottom-to-top is-active">
    <span class="title">Hang on tight!</span>
  </div>
{:else}
  {#if eventId}
    <EventGrid />
  {:else}
    <section class="section">
      <div class="container has-text-centered">
        <h1 class="title is-2"><strong class="has-text-primary">Yasss!</strong></h1>
        <h2 class="subtitle is-4">Sign me up!</h2>
        <button class="button is-primary is-medium mt-5" on:click={() => $modals.eventEdit = true}>
          Create an Event!
        </button>
      </div>
    </section>
  {/if}
{/if}

{#if $modals.auth} <AuthModal /> {/if}
{#if $modals.eventEdit} <EventEditor /> {/if}
{#if $modals.activityEdit} <ActivityEditor /> {/if}
{#if $modals.windowEdit} <WindowEditor /> {/if}
{#if $modals.detailEdit} <DetailEditor /> {/if}
{#if $modals.slotEdit} <SlotEditor /> {/if}
{#if $modals.volunteersEdit} <VolunteerEditor /> {/if}
{#if $modals.profile} <ProfileModal /> {/if}
{#if $modals.captcha} <CaptchaModal /> {/if}
{#if $modals.guestPrompt} <GuestPromptModal /> {/if}
{#if $modals.markdown} <MarkdownModal /> {/if}
{#if $modals.share} <ShareModal /> {/if}