<script>
  import { currentEvent, user } from '../stores.js';
  import { fetchApi } from '../api.js';

  $: summary = $currentEvent.summary;
  $: activities = $currentEvent.activities;
  $: windows = $currentEvent.windows;
  $: slots = $currentEvent.slots;
  $: step = $currentEvent.step;
  $: cols = Math.min(activities.length, 5); // max 5 columns

  function getSlotState(activityId, windowId) {
    const slot = slots.find(s => s.activity === activityId && s.window === windowId);
    if (!slot) return { label: 'Unavailable', class: 'is-light' };

    const isBooked = $currentEvent.currentVol >= 0 && $currentEvent.volunteers[$currentEvent.currentVol].rsvps.some(r => r.activity === activityId && r.window === windowId);
    if (isBooked) return { label: 'Booked', class: 'is-warning' };
    if (slot.maxSlotVolunteers > 0 && slot.rsvpCount >= slot.maxSlotVolunteers) return { label: 'At Capacity', class: 'is-light' };

    return { label: 'Available', class: 'is-primary' };
  }

  async function toggleRsvp(activityId, windowId) {
    if ($currentEvent.editing) return;
    const vol = $currentEvent.volunteers[$currentEvent.currentVol];
    if (!vol) return;

    const isBooked = vol.rsvps.some(r => r.activity === activityId && r.window === windowId);
    try {
      if (isBooked) {
        await fetchApi(`/events/${summary.id}/activities/${activityId}/windows/${windowId}/volunteers/${vol.id}`, { method: 'DELETE' });
      } else {
        await fetchApi(`/events/${summary.id}/activities/${activityId}/windows/${windowId}/volunteers/${vol.id}`, { method: 'PUT' });
      }

      // reload event or optimistically update
      location.reload();
    } catch (e) { alert(e.message); }
  }
</script>

<section class="section">
  <div class="card mb-4">
    <div class="card-content">
      <h2 class="title is-2">{summary.shortDescription}</h2>
      <p>{summary.longDescription}</p>
    </div>
  </div>

  <div class="card">
    <div class="card-content">
      <div class="fixed-grid has-{cols + 1}-cols">
        <div class="grid">
          <div class="cell"><!-- empty top left --></div>

          <!-- activities (header) -->
          {#each activities.slice(step - 1, step - 1 + cols) as activity}
            <div class="cell event-cell">
              <ul class="block-list is-small is-centered is-primary is-outlined">
                <li>{activity.shortDescription}</li>
              </ul>
            </div>
          {/each}

          <!-- windows (rows) -->
          {#each windows as win}
            <div class="cell event-cell">
              <ul class="block-list is-small is-centered is-primary is-outlined">
                <li>{new Date(win.begin).toLocaleString()}</li>
              </ul>
            </div>

            <!-- slots for this window -->
            {#each activities.slice(step - 1, step - 1 + cols) as activity}
              {@const state = getSlotState(activity.id, win.id)}
              <!-- svelte-ignore ally-click-events-have-key-events -->
              <!-- svelte-ignore ally-no-static-element-interactions -->
              <div class="cell event-cell" on:click={() => toggleRsvp(activity.id, win.id)}>
                <ul class={`block-list is-small is-centered is-outlined ${state.class}`}>
                  <li>{state.label}</li>
                </ul>
              </div>
            {/each}
          {/each}
        </div>
      </div>

      {#if activities.length > cols}
        <input class="slider is-fullwidth is-small is-primary mt-4"
               type="range"
               min="1"
               max="{activities.length - cols + 1}"
               bind:value={$currentEvent.step} />
      {/if}
    </div>
  </div>
</section>