<script>
  /**
   * The event view: summary, grid, and the action bar.
   *
   * Three modes share this tree (docs/legacy/01-behavior.md §0.3): building a
   * new event, editing a published one, and viewing/RSVPing. The legacy toggled
   * roughly twenty element visibilities imperatively per transition; here each
   * affordance derives from `event.mode` and the session.
   */
  import EventGrid from '../grid/EventGrid.svelte';
  import VolunteerPanel from './VolunteerPanel.svelte';
  import DetailTable from './DetailTable.svelte';
  import { Mode } from '../../state/event.svelte.js';
  import { session } from '../../state/session.svelte.js';

  let {
    event,
    onEditSummary, onViewReport, onShare,
    onAddVolunteer, onUpdateVolunteer,
    onActivityClick, onWindowClick, onSlotClick,
    onAddActivity, onAddWindow, onAddField,
    onPublish, onEnterEdit, onExitEdit, onSubmitRsvps,
    onDetailClick,
  } = $props();

  const editingLayout = $derived(event.mode === Mode.CREATE || event.mode === Mode.EDIT);

  /** Only the event's owner may see the sign-in sheet. */
  const canViewReport = $derived(
    event.persisted && session.account !== null && session.account === event.admin,
  );

  const canEnterEdit = $derived(
    event.mode === Mode.VIEW
      && event.interactive
      && (session.owns(event.id) || (session.account !== null && session.account === event.admin)),
  );

  /**
   * Whether another volunteer may be added. Mirrors the server's cap: with
   * multi-user signups off, one entry per identity.
   */
  const canAddVolunteer = $derived(
    event.interactive
      && !editingLayout
      && (event.allowMultiuserSignups
        || session.account === event.admin
        || (!event.volunteersMaxed && event.volunteers.length === 0)),
  );
</script>

<section id="view-event-section" class="section">
  <div class="card">
    <div class="card-content">
      <div class="content">
        <div class="grid">
          <div class="cell">
            <h2 class="is-size-2">{event.title}</h2>
            <p>{event.description}</p>
            <div class="buttons is-left">
              {#if editingLayout}
                <button class="button is-light is-outlined is-primary is-small" onclick={onEditSummary}>
                  Edit Summary
                </button>
              {/if}
              {#if canViewReport}
                <button class="button is-light is-outlined is-primary is-small" onclick={onViewReport}>
                  View Report
                </button>
              {/if}
              {#if event.persisted}
                <button class="button is-light is-outlined is-primary is-small" onclick={onShare}>
                  Share
                </button>
              {/if}
            </div>
          </div>

          <div class="cell">
            <!--
              The legacy showed the volunteer picker only outside edit mode and
              the field table only inside it. Preserved deliberately; see
              docs/rewrite-deltas.md.
            -->
            {#if editingLayout}
              <DetailTable details={event.details} onSelect={onDetailClick} />
            {:else}
              <VolunteerPanel
                {event}
                canAdd={canAddVolunteer}
                onAdd={onAddVolunteer}
                onUpdate={onUpdateVolunteer}
              />
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-content">
      <EventGrid {event} {onActivityClick} {onWindowClick} {onSlotClick} />
    </div>
  </div>

  <div id="view-event-buttons" class="card">
    <div class="card-content">
      <div class="content">
        <div class="buttons is-centered">
          {#if editingLayout}
            <button class="button is-light is-outlined is-primary" onclick={onAddActivity}>
              Add an Activity
            </button>
            <button class="button is-light is-outlined is-primary" onclick={onAddWindow}>
              Add a Window
            </button>
            <button class="button is-light is-outlined is-primary" onclick={onAddField}>
              Add a Field
            </button>
          {/if}

          {#if event.mode === Mode.CREATE}
            <button class="button is-primary" onclick={onPublish}>Publish Event</button>
          {/if}

          {#if event.mode === Mode.EDIT}
            <button class="button is-primary" onclick={onExitEdit}>Close Event Editor</button>
          {/if}

          {#if canEnterEdit}
            <button class="button is-warning" onclick={onEnterEdit}>Modify Event</button>
          {/if}

          {#if event.mode === Mode.VIEW}
            {#if event.expired && !session.isAdmin}
              <button class="button" disabled>This event has expired.</button>
            {:else}
              <button class="button is-primary" onclick={onSubmitRsvps}>Submit RSVPs</button>
            {/if}
          {/if}
        </div>
      </div>
    </div>
  </div>
</section>
