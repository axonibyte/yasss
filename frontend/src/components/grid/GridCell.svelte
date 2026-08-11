<script>
  /**
   * One tile in the event grid. docs/legacy/02-aesthetics.md §3.1.
   *
   * The markup is a one-item bulma-block-list inside a `.cell.event-cell`, and
   * the class string is normative — the whole aesthetic-conformance test suite
   * asserts it exactly.
   *
   * Two legacy defects are fixed here. The label was inserted with `.html()`,
   * making any activity short description an XSS vector; it is interpolated as
   * text now, and the only place that genuinely needs two lines (window
   * headers) passes them as separate values. And `data-tooltip` was set without
   * the `has-tooltip-*` class Bulma needs, so activity tooltips never actually
   * appeared.
   */
  let {
    label = '',
    /** Optional second line, for window headers. */
    secondLine = null,
    tooltip = '',
    /**
     * What this cell *is*, for slot cells: available, booked, full,
     * unavailable, editing. Absent on the header cells, which are not slots.
     */
    state = null,
    aesthetics = 'is-outlined is-primary',
    onclick = null,
    /**
     * What this tile is called, when the visible label does not say.
     *
     * Every slot in the grid renders as the word "Available", "Full" or
     * "Unavailable" and nothing else, because the row and column carry the rest
     * of the meaning — visually. A screen reader gets no grid, only a list of
     * buttons all named the same thing, with no way to tell which activity or
     * which time any of them is. The caller knows both, so it supplies the name.
     *
     */
    ariaLabel = null,
    /**
     * Extra controls rendered inside the tile, after the label.
     *
     * Added for the poll grid's "All Day" switch, which has to sit on the
     * column header itself. Deliberately a snippet rather than a `checkbox`
     * prop: this component knows about tiles and not about what any particular
     * grid wants to put in one, and a second grid asking for a second control
     * would otherwise mean a second branch here.
     *
     * Absent it renders nothing at all -- not an empty element -- so the event
     * grid's DOM is unchanged, which is what lets the conformance suite go on
     * asserting the tile markup byte for byte.
     */
    children = null,
    /**
     * Which column of the grid this tile sits in, when it sits in one.
     *
     * Absent on the row headers and the blank corner, which belong to no
     * column. It exists so something outside can point at a column: the grid is
     * a flat CSS grid with no per-column element, so "the Tuesday column" is
     * only expressible as the set of tiles carrying the same value here. The
     * tutorial highlights columns that way.
     */
    col = null,
    /**
     * Which row of the grid this tile sits in, when it sits in one.
     *
     * The other half of `col`, and it exists so a caller can name *one* square
     * rather than a column of them. Absent on the header row and the blank
     * corner. Together the two make every tile addressable: `[data-col="0"]` is
     * a column, `[data-col="0"][data-row="0"]` is a square.
     */
    row = null,
  } = $props();

  const listClass = $derived(
    `block-list is-small is-centered${aesthetics ? ` ${aesthetics}` : ''}`,
  );
  const interactive = $derived(onclick !== null);

</script>

<div
  class="cell event-cell"
  class:has-tooltip-top={Boolean(tooltip)}
  data-tooltip={tooltip || undefined}
  data-slot-state={state || undefined}
  data-col={col ?? undefined}
  data-row={row ?? undefined}
>
  <ul class={listClass}>
    <li>
      {#if interactive}
        <!--
          `title` carries the description, not a visually-hidden span. The
          description exists only as a CSS `:hover` tooltip, which no screen
          reader will announce and which in view mode is the only place it
          appears at all — but any in-DOM text lands in this tile's
          `textContent`, and both the grid tests and the aesthetic conformance
          suite compare that exactly. `title` on an element that already has a
          name from its content becomes its accessible *description*, which is
          precisely what a description should be.
        -->
        <button
          type="button"
          class="tile-action"
          aria-label={ariaLabel}
          title={tooltip || undefined}
          {onclick}
        >
          {label}{#if secondLine}<br />{secondLine}{/if}
        </button>
      {:else}
        {label}{#if secondLine}<br />{secondLine}{/if}
      {/if}
      {@render children?.()}
    </li>
  </ul>
</div>

<style>
  /* The <li> supplies the appearance; this is only an interaction target. */
  .tile-action {
    all: unset;
    cursor: pointer;
    width: 100%;
    height: 100%;
    /*
     * 44px is WCAG 2.5.5's target size, and these tiles measured 18. The grid is
     * a matrix that has to hold five columns at any width, so the tiles cannot
     * get wider — but they can get taller, and height is the axis that was
     * failing. Flex rather than block so a one-line label still sits in the
     * middle of the taller tile instead of at the top of it.
     */
    min-height: 2.75rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .tile-action:focus-visible {
    outline: 2px solid var(--bulma-primary);
    outline-offset: 2px;
  }

  /*
   * Bulma's tooltip only reveals on `:hover`, so the activity descriptions were
   * unreachable without a pointer. `:focus-within` on the cell gives a keyboard
   * user the same tooltip when they tab onto the tile inside it. Written with
   * `:global` because the tooltip element is Bulma's, not this component's, and
   * the attribute selector matches the same tiles the `has-tooltip-top` class
   * already applies to.
   */
  :global(.event-cell[data-tooltip]:focus-within)::before,
  :global(.event-cell[data-tooltip]:focus-within)::after {
    opacity: 1;
    visibility: visible;
  }
</style>
