<script>
  import { modals, currentEvent, activeItem } from '../stores.js';
  import { fetchApi } from '../api.js';
  import { showToast } from '../toast.js';

  let enabled = true;
  let maxSlotVolunteers = $activeItem?.maxSlotVolunteers || 0;
  let unlim = maxSlotVolunteers === 0;

  async function save() {
    const payload = { maxSlotVolunteers: unlim ? 0 : maxSlotVolunteers };
    try {
      if (!enabled) {
        await fetchApi(`/events/${$currentEvent.summary.id}/activities/${$activeItem.activity}/windows/${$activeItem.window}`, { method: 'DELETE' });
      } else {
        await fetchApi(`/events/${$currentEvent.summary.id}/activities/${activeItem.activityItem.activity}/windows/${$activeItem.window}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      }
      location.reload();
    } catch(e) { showToast(e.message, 'is-danger'); }
  }
</script>

<div class="modal is-active">
  <div class="modal-background" on:click={() => $modals.slotEdit = false}></div>
  <div class="modal-card">
    <header class="modal-card-head">
      <p class="modal-card-title">Edit Slot</p>
      <button class="delete" on:click={() => $modals.slotEdit = false}></button>
    </header>
    <section class="modal-card-body">
      <div class="field">
        <label class="checkbox">
          <input type="checkbox" bind:checked={enabled} /> Enable this slot?
        </label>
      </div>
      {#if enabled}
        <div class="field">
          <label class="checkbox">
            <input type="checkbox" bind:checked={unlim} /> Unlimited volunteers?
          </label>
        </div>
        {#if !unlim}
          <div class="field">
            <input class="input" type="number" min="1" max="255" bind:value={maxSlotVolunteers} />
          </div>
        {/if}
      {/if}
    </section>
    <footer class="modal-card-foot">
      <button class="button is-success" on:click={save}>Save</button>
    </footer>
  </div>
</div>