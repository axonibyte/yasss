<script>
  /**
   * The specific dates an absolute poll asks about.
   *
   * Add-one-at-a-time chips rather than a range: a poll's dates are frequently
   * not contiguous -- "the 3rd, the 8th or the 15th" is the ordinary shape of
   * the question -- and a range control cannot say that.
   *
   * Dates are held as `yyyy-MM-dd` strings the whole way through, never as
   * Dates. `new Date('2026-09-03')` is UTC midnight and renders as the 2nd
   * anywhere west of Greenwich, which would move a column by a day for half the
   * world.
   */
  import Field from './Field.svelte';
  import { fieldAria } from '../../lib/a11y.js';

  let { selected = $bindable([]), error = null, id = 'date-picker' } = $props();

  let pending = $state('');

  /** Today, in the reader's own zone, so the picker cannot offer yesterday. */
  const today = (() => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  })();

  function add() {
    if (!pending || selected.includes(pending)) return;
    selected = [...selected, pending].sort();
    pending = '';
  }

  const remove = (date) => { selected = selected.filter((d) => d !== date); };

  /** Rendered from the parts, never through a Date -- see the note above. */
  function label(date) {
    const [year, month, day] = date.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    }).format(new Date(year, month - 1, day));
  }
</script>

<Field label="Which dates?" {error} {id}>
  <div class="field has-addons">
    <div class="control is-expanded">
      <input
        {id}
        {...fieldAria(id, error)}
        class="input"
        class:is-danger={error}
        type="date"
        min={today}
        bind:value={pending}
      />
    </div>
    <div class="control">
      <button type="button" class="button is-primary" onclick={add} disabled={!pending}>
        Add
      </button>
    </div>
  </div>

  {#if selected.length}
    <div class="tags mt-2" data-testid="date-chips">
      {#each selected as date (date)}
        <span class="tag is-primary is-light">
          {label(date)}
          <button
            type="button"
            class="delete is-small"
            aria-label={`Remove ${label(date)}`}
            onclick={() => remove(date)}
          ></button>
        </span>
      {/each}
    </div>
  {/if}
</Field>
