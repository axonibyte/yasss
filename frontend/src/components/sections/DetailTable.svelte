<script>
  /**
   * The custom-fields configuration table. docs/legacy/02-aesthetics.md §1.4.
   *
   * Only ever shown to someone editing the event. The legacy built this table
   * and then hid it from every non-admin, so the work was thrown away for
   * volunteers; that visibility is preserved deliberately, and the decision is
   * recorded in docs/rewrite-deltas.md.
   *
   * Note `is-hoverable` is added only when there are rows to hover, matching
   * the legacy exactly.
   */
  import { typeLabel } from '../../lib/validation/detailTypes.js';

  let { details = [], onSelect } = $props();

  const empty = $derived(details.length === 0);
</script>

<div id="view-event-details" class="card">
  <header class="card-header">
    <p class="card-header-title">Custom Fields</p>
  </header>
  <div class="card-content">
    <div class="content">
      <table class="table is-bordered is-fullwidth" class:is-hoverable={!empty}>
        <tbody>
          <tr class="is-primary">
            <th>Detail</th>
            <th>Type</th>
          </tr>
          {#if empty}
            <tr>
              <td class="is-light is-warning has-text-centered is-size-7" colspan="2">
                You haven't specified any custom fields yet! :)
              </td>
            </tr>
          {:else}
            {#each details as detail (detail.key)}
              <tr>
                <td>
                  <button type="button" class="row-action" onclick={() => onSelect?.(detail)}>
                    {detail.label}
                  </button>
                </td>
                <td>{typeLabel(detail.type)}{detail.required ? ' (required)' : ''}</td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</div>

<style>
  .row-action {
    all: unset;
    cursor: pointer;
    display: block;
    width: 100%;
  }
  .row-action:focus-visible {
    outline: 2px solid var(--bulma-primary);
    outline-offset: 2px;
  }
</style>
