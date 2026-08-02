<script>
  /**
   * One dashboard box. docs/legacy/02-aesthetics.md §1.3.
   *
   * The list's class flips between `is-centered` when empty and `is-primary`
   * when populated — that is the legacy's appearance, not an accident.
   */
  let { heading, events = null, onSelect } = $props();

  const loading = $derived(events === null);
  const empty = $derived(!loading && events.length === 0);
</script>

<div class="box">
  <p class="subtitle has-text-centered">{heading}</p>
  <ul class="block-list" class:is-centered={loading || empty} class:is-primary={!loading && !empty}>
    {#if loading}
      <li>Loading...</li>
    {:else if empty}
      <li>No events.</li>
    {:else}
      {#each events as event (event.id)}
        <!--
          The legacy bound a click handler straight to the <li>, which is not
          reachable by keyboard or announced as actionable. The <li> stays the
          styled container (bulma-block-list targets it directly) and a real
          button inside carries the interaction.
        -->
        <li>
          <button type="button" class="entry" onclick={() => onSelect?.(event.id)}>
            {event.shortDescription}
          </button>
        </li>
      {/each}
    {/if}
  </ul>
</div>

<style>
  /* The button is purely an interaction target; the <li> supplies the look. */
  .entry {
    all: unset;
    cursor: pointer;
    display: block;
    width: 100%;
  }
  .entry:focus-visible {
    outline: 2px solid var(--bulma-primary);
    outline-offset: 2px;
  }
</style>
