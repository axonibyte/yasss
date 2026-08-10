<script>
  /**
   * Days across, times down, with the day axis paged by a slider.
   *
   * A sibling of `EventGrid` rather than a generalisation of it. The two share
   * `lib/grid.js` for the layout arithmetic and `GridCell` for the tile, which
   * is everything that actually matters -- but the poll grid puts a switch on
   * its column headers, greys a whole column when that switch is on, and has a
   * different vocabulary of cell states. Growing `EventGrid` a set of props to
   * cover all that would put its byte-for-byte conformance suite up for
   * negotiation on every one of them.
   */
  import GridCell from './GridCell.svelte';
  import { colsFor, pollCell, visibleActivities, EMPTY_POLL_MESSAGE } from '../../lib/grid.js';
  import { Mode } from '../../state/poll.svelte.js';
  import { windowLabel } from '../../lib/poll/zones.js';

  let {
    poll,
    onOptionClick = null,
    onWindowClick = null,
    onCellClick = null,
    onAllDayToggle = null,
  } = $props();

  const cols = $derived(colsFor(poll.options.length));
  const shown = $derived(visibleActivities(poll.options, poll.step));
  const editing = $derived(poll.mode === Mode.EDIT || poll.mode === Mode.CREATE);

  const WEEKDAYS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  /**
   * What a column is called.
   *
   * Dates are rendered from their parts rather than through a Date, because the
   * column is a calendar day and not an instant -- `new Date('2026-09-03')`
   * parses as UTC midnight and renders as the second of September to anybody
   * west of Greenwich.
   */
  function optionLabel(option) {
    if (poll.scope === 'RELATIVE') return WEEKDAYS[option.dayOfWeek] ?? '';
    if (!option.date) return '';
    const [year, month, day] = option.date.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
      new Date(year, month - 1, day),
    );
  }

  /**
   * The first column, used to resolve daylight saving for the row headers.
   *
   * KNOWN LIMITATION, and deliberately this way round: on an absolute poll
   * whose dates straddle a daylight-saving transition, the converted line is an
   * hour out for the columns on the far side of it. The canonical line above it
   * is always exact, which is why that is the one shown first and the one the
   * squares are keyed to. Rendering a converted time per square instead would
   * be correct and would also stop the grid being a grid.
   */
  const reference = $derived(poll.options[0] ?? null);

  function labelFor(win) {
    return windowLabel(win.startTime, poll, reference);
  }

  function cellFor(option, win) {
    const cell = poll.cell(option, win);
    return pollCell({
      offered: Boolean(cell),
      suppressed: option.allDay,
      editing,
      voted: poll.chose(cell),
      votes: poll.votesFor(cell),
    });
  }

  /**
   * What a square is called, for anybody who cannot see the grid.
   *
   * The visible label is a word or a number; which day and which time it
   * belongs to is carried entirely by where it sits. That works if you can see
   * where it sits.
   */
  function cellName(option, win, state) {
    const when = labelFor(win);
    return `${optionLabel(option)}, ${when.primary}: ${state}`;
  }

  function cellHandler(option, win) {
    if (!onCellClick) return null;
    if (editing) return () => onCellClick(option, win);
    // An all-day column is answered on its header square, not here.
    if (option.allDay) return null;
    if (!poll.interactive) return null;
    if (!poll.offers(option, win)) return null;
    return () => onCellClick(option, win);
  }

  /** The all-day square is the header's own, and is voted for like any other. */
  function allDayHandler(option) {
    if (editing || !onCellClick) return null;
    if (!option.allDay || !poll.interactive) return null;
    if (!poll.offers(option, null)) return null;
    return () => onCellClick(option, null);
  }
</script>

<div id="view-poll-table" class="content">
  {#if poll.isEmpty}
    <div class="fixed-grid has-1-cols">
      <div class="grid">
        <GridCell label={EMPTY_POLL_MESSAGE} aesthetics="is-warning" />
      </div>
    </div>
  {:else}
    <div class="fixed-grid has-{cols}-cols">
      <div class="grid">
        <!-- blank corner above the time labels -->
        <GridCell label="" aesthetics="" />

        {#each shown as option (option.key)}
          {@const chosen = poll.chose(poll.cell(option, null))}
          <GridCell
            label={optionLabel(option)}
            aesthetics={option.allDay && chosen ? 'is-warning' : 'is-primary'}
            onclick={editing && onOptionClick
              ? () => onOptionClick(option)
              : allDayHandler(option)}
            ariaLabel={option.allDay
              ? `${optionLabel(option)}, all day: ${chosen ? 'Voted' : 'Available'}`
              : undefined}
          >
            {#if editing && onAllDayToggle}
              <label class="all-day">
                <input
                  type="checkbox"
                  checked={option.allDay}
                  data-testid="all-day-toggle"
                  aria-label={`All day on ${optionLabel(option)}`}
                  onchange={(e) => onAllDayToggle(option, e.currentTarget.checked)}
                />
                All Day
              </label>
            {:else if option.allDay}
              <span class="all-day-note">All Day</span>
            {/if}
          </GridCell>
        {/each}

        {#each poll.windows as win (win.key)}
          {@const when = labelFor(win)}
          <GridCell
            label={when.primary}
            secondLine={when.secondary}
            aesthetics="is-primary"
            onclick={editing && onWindowClick ? () => onWindowClick(win) : null}
          />
          {#each shown as option (option.key)}
            {@const cell = cellFor(option, win)}
            <GridCell
              label={cell.label}
              aesthetics={cell.aesthetics}
              state={cell.state}
              ariaLabel={cellName(option, win, cell.label)}
              onclick={cellHandler(option, win)}
            />
          {/each}
        {/each}
      </div>
    </div>
  {/if}
</div>

{#if poll.maxStep > 1}
  <input
    id="view-poll-slider"
    class="slider is-fullwidth is-small is-primary is-light"
    type="range"
    step="1"
    min="1"
    max={poll.maxStep}
    aria-label="Scroll days"
    bind:value={poll.step}
  />
{/if}

<style>
  /*
   * Small, and inside the tile rather than under it: the header is one row of a
   * fixed grid, and anything that grows it grows every column with it.
   */
  .all-day,
  .all-day-note {
    display: block;
    font-size: 0.7rem;
    font-weight: 600;
    line-height: 1.2;
  }
  .all-day input {
    margin-right: 0.2rem;
    vertical-align: middle;
  }
</style>
