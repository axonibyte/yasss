<script>
  /**
   * "Apply to", which is two controls wearing one label.
   *
   * The columns picked now are a list, resolved immediately. "And every day I
   * add later" is not a list at all -- it is a standing rule stored on the row
   * and applied by the server when a column is added, because the columns it
   * has to cover do not exist yet. They are shown as separate controls because
   * they are separate things, and collapsing them into one multi-select with a
   * magic "future" entry would suggest otherwise.
   */
  import Field from './Field.svelte';

  let {
    mode = $bindable('all'),
    selected = $bindable([]),
    future = $bindable(false),
    options = [],
    scope = 'RELATIVE',
  } = $props();

  const WEEKDAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  function label(option) {
    if (scope === 'RELATIVE') return WEEKDAYS[option.dayOfWeek] ?? '';
    if (!option.date) return '';
    const [year, month, day] = option.date.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
      .format(new Date(year, month - 1, day));
  }

  /**
   * Columns are identified by server id where they have one and by local key
   * where they do not, so this works the same on a draft as on a published
   * poll.
   */
  const idOf = (option) => option.id ?? option.key;

  function toggle(option) {
    const value = idOf(option);
    selected = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value];
  }
</script>

<Field label="Apply to">
  <div class="control">
    <label class="radio">
      <input type="radio" name="apply-to" value="all" checked={mode === 'all'}
        onchange={() => { mode = 'all'; }} />
      All days
    </label>
    <label class="radio">
      <input type="radio" name="apply-to" value="some" checked={mode === 'some'}
        onchange={() => { mode = 'some'; }} />
      Only the days I pick
    </label>
  </div>

  {#if mode === 'some'}
    <div class="buttons mt-2" data-testid="apply-to-days">
      {#each options as option (option.key)}
        <button
          type="button"
          class="button is-small"
          class:is-primary={selected.includes(idOf(option))}
          class:is-light={!selected.includes(idOf(option))}
          aria-pressed={selected.includes(idOf(option))}
          onclick={() => toggle(option)}
        >{label(option)}</button>
      {/each}
    </div>
  {/if}

  <label class="checkbox mt-2">
    <input type="checkbox" bind:checked={future} data-testid="apply-to-future" />
    &ensp;...and any day I add to this poll later
  </label>
</Field>
