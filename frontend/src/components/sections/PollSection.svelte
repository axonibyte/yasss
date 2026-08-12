<script>
  /**
   * The poll view: summary, grid, results, and the action bar.
   *
   * The same three modes as `EventSection` and for the same reasons -- building
   * one, editing one, answering one -- so the shape is deliberately familiar.
   * What differs is what sits beside the grid: an event offers a volunteer
   * picker because an organizer signs several people up, and a poll offers one
   * person's answer because that is all a poll ever collects.
   */
  import PollGrid from '../grid/PollGrid.svelte';
  import PollResultsPanel from './PollResultsPanel.svelte';
  import DetailTable from './DetailTable.svelte';
  import { Mode } from '../../state/poll.svelte.js';
  import { session } from '../../state/session.svelte.js';
  import { localZone, zoneNote } from '../../lib/poll/zones.js';

  let {
    poll,
    busy = false,
    onEditSummary,
    onShare,
    onDelete,
    onOptionClick,
    onWindowClick,
    onCellClick,
    onAllDayToggle,
    onAddOption,
    onAddWindow,
    onAddField,
    onDetailClick,
    onPublish,
    onEnterEdit,
    onExitEdit,
    onAnswer,
  } = $props();

  const editing = $derived(poll.mode === Mode.CREATE || poll.mode === Mode.EDIT);

  /**
   * Whether this viewer organizes this poll.
   *
   * The null check is load-bearing rather than defensive, exactly as it is on
   * the event side: a poll published anonymously has a null admin and an
   * anonymous viewer has a null account, so a bare equality would make every
   * passer-by the owner of every unowned poll.
   */
  /**
   * The sandbox clause is the same one `EventSection` carries, for the same
   * reason: the practice poll is the learner's, and the poll tutorial has to be
   * able to show them the owner's surface. Every write behind it is gated on
   * `isRemote`, which is false for a sandbox model.
   */
  const isOwner = $derived(
    poll.sandbox || (session.account !== null && session.account === poll.admin),
  );

  const canEnterEdit = $derived(poll.mode === Mode.VIEW && isOwner);

  const note = $derived(zoneNote(poll));

  const ZONES = (() => {
    const known = typeof Intl.supportedValuesOf === 'function'
      ? Intl.supportedValuesOf('timeZone')
      : [];
    return [...new Set(['UTC', localZone(), ...known])].filter(Boolean).sort();
  })();

  const answered = $derived(poll.ownResponse !== null);
</script>

<section id="view-poll-section" class="section">
  <div class="card">
    <div class="card-content">
      <div class="content">
        <div class="grid">
          <div class="cell">
            <h1 class="is-size-2" data-testid="poll-title">{poll.title}</h1>
            <p>{poll.description}</p>

            {#if note}
              <p class="is-size-7 has-text-weight-semibold" data-testid="poll-zone-note">{note}</p>
            {/if}

            {#if poll.closed}
              <p class="is-size-7 has-text-weight-semibold" data-testid="poll-closed">
                This poll has closed.
              </p>
            {/if}

            <div class="buttons is-left">
              {#if editing || isOwner}
                <button class="button is-light is-outlined is-primary is-small"
                  data-testid="poll-summary" onclick={onEditSummary}>
                  {editing ? 'Edit Settings' : 'Poll Settings'}
                </button>
              {/if}
              {#if poll.persisted}
                <button class="button is-light is-outlined is-primary is-small"
                  data-testid="poll-share" onclick={onShare}>Share</button>
              {/if}
              {#if isOwner}
                <button class="button is-light is-outlined is-danger is-small"
                  onclick={onDelete}>Delete Poll</button>
              {/if}
            </div>
          </div>

          <div class="cell">
            {#if editing}
              <DetailTable details={poll.details} onSelect={onDetailClick} />
            {:else}
              <!--
                Where the volunteer picker sits on an event. A poll has one
                respondent, so this says who that is rather than offering a
                choice between several.
              -->
              <div class="field" id="view-poll-answer">
                <p class="has-text-weight-semibold">
                  {answered ? `You answered as ${poll.ownResponse.name}.` : 'You have not answered yet.'}
                </p>
                {#if poll.timeMode === 'ZONED' && poll.timezone}
                  <div class="field mt-2">
                    <label class="label is-small" for="poll-display-zone">Show times in</label>
                    <div class="select is-small is-fullwidth">
                      <select id="poll-display-zone" data-testid="poll-display-zone"
                        value={poll.displayZone ?? localZone()}
                        onchange={(e) => { poll.displayZone = e.currentTarget.value; }}>
                        {#each ZONES as zone (zone)}<option value={zone}>{zone}</option>{/each}
                      </select>
                    </div>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-content">
      <PollGrid {poll} {onOptionClick} {onWindowClick} {onCellClick} {onAllDayToggle} />
    </div>
  </div>

  {#if poll.tallyVisible && !editing}
    <PollResultsPanel {poll} />
  {/if}

  <div id="view-poll-buttons" class="card">
    <div class="card-content">
      <div class="content">
        <div class="buttons is-centered">
          {#if editing}
            <button class="button is-light is-outlined is-primary" data-testid="add-poll-option"
              onclick={onAddOption}>Add a Day</button>
            <button class="button is-light is-outlined is-primary" data-testid="add-poll-window"
              onclick={onAddWindow}>Add a Time</button>
            <button class="button is-light is-outlined is-primary" data-testid="add-poll-field"
              onclick={onAddField}>Add a Question</button>
          {/if}

          {#if poll.mode === Mode.CREATE}
            <button class="button is-primary" data-testid="publish-poll"
              class:is-loading={busy} disabled={busy} onclick={onPublish}>Publish Poll</button>
          {/if}

          {#if poll.mode === Mode.EDIT}
            <button class="button is-primary" onclick={onExitEdit}>Close Poll Editor</button>
          {/if}

          {#if canEnterEdit}
            <button class="button is-warning" data-testid="modify-poll"
              onclick={onEnterEdit}>Modify Poll</button>
          {/if}

          {#if poll.mode === Mode.VIEW}
            {#if poll.closed}
              <button class="button" disabled>This poll has closed.</button>
            {:else if answered && !poll.allowAnswerEdits}
              <!--
                Said rather than shown as a dead button with no explanation: the
                organizer turned edits off, and somebody who already answered
                needs to know that is why they cannot change it.
              -->
              <button class="button" disabled>You have answered. This poll does not allow changes.</button>
            {:else}
              <button class="button is-primary" data-testid="answer-poll"
                class:is-loading={busy} disabled={busy} onclick={onAnswer}>
                {answered ? 'Update Your Answer' : 'Answer This Poll'}
              </button>
            {/if}
          {/if}
        </div>
      </div>
    </div>
  </div>
</section>
