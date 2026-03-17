<script>
  import { modals, currentEvent, user } from '../stores.js';
  import { fetchApi } from '../api.js';
  import { showToast } from '../toast.js';

  let title = $currentEvent.summary?.shortDescription || '';
  let description = $currentEvent.summary?.longDescription || '';
  let notifyOnSignup = $currentEvent.summary?.emailOnSubmission ?? true;
  let allowMultiuserSignups = $currentEvent.summary?.allowMultiUserSignups ?? false;
  let loading = false;

  async function save() {
    if (!title.trim()) return showToast('The title cannot be blank.', 'is-danger');
    loading = true;

    const payload = {
      shortDescription: title.trim(),
      longDescription: description.trim(),
      emailOnSubmission: notifyOnSignup,
      allowMultiUserSignups: allowMultiuserSignups
    };

    try {
      if ($currentEvent.summary?.id) {
        await fetchApi(`/events/${$currentEvent.summary.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
      } else {
        if ($user?.account) payload.admin = $user.account;
        payload.activities = [];
        payload.windows = [];
        payload.details = [];
        const res = await fetchApi('/events', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        if (res.paymentRedirect)
          window.location.replace(res.paymentRedirect);
        else window.location.replace(`/?event=${res.event.id}&share`);
        return;
      }
      showToast('Event saved!', 'is-success');
      $modals.eventEdit = false;
      location.reload();
    } catch (e) {
      showToast(e.message, 'is-danger');
    } finally {
      loading = false;
    }
  }
</script>

<div class="modal is-active">
  <div class="modal-background" on:click={() => $modals.eventEdit = false}></div>
  <div class="modal-card">
    <header class="modal-card-head">
      <p class="modal-card-title">{$currentEvent.summary?.id ? 'Edit Event' : 'Create Event'}</p>
      <button class="delete" on:click={() => $modals.eventEdit = false}></button>
    </header>
    <section class="moda-card-body">
      <div class="field">
        <label class="label">Event Title</label>
        <div class="control">
          <input class="input" bind:value={title} placeholder="Event Name" />
        </div>
      </div>
      <div class="field">
        <label class="label">Description</label>
        <div class="control">
          <textarea class="textarea" bind:value={description} rows="4"></textarea>
        </div>
      </div>
      <div class="field">
        <label class="checkbox">
          <input type="checkbox" bind:checked={notifyOnSignup} /> Notify when someone signs up?
        </label>
      </div>
    </section>
    <footer class="modal-card-foot">
      <button class="button is-success {loading ? 'is-laoding' : ''}" on:click={save}>Save</button>
    </footer>
  </div>
</div>
      