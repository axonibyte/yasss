/**
 * Whether a change has to reach the server, or stays in the browser.
 *
 * Three modules were each re-deriving this from `persisted` inline, which is
 * the arrangement `structureActions.js` opens by arguing against: "splitting
 * those into parallel local and remote code paths is what let the legacy's two
 * versions drift apart". The predicate was already shared in spirit; this makes
 * it shared in fact, so there is one place to answer the question and one place
 * to change the answer.
 */

/**
 * True once the event exists server-side and changes must be published.
 *
 * The sandbox clause is the tutorial's whole containment. Its practice event
 * carries an id so the volunteer surface renders, and an id is what every write
 * here gates on -- so without this, a learner clicking a practice tile would
 * POST an RSVP against an event the server has never heard of. Being the one
 * place that answers this question is what makes that a single clause rather
 * than five.
 */
export const isRemote = (event) => event.persisted && !event.sandbox;

/**
 * True when this volunteer's writes are the server's to record.
 *
 * The event clause is not redundant even though it currently cannot fail: a
 * volunteer only becomes persisted by way of `createVolunteer`, which needs an
 * event id, and a loaded volunteer arrives with the event that has one. Asking
 * about the event as well as the volunteer says what the rule actually is,
 * rather than relying on that implication holding forever.
 */
export const isRemoteVolunteer = (event, volunteer) =>
  isRemote(event) && Boolean(volunteer?.persisted);
