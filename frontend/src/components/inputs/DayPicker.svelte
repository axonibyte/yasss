<script>
  /**
   * The days of the week a relative poll asks about.
   *
   * Seven toggles rather than a multi-select: there are exactly seven, they are
   * always the same seven, and a list box that has to be opened to discover
   * that is worse than seven buttons that say so.
   *
   * ISO-8601 numbering, Monday through Sunday as 1 through 7, matching what the
   * server stores and what `java.time.DayOfWeek` returns -- so nothing anywhere
   * has to renumber anything.
   */
  import Field from './Field.svelte';

  let { selected = $bindable([]), error = null, id = 'day-picker' } = $props();

  const DAYS = [
    { iso: 1, short: 'Mon', long: 'Monday' },
    { iso: 2, short: 'Tue', long: 'Tuesday' },
    { iso: 3, short: 'Wed', long: 'Wednesday' },
    { iso: 4, short: 'Thu', long: 'Thursday' },
    { iso: 5, short: 'Fri', long: 'Friday' },
    { iso: 6, short: 'Sat', long: 'Saturday' },
    { iso: 7, short: 'Sun', long: 'Sunday' },
  ];

  function toggle(iso) {
    selected = selected.includes(iso)
      ? selected.filter((d) => d !== iso)
      : [...selected, iso].sort((a, b) => a - b);
  }
</script>

<Field label="Which days?" {error} {id}>
  <div class="buttons has-addons" {id} data-testid="day-picker">
    {#each DAYS as day (day.iso)}
      <button
        type="button"
        class="button is-small"
        class:is-primary={selected.includes(day.iso)}
        class:is-light={!selected.includes(day.iso)}
        aria-pressed={selected.includes(day.iso)}
        aria-label={day.long}
        onclick={() => toggle(day.iso)}
      >{day.short}</button>
    {/each}
  </div>
</Field>
