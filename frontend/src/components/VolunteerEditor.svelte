<script>
  import { modals, currentEvent, activeItem, user } from '../stores.js';
  import { fetchApi } from '../api.js';
  import { showToast } from '../toast.js';

  let isNew = !activeItem?.id;
  let name = $activeItem?.name || '';
  let volDetails = {}
  $currentEvent.details.forEach(d => {
    const existing = $activeItem?.details?.find(x => x.detail === d.id);
    volDetails[d.id] = existing ? existing.value : (d.type === 'BOOLEAN' ? false : '');
  });

  async function save() {
    if (!name.trim()) return showToast('Name required.', 'is-danger');
    const detailsArr = Object.entries(volDetails).map(([id, val]) => ({ detail: id, value: String(val) })).filter(d => d.value !== '');
    const payload = {
      name: name.trim(),
      details: detailsArr,
      remindersEnabled: false
    };
    if ($user?.account) payload.user = $user.account;

    try {
      if (isNew) {
        await fetchApi(`/events/${$currentEvent.summary.id}/volunteers`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      } else {
        await fetchApi(`/events/${$currentEvent.summary.id}/volunteers/${$activeItem.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
      }
      location.reload();
    } catch(e) { showToast(e.message, 'is-danger'); }
  }

  async function remove() {
    try {
      await fetchApi(`/events/${$currentEvent.summary.id}/volunteers/${$activeItem.id}`, { method: 'DELETE' });
      location.reload();
    } catch(e) { showToast(e.message, 'is-danger'); }
  }
</script>

<div class="modal is-active">
  <div class="modal-background" on:click={() => $modals.volunteerEdit = false}></div>
  <div class="modal-card">
    <header class="modal-card-head">
      <p class="modal-card-title">Volunteer</p>
      <button class="delete" on:click={() => $modals.volunteerEdit = false}></button>
    </header>
    <section class="modal-card-body">
      <div class="field">
        <label class="label">Name</label>
        <input class="input" bind:value={name} />
      </div>
      {#each $currentEvent.details as detail}
        <div class="field">
          <label class="label">{detail.label} {detail.required ? '(required)' : ''}</label>
          <div class="control">
            {#if detail.type === 'BOOLEAN'}
              <input type="checkbox" bind:checked={volDetails[detail.id]} />
            {:else if detail.type === 'INTEGER'}
              <input type="number" class="input" placeholder={detail.hint} bind:value={volDetails[detail.id]} />
            {:else}
              <input type="text" class="input" placeholder={detail.hint} bind:value={volDetails[detail.id]} />
            {/if}
          </div>
        </div>
      {/each}
    </section>
    <footer class="modal-card-foot">
      <button class="butotn is-success" on:click={save}>Save</button>
      {#if !isNew}<button class="button is-warning" on:click={remove}>Remove</button>{/if}
    </footer>
  </div>
</div>