<script>
  /**
   * Activities across, windows down, with the activity axis paged by a slider.
   *
   * docs/legacy/01-behavior.md §2.3-§2.5. All windows always render — only the
   * activity axis is windowed, and the column count is capped at five including
   * the leading label column.
   *
   * The legacy drove the slider through a hidden `<output>` and a
   * MutationObserver, and its refresh helper accepted a step it then failed to
   * forward — so any refresh snapped the table back to the first four columns
   * while the slider thumb still showed the old position. Here the visible
   * range is derived from the step, so the two cannot disagree.
   */
  import GridCell from './GridCell.svelte';
  import { colsFor, slotCell, visibleActivities, EMPTY_GRID_MESSAGE } from '../../lib/grid.js';
  import { Mode } from '../../state/event.svelte.js';

  let { event, onActivityClick, onWindowClick, onSlotClick } = $props();

  const cols = $derived(colsFor(event.activities.length));
  const shown = $derived(visibleActivities(event.activities, event.step));
  const editing = $derived(event.mode === Mode.EDIT || event.mode === Mode.CREATE);

  function cellFor(activity, win) {
    const slot = event.slot(activity, win);
    if (!slot) return { label: 'Unavailable', aesthetics: 'is-outlined is-light' };
    return slotCell({
      enabled: slot.enabled,
      editing: event.mode === Mode.EDIT,
      hasRsvp: event.hasRsvp(slot),
      atCapacity: event.atCapacity(activity, slot),
      rsvpCount: slot.rsvpCount,
      cap: slot.cap,
    });
  }

  /**
   * What a slot tile is called.
   *
   * The visible label is "Available", "Full", "Unavailable" or a count, and
   * which activity and which time it belongs to is carried entirely by its
   * position in the table. That works if you can see the table. To a screen
   * reader the grid was a run of identically-named buttons — "Available,
   * Available, Available" — with no way to tell any of them apart, which made
   * signing up impossible rather than merely awkward.
   *
   * The window's two lines are joined with an en dash so the range reads as one
   * phrase rather than two sentences.
   */
  function slotName(activity, win, state) {
    const when = win.labelParts.end
      ? `${win.labelParts.begin} – ${win.labelParts.end}`
      : win.labelParts.begin;
    return `${activity.label}, ${when}: ${state}`;
  }

  /**
   * Slots are clickable when an owner is editing the layout, or when a
   * volunteer is selected and there is something to toggle.
   */
  function slotHandler(activity, win) {
    if (!onSlotClick) return null;
    if (editing) return () => onSlotClick(activity, win);
    if (!event.interactive || !event.selectedVolunteer) return null;

    const slot = event.slot(activity, win);
    if (!slot?.enabled) return null;
    // An unheld slot at capacity cannot be claimed; a held one can be released.
    if (!event.hasRsvp(slot) && event.atCapacity(activity, slot)) return null;
    return () => onSlotClick(activity, win);
  }
</script>

<div id="view-event-table" class="content">
  {#if event.isEmpty}
    <div class="fixed-grid has-1-cols">
      <div class="grid">
        <GridCell label={EMPTY_GRID_MESSAGE} aesthetics="is-warning" />
      </div>
    </div>
  {:else}
    <div class="fixed-grid has-{cols}-cols">
      <div class="grid">
        <!-- blank corner above the window labels -->
        <GridCell label="" aesthetics="" />

        {#each shown as activity (activity.key)}
          <GridCell
            label={activity.label}
            tooltip={activity.description}
            aesthetics="is-primary"
            onclick={onActivityClick ? () => onActivityClick(activity) : null}
          />
        {/each}

        {#each event.windows as win (win.key)}
          <GridCell
            label={win.labelParts.begin}
            secondLine={win.labelParts.end}
            aesthetics="is-primary"
            onclick={onWindowClick ? () => onWindowClick(win) : null}
          />
          {#each shown as activity (activity.key)}
            {@const cell = cellFor(activity, win)}
            <GridCell
              label={cell.label}
              aesthetics={cell.aesthetics}
              state={cell.state}
              ariaLabel={slotName(activity, win, cell.label)}
              onclick={slotHandler(activity, win)}
            />
          {/each}
        {/each}
      </div>
    </div>
  {/if}
</div>

{#if event.maxStep > 1}
  <input
    id="view-event-slider"
    class="slider is-fullwidth is-small is-primary is-light"
    type="range"
    step="1"
    min="1"
    max={event.maxStep}
    aria-label="Scroll activities"
    bind:value={event.step}
  />
{/if}
