<script>
  import { onMount } from 'svelte';
  import { modals, currentEvent, activeItem } from '../stores.js';
  import { fetchApi } from '../api.js';
  import { showToast } from '../toast.js';

  let isNew = !$activeItem?.id;
  let calInstance;

  onMount(() => {
    const tomorrow = new Date;
    tomorrow.setDate(tomorrow.getDate() + 1);

    const opts = {
      displayMode: 'dialog',
      isRange: true,
      timeFormat: 'hh:mm a',
      type: 'datetime',
      minDate: tomorrow
    };
    if (!isNew && $activeItem.beginTime) {
      opts.startDate = new Date($activeItem.beginTime);
      opts.endDate = new Date($activeItem.endTime || $activeItem.beginTime);
    } else {
      opts.startDate = new Date(tomorrow.setHours(8,0,0,0));
      opts.endDate = new Date(tomorrow.setHours(17,0,0,0));
    }
    calInstance = bulmaCalendar.attach('#edit-window-range', opts)[0];
  });

  async function save() {
    if (!calInstance.startDate || !calInstance.endDate)
      return showToast('Specify full range.', 'is-danger');
      
    const payload = {
      beginTime: calInstance.startDate.getTime(),
      endTime: calInstance.endDate.getTime()
    };
    try {
      if (isNew) {
        await fetchApi(`/events/${$currentEvent.summary.id}/windows`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      } else {
        await fetchApi(`/events/${$currentEvent.summary.id}/windows/${$activeItem.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
      }
      location.reload();
    } catch(e) { showToast(e.message, 'is-danger'); }
  }

  async function remove() {
    try {
      await fetchApi(`/events/${$currentEvent.summary.id}/windows/${$activeItem.id}`, { method: 'DELETE' });
      location.reload();
    } catch(e) { showToast(e.message, 'is-danger'); }
  }
</script>

<div class="modal is-active">
  <div class="modal-background" on:click={() => $modals.windowEdit = false}></div>
  <div class="modal-card">
    <header class="modal-card-head">
      <p class="modal-card-title">Window</p>
      <button class="delete" on:click={() => $modals.windowEdit = false}></button>
    </header>
    <section class="modal-card-body">
      <input class="input" type="date" id="edit-window-range" />
    </section>
    <footer class="modal-card-foot">
      <button class="button is-success" on:click={save}>Save</button>
      {#if !isNew}<button class="button is-warning" on:click={remove}>Remove</button>{/if}
    </footer>
  </div>
</div>