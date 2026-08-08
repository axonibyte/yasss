/**
 * Accessible names that both browser suites match on, where the name is not a
 * constant.
 *
 * Shared because the fake suite and the live suite are otherwise deliberately
 * separate — different servers, different helpers — and a copy change that
 * breaks one breaks the other. A literal duplicated across twelve call sites is
 * how the label change in EventSection.svelte turned into ten timeouts.
 */

/**
 * The Submit RSVPs button names itself after what it is about to write:
 * "Submit RSVPs" with nothing pending, "Submit 3 RSVPs" with three.
 *
 * Matching the shape rather than one of its values keeps the specs testing the
 * accessible name — what a user, a screen reader and voice control all
 * perceive — rather than retreating to a test-only attribute. Anchored at both
 * ends so an absence assertion means the button is genuinely gone and not
 * merely wearing its other name.
 */
export const SUBMIT_RSVPS = /^Submit (?:RSVPs|\d+ RSVPs?)$/;
