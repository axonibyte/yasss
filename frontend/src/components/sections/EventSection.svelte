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
  import { loadCalendar } from '../../lib/calendar.js';
  import { fmtZoneLabel, localZone } from '../../lib/format/dates.js';

  let {
    event,
    onEditSummary, onViewReport, onShare,
    onAddVolunteer, onUpdateVolunteer,
    onActivityClick, onWindowClick, onSlotClick,
    onAddActivity, onAddWindow, onAddField,
    onPublish, onEnterEdit, onExitEdit, onSubmitRsvps,
    onDetailClick,
    onDetailMove = null,
    /** True while a publish or RSVP submission is in flight. */
    busy = false,
  } = $props();

  const editingLayout = $derived(event.mode === Mode.CREATE || event.mode === Mode.EDIT);

  // Warm the date picker's chunk as soon as an editing surface appears. It is a
  // megabyte, and the only people who reach this are the ones about to need it,
  // so fetching it now costs a volunteer nothing and spares an organiser the
  // wait when they open the window editor.
  $effect(() => {
    if (editingLayout) loadCalendar().catch(() => {});
  });

  /**
   * Whether this viewer is the event's organiser.
   *
   * The null check is load-bearing rather than defensive. An event published
   * anonymously has a null `admin`, and an anonymous viewer has a null
   * `account`, so a bare equality makes every passer-by look like the owner of
   * every unowned event.
   */
  const isOwner = $derived(session.account !== null && session.account === event.admin);

  /** Only the event's owner may see the sign-in sheet. */
  const canViewReport = $derived(event.persisted && isOwner);

  /**
   * Named once here rather than appended to every window header: the grid holds
   * five fixed columns at any width, and an abbreviation on each costs more
   * than it explains.
   *
   * Shown only when it would tell the viewer something they do not already
   * assume — an event with no recorded zone renders in their own, and so does
   * an event whose zone *is* theirs. Resolved against the first window so the
   * daylight-saving abbreviation matches the event rather than today.
   */
  const zoneLabel = $derived(
    event.timezone && event.timezone !== localZone()
      ? fmtZoneLabel(event.timezone, event.windows[0]?.begin ?? null)
      : null,
  );

  const canEnterEdit = $derived(
    event.mode === Mode.VIEW
      && event.interactive
      && (session.owns(event.id) || isOwner),
  );

  /**
   * Whether another volunteer may be added. Mirrors the server's cap: with
   * multi-user signups off, one entry per identity — the organiser excepted,
   * since they are signing other people up rather than themselves.
   */
  const canAddVolunteer = $derived(
    event.interactive
      && !editingLayout
      && (event.allowMultiuserSignups
        || isOwner
        || (!event.volunteersMaxed && event.volunteers.length === 0)),
  );
</script>

<section id="view-event-section" class="section">
  <div class="card">
    <div class="card-content">
      <div class="content">
        <div class="grid">
          <div class="cell">
            <!--
              A test hook rather than a class: the read-back tests compare this
              node's textContent byte-for-byte against what the server stored,
              and locating it by heading level or by its own text would be
              circular.
            -->
            <!--
              `<h1>`, not `<h2>`. The event page is the most-navigated surface
              in the app and its document outline started at level two, so
              anyone jumping by heading landed nowhere and the page had no name.
              `is-size-2` keeps the rendered size exactly as it was, which is
              what the aesthetic conformance tests assert.
            -->
            <h1 class="is-size-2" data-testid="event-title">{event.title}</h1>
            <p>{event.description}</p>
            {#if zoneLabel}
              <p class="is-size-7 has-text-weight-semibold" data-testid="zone-note">
                All times shown in {zoneLabel}.
              </p>
            {/if}
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
              <DetailTable
                details={event.details}
                onSelect={onDetailClick}
                onMove={onDetailMove}
              />
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
            <!--
              Disabled while in flight. Publishing an event graph is the slowest
              request in the app and had no feedback at all, so a second click
              POSTed a second event.
            -->
            <button class="button is-primary" class:is-loading={busy} disabled={busy}
              onclick={onPublish}>Publish Event</button>
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
              <!--
                Same guard. Worse here than for publish: pendingVolunteers()
                filters on !persisted and ids only arrive with the responses, so
                a second click re-submitted the very same volunteers.
              -->
              <button class="button is-primary" class:is-loading={busy} disabled={busy}
                onclick={onSubmitRsvps}>Submit RSVPs</button>
            {/if}
          {/if}
        </div>
      </div>
    </div>
  </div>
</section>
