<script>
  /**
   * The logged-in landing page: events you administer, and events you have
   * RSVP'd to. docs/legacy/02-aesthetics.md §1.3.
   *
   * The legacy fired these two requests from inside its response-header
   * absorption, which ran on essentially every API call — so any request while
   * the dashboard was visible triggered two more (behavior §6.22). Here they
   * load once, driven by the account.
   *
   * Note this only works at all because ListEvents no longer requires ADMIN;
   * a STANDARD user listing their own events used to get a 403.
   */
  import EventListBox from './EventListBox.svelte';
  import { session } from '../../state/session.svelte.js';
  import * as api from '../../lib/api/index.js';

  let { onSelect } = $props();

  let owned = $state(null);
  let rsvped = $state(null);

  $effect(() => {
    const account = session.account;
    if (!account) return;

    let cancelled = false;
    const now = Date.now();

    api.listEvents({ admin: account, earliest: now })
      .then((r) => { if (!cancelled) owned = r.events ?? []; })
      .catch(() => { if (!cancelled) owned = []; });

    api.listEvents({ volunteer: account, earliest: now })
      .then((r) => { if (!cancelled) rsvped = r.events ?? []; })
      .catch(() => { if (!cancelled) rsvped = []; });

    return () => { cancelled = true; };
  });
</script>

<section id="list-event-section" class="section">
  <div class="grid">
    <div class="cell">
      <EventListBox heading="Your Upcoming Events" events={owned} {onSelect} />
    </div>
    <div class="cell">
      <EventListBox heading="Your Upcoming RSVPs" events={rsvped} {onSelect} />
    </div>
  </div>
</section>
