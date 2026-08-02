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
    aesthetics = 'is-outlined is-primary',
    onclick = null,
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
>
  <ul class={listClass}>
    <li>
      {#if interactive}
        <button type="button" class="tile-action" {onclick}>
          {label}{#if secondLine}<br />{secondLine}{/if}
        </button>
      {:else}
        {label}{#if secondLine}<br />{secondLine}{/if}
      {/if}
    </li>
  </ul>
</div>

<style>
  /* The <li> supplies the appearance; this is only an interaction target. */
  .tile-action {
    all: unset;
    cursor: pointer;
    display: block;
    width: 100%;
    height: 100%;
  }
  .tile-action:focus-visible {
    outline: 2px solid var(--bulma-primary);
    outline-offset: 2px;
  }
</style>
