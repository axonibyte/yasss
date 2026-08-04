/*
 * Tie an RSVP to the slot it claims, so unsetting a slot takes its RSVPs with it.
 *
 * `rsvp` is foreign-keyed to activity, event_window and volunteer, but never to
 * `slot` -- which is the thing it actually claims a seat in, keyed on
 * (activity, event_window). So `UnsetSlotEndpoint` deleted the slot row and
 * left every RSVP behind.
 *
 * The orphans were not inert. They still matched `RSVP.countSlot` and
 * `countActivity`, so they went on counting toward the caps; and
 * `RSVP.slotCap`'s `if(!res.next())` treats a missing slot row as full. The
 * visible symptom was a volunteer being told "volunteer cap exceeded" for a
 * slot that no longer existed, on an activity that looked empty.
 *
 * CASCADE rather than a delete in `Slot.delete()`: the invariant is that an
 * RSVP cannot outlive its slot, and a constraint enforces that against every
 * path -- including the event and activity cascades, and anything anyone writes
 * later -- where application code only enforces it against the one caller that
 * remembers to.
 *
 * Two statements, guarded, because neither is naturally idempotent and
 * Database.setup replays every script on every boot.
 *
 * Block comments deliberately -- see the note in 006.
 */
DELETE r FROM ${database}.${prefix}rsvp r
  LEFT JOIN ${database}.${prefix}slot s
    ON r.activity = s.activity AND r.event_window = s.event_window
  WHERE s.activity IS NULL;

SET @yasss_fk_rsvp_slot = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = '${database}'
      AND TABLE_NAME = '${prefix}rsvp'
      AND CONSTRAINT_NAME = 'fk_rsvp_slot') > 0,
  'DO 0',
  'ALTER TABLE `${database}`.`${prefix}rsvp`
     ADD CONSTRAINT fk_rsvp_slot
     FOREIGN KEY (activity, event_window)
     REFERENCES `${database}`.`${prefix}slot` (activity, event_window)
     ON UPDATE CASCADE
     ON DELETE CASCADE');
PREPARE yasss_add_fk FROM @yasss_fk_rsvp_slot;
EXECUTE yasss_add_fk;
DEALLOCATE PREPARE yasss_add_fk;
