<script>
  /**
   * Volunteer picker and add/update buttons.
   * docs/legacy/02-aesthetics.md §1.4, behavior §1.4.
   *
   * The select binds to a volunteer object rather than an array index. The
   * legacy stored `Number(selected.val())`, which is NaN when nothing is
   * selected, then indexed the volunteers array with it — so the next slot
   * click threw.
   */
  let { event, canAdd, onAdd, onUpdate } = $props();

  const empty = $derived(event.volunteers.length === 0);
</script>

<div id="view-event-volunteer" class="card">
  <header class="card-header">
    <p class="card-header-title">Volunteer!</p>
  </header>
  <div class="card-content">
    <div class="content">
      <div class="select is-fullwidth is-primary">
        <select
          aria-label="Select a volunteer"
          disabled={empty}
          bind:value={event.selectedVolunteer}
        >
          {#if empty}
            <option value={null}>Add a volunteer!</option>
          {:else}
            {#each event.volunteers as volunteer (volunteer.key)}
              <option value={volunteer}>{volunteer.name}</option>
            {/each}
          {/if}
        </select>
      </div>
      <div class="buttons is-centered mt-4">
        {#if canAdd}
          <button class="button is-primary" onclick={onAdd}>Add Volunteer</button>
        {/if}
        {#if !empty && event.interactive}
          <button class="button is-warning" onclick={onUpdate}>Update Volunteer</button>
        {/if}
      </div>
    </div>
  </div>
</div>
