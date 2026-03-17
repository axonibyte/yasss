<script>
  import { modals, currentEvent, activeItem } from '../stores.js';
  import { fetchApi } from '../api.js';
  import { showToast } from '../toast.js';

  let isNew = !$activeItem?.id;
  let type = $activeItem?.type || '';
  let label = $activeItem?.label || '';
  let hint = $activeItem?.hint || '';
  let required = $activeItem?.required || false;

  async function save() {
    if (!type) return showToast('Select a type.', 'is-danger');
    if (!label.trim()) return showToast('Label required.', 'is-danger');
    const payload = {
      type,
      label: label.trim(),
      hint: hint.trim(),
      required
    };
    try {
      if (isNew) {
        await fetchApi(`/events/${$currentEvent.summary.id}/details`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      } else {
        await fetchApi(`/events/${$currentEvent.summary.id}/details/${$activeItem.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
      }
      location.reload();
    } catch(e) { showToast(e.message, 'is-danger'); }
  }

  async function remove() {
    try {
      await fetchApi(`/events/${$currentEvent.summary.id}/details/${$activeItem.id}`, { method: 'DELETE' });
      location.reload();
    } catch(e) { showToast(e.message, 'is-danger'); }
  }
</script>

<div class="modal is-active">
  <div class="modal-background" on:click={() => $modals.detailEdit = false}></div>
  <div class="modal-card">
    <header class="modal-card-head">
    <p class="modal-card-title">Field Detail</p>
    <button class="delete" on:click={() => $modals.detailEdit = false}></button>
  </header>
    <section class="modal-card-body">
      <div class="field">
        <label class="label">Type</label>
        <div class="select">
          <select bind:value={type}>
            <option value="" disabled>Select Type</option>
            <option value="STRING">Text</option>
            <option value="BOOLEAN">True/False</option>
            <option value="INTEGER">Whole Number</option>
            <option value="EMAIL">Email</option>
            <option value="PHONE">Phone</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label class="label">Field Label</label>
        <input class="input" bind:value={label} />
      </div>
      <div class="field">
        <label class="label">Hint/Description</label>
        <textarea class="textarea" bind:value={hint}></textarea>
      </div>
      <div class="field">
        <label class="checkbox">
          <input type="checkbox" bind:checked={required} /> Required?
        </label>
      </div>
    </section>
    <footer class="modal-card-foot">
      <button class="button is-success" on:click={save}>Save</button>
      {#if !isNew}<button class="button is-warning" on:click={remove}>Remove</button>{/if}
    </footer>
  </div>
</div>