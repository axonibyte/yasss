/**
 * The event currently on screen, and the three modes it can be in.
 *
 * The legacy tracked mode with two loosely-coupled booleans plus the presence
 * of an id, and every visibility rule re-derived it inline. Here `mode` is a
 * single derivation and the components read it.
 *
 * See docs/legacy/01-behavior.md §0.3.
 */
import { Activity, Detail, EventWindow, Slot, Volunteer } from './entities.svelte.js';
import { clampStep, maxStep } from '../lib/grid.js';
import { localZone } from '../lib/format/dates.js';
import {
  activityFromApi, detailFromApi, eventSummaryFromApi, windowFromEventRead,
} from '../lib/api/dto.js';

/** @enum {string} */
export const Mode = {
  /** Building a new event locally; nothing is persisted until publish. */
  CREATE: 'create',
  /** A published event, being edited by its owner; every change publishes. */
  EDIT: 'edit',
  /** A published event, being viewed and RSVP'd to. */
  VIEW: 'view',
};

export class EventModel {
  id = $state(null);
  admin = $state(null);
  title = $state('');
  description = $state('');
  notifyOnSignup = $state(true);
  allowMultiuserSignups = $state(false);
  isPublished = $state(false);
  /** IANA zone the event happens in; null means render in the viewer's own. */
  timezone = $state(null);
  /** Minutes of notice for reminders; null means use the platform default. */
  reminderLeadTime = $state(null);
  volunteersMaxed = $state(false);
  expired = $state(false);

  activities = $state([]);
  windows = $state([]);
  details = $state([]);
  volunteers = $state([]);

  /**
   * The volunteer whose RSVPs the grid reflects.
   *
   * An object reference, not an index. The legacy stored a number derived via
   * `Number(selected.val())`, which yields NaN when nothing is selected — and
   * then indexed the array with it, so any subsequent slot click threw
   * (behavior §6.12).
   */
  selectedVolunteer = $state(null);

  editing = $state(false);
  /** Horizontal paging position for the activity axis. */
  step = $state(1);

  get persisted() {
    return this.id !== null;
  }

  mode = $derived(
    !this.persisted ? Mode.CREATE : this.editing ? Mode.EDIT : Mode.VIEW,
  );

  isEmpty = $derived(this.activities.length === 0 && this.windows.length === 0);

  maxStep = $derived(maxStep(this.activities.length));

  /** True when the viewer may act on cells at all. */
  interactive = $derived(!this.expired);

  reset() {
    this.id = null;
    this.admin = null;
    this.title = '';
    this.description = '';
    this.notifyOnSignup = true;
    this.allowMultiuserSignups = false;
    this.isPublished = false;
    // A new event is being built by someone who is, presumably, in the place it
    // happens, so their browser's zone is the best available guess. `load()`
    // overwrites this from the payload, so an event that recorded no zone stays
    // null and keeps rendering in each viewer's own.
    this.timezone = localZone();
    this.reminderLeadTime = null;
    this.volunteersMaxed = false;
    this.expired = false;
    this.activities = [];
    this.windows = [];
    this.details = [];
    this.volunteers = [];
    this.selectedVolunteer = null;
    this.editing = false;
    this.step = 1;
  }

  /** Keep the paging position valid as activities come and go. */
  clampStep() {
    this.step = clampStep(this.step, this.activities.length);
  }

  slot(activity, win) {
    return activity.slots.get(win.key) ?? null;
  }

  /** Does the selected volunteer hold this slot? */
  hasRsvp(slot) {
    return this.selectedVolunteer?.rsvps.has(slot.key) ?? false;
  }

  /**
   * A slot is full if it has hit its own cap or its activity's.
   * @param {Activity} activity
   */
  atCapacity(activity, slot) {
    return slot.full || activity.atCapacity;
  }

  addVolunteer(volunteer) {
    this.volunteers = [...this.volunteers, volunteer];
    this.selectedVolunteer = volunteer;
    return volunteer;
  }

  /**
   * Remove a volunteer, releasing every slot they held.
   *
   * The legacy dropped the volunteer from its array but left their id in each
   * slot's RSVP list and never decremented the counts, so the grid kept showing
   * them as booked (and possibly at capacity) until a reload (behavior §6.13).
   */
  removeVolunteer(volunteer) {
    for (const activity of this.activities) {
      for (const slot of activity.slots.values()) {
        if (volunteer.rsvps.has(slot.key)) {
          slot.rsvpCount = Math.max(0, slot.rsvpCount - 1);
          if (volunteer.id) slot.rsvps.delete(volunteer.id);
        }
      }
    }
    this.volunteers = this.volunteers.filter((v) => v !== volunteer);
    if (this.selectedVolunteer === volunteer) {
      this.selectedVolunteer = this.volunteers[0] ?? null;
    }
  }

  /** Claim a slot for the selected volunteer, locally. */
  addRsvp(volunteer, slot) {
    if (volunteer.rsvps.has(slot.key)) return;
    volunteer.rsvps.add(slot.key);
    slot.rsvpCount += 1;
    if (volunteer.id) slot.rsvps.add(volunteer.id);
  }

  /** Release a slot, locally. */
  removeRsvp(volunteer, slot) {
    if (!volunteer.rsvps.has(slot.key)) return;
    volunteer.rsvps.delete(slot.key);
    slot.rsvpCount = Math.max(0, slot.rsvpCount - 1);
    // Guarded: the legacy called indexOf on an undefined id, got -1, and
    // splice(-1, 1) then removed some other volunteer's entry (behavior §6.11).
    if (volunteer.id) slot.rsvps.delete(volunteer.id);
  }

  removeWindow(win) {
    for (const activity of this.activities) activity.slots.delete(win.key);
    this.windows = this.windows.filter((w) => w !== win);
  }

  removeActivity(activity) {
    // Slots live on the activity, so they go with it.
    this.activities = this.activities.filter((a) => a !== activity);
    this.clampStep();
  }

  /**
   * Rebuild from `GET /v1/events/:event`.
   *
   * Two shapes need reconstructing. Slots arrive nested inside activities and
   * only when enabled, so every (activity, window) pair gets a disabled slot
   * first and the response overlays the enabled ones. And RSVPs arrive
   * per-slot as volunteer ids, so the per-volunteer view is a reverse index
   * built here rather than requested separately.
   */
  load(payload) {
    this.reset();
    Object.assign(this, eventSummaryFromApi(payload));

    // The zone is copied onto each window so its label can stay a plain
    // derived rather than reaching back up to the event.
    const windows = (payload.windows ?? []).map(
      (w) => new EventWindow({ ...windowFromEventRead(w), timezone: this.timezone }),
    );
    const windowByServerId = new Map(windows.map((w) => [w.id, w]));

    const activities = (payload.activities ?? []).map((raw) => {
      const activity = new Activity(activityFromApi(raw));
      for (const win of windows) {
        activity.slots.set(win.key, new Slot(activity.key, win.key, {
          enabled: false,
          cap: activity.slotCapDefault,
        }));
      }
      for (const rawSlot of raw.slots ?? []) {
        const win = windowByServerId.get(rawSlot.window);
        if (!win) continue; // a slot for a window we were not given
        activity.slots.set(win.key, new Slot(activity.key, win.key, {
          enabled: true,
          cap: rawSlot.maxSlotVolunteers ?? activity.slotCapDefault,
          rsvpCount: rawSlot.rsvpCount ?? 0,
          rsvps: rawSlot.rsvps ?? [],
        }));
      }
      return activity;
    });

    const details = (payload.details ?? []).map((d) => new Detail(detailFromApi(d)));
    const detailByServerId = new Map(details.map((d) => [d.id, d]));

    const volunteers = (payload.volunteers ?? []).map((raw) => {
      const volunteer = new Volunteer({
        id: raw.id,
        name: raw.name ?? '',
        remindersEnabled: Boolean(raw.remindersEnabled),
        // The address itself is deliberately never sent back, so an organiser
        // reading the event cannot harvest volunteers' contact details.
        reminderConfirmed: Boolean(raw.reminderConfirmed),
        user: raw.user ?? null,
      });
      for (const entry of raw.details ?? []) {
        const detail = detailByServerId.get(entry.detail);
        // Silently drop answers to details we do not know about.
        if (detail) volunteer.values.set(detail.key, entry.value);
      }
      return volunteer;
    });

    // Reverse the per-slot RSVP lists into per-volunteer membership.
    const volunteerById = new Map(volunteers.filter((v) => v.id).map((v) => [v.id, v]));
    for (const activity of activities) {
      for (const slot of activity.slots.values()) {
        for (const volunteerId of slot.rsvps) {
          volunteerById.get(volunteerId)?.rsvps.add(slot.key);
        }
      }
    }

    this.windows = windows;
    this.activities = activities;
    this.details = details;
    this.volunteers = volunteers;
    this.selectedVolunteer = volunteers[0] ?? null;
  }
}

export const currentEvent = new EventModel();
