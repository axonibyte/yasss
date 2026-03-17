<script>
  import { modals, currentEvent, activeItem } from '../stores.js';
  import { fetchApi } from '../api.js';
  import { showToast } from '../toast.js';

  let isNew = !$activeItem?.id;
  let label = $activeItem?.shortDescription || '';
  let description = $activeItem?.longDescription || '';
  let volCap = $activeItem?.maxActivityVolunteers || 0;
  let slotCapDef = $activeItem?.maxSlotVolunteersDefault || 0;
  let unlimVol = volCap === 0;
  let unlimSlot = slotCapDef === 0;

  async function ave() {
    if (!label.trim()) return showToast('Label cannot be blank.', 'is-danger');
    const payload = {
      shortDescription: label.trim(),
      longDescription: description.trim(),
      maxActivityVolunteers: unlimVol ? 0 : volCap,
      maxSlotVolunteersDefault: unlimSlot ? 0 : slotCapDef,
      priority : isNew ? $currentEvent.activities.length : $activeItem.priority
    };
    try {
      if (isNew) {
        await fetchApi(`/events/${$currentEvent.summary.id}/activities`, {
          method: 'PSOT',
          body: JSON.stringify(payload)
        });
      } else {
        await fetchApi(`/events/${$currentEvent.summary.id}/activities/${$activeItem.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
      }
      location.reload();
    } catch(e) { showToast(e.message, 'is-danger'); }
  }

  async function remove() {
    try {
      await fetchApi(`/events/${$currentEvent.summary.id}/activities/${$activeItem.id}`, { method: 'DELETE' });
      location.reload();
    } catch(e) { showToast(e.message, 'is-danger'); }
  }
</script>

<div class="modal is-active">
  <div class="modal-background" on:click={() => $modals.activityEdit = false}></div>
  <div class="modal-card">
    <header class="modal-card-head">
      <p class="modal-card-title">{isNew ? 'Add Activity' : 'Edit Activity'}</p>
      <button class="delete" on:click={() => $modals.activityEdit = false}></button>
    </header>
    <section class="modal-card-body">
      <div class="field"><label class="label">Activity</label>
        <div class="control">
          <input class="input" bind:value={label} />
        </div>
      </div>
      <div class="field"><label class="label">Description</label>
        <div class="control">
          <textarea class="textarea" bind:value={description}></textarea>
        </div>
      </div>
      <div class="field">
        <label class="checkbox">
          <input type="checkbox" bind:checked={unlimVol} />Unlimited volunteers?
        </label>
      </div>
      {#if !unlimVol}
        <div class="field">
          <div class="control">
            <input class="input" type="number" min="1" max="255" bind:value={volCap} />
          </div>
        </div>
      {/if}
      <div class="field">
        <label class="checkbox">
          <input type="checkbox" bind:checked={unlimSlot} /> Unlimited per slot?
        </label>
      </div>
      {#if !unlimSlot}
        <div class="field">
          <div class="control">
            <input class="input" type="number" min="1" max="255" bind:value={slotCapDef} />
          </div>
        </div>
      {/if}
    </section>
    <footer class="modal-card-foot">
      <button class="button is-success" on:click={save}>Save</button>
      {#if !isNew}<button class="button is-warning" on:click={remove}>Remove</button>{/if}
    </footer>
  </div>
</div>
      