/**
 * The API surface, one function per server endpoint.
 *
 * Grouped by resource; all 34 calls catalogued in
 * docs/legacy/01-behavior.md §5 are represented here.
 */
import { get, post, patch, put, del, requestRaw } from './client.js';
import { windowToApi, activityToApi, detailToApi } from './dto.js';

// --- meta ------------------------------------------------------------------

/**
 * `GET /v1` doubles as the login endpoint: authenticating against it returns
 * the account/session/access-level headers. Pass `authToken` with a freshly
 * signed credential payload to log in.
 */
export const getApiInfo = (opts) => get('', opts);

// --- texts -----------------------------------------------------------------

/** @param {'coa'|'terms'|'privacy'|'tutorial'} id */
export async function getText(id) {
  // Public content: send no credentials to an endpoint that does not read them.
  const res = await requestRaw(`/texts/${id}`, { accept: 'text/markdown', anonymous: true });
  return res.text();
}

// --- users -----------------------------------------------------------------

export const registerUser = (email, pubkey, captcha) =>
  post('/users', { email, pubkey, generateMFA: false }, { captcha, anonymous: true });

export const getUser = (id) => get(`/users/${id}`);

export const updateUser = (id, changes) => patch(`/users/${id}`, changes);

/** Empty body: ask the server to email a reset link. `:user` may be an email. */
export const requestPasswordReset = (emailOrId, captcha) =>
  post(`/users/${encodeURIComponent(emailOrId)}`, {}, { captcha, anonymous: true });

/** Consume the emailed token and install a newly derived public key. */
export const applyPasswordReset = (id, token, pubkey, captcha) =>
  post(`/users/${id}`, { token, pubkey }, { captcha });

// --- passkeys ---------------------------------------------------------------

/** Begin enrolment. Authenticated as the account itself. */
export const beginPasskeyRegistration = (id) => post(`/users/${id}/passkeys/challenge`, {});

/** Finish enrolment with what the authenticator produced. */
export const finishPasskeyRegistration = (id, body) => post(`/users/${id}/passkeys`, body);

/** The account's enrolled passkeys. */
export const listPasskeys = (id) => get(`/users/${id}/passkeys`);

/** Remove one. */
export const removePasskey = (id, passkey) => del(`/users/${id}/passkeys/${passkey}`);

/**
 * Begin a sign-in. Anonymous, and deliberately takes no email -- accepting one would make
 * this an oracle for which addresses are registered.
 */
export const beginPasskeyAuth = () => post('/passkeys/challenge', {}, { anonymous: true });

/** Finish a sign-in; the session comes back in the response headers. */
export const finishPasskeyAuth = (body) => post('/passkeys/session', body, { anonymous: true });

export const verifyUser = (id, token, captcha) =>
  put(`/users/${id}`, { token }, { captcha });

// --- events ----------------------------------------------------------------

export const listEvents = (query) => get('/events', { query });

export const getEvent = (id) => get(`/events/${id}`);

export const createEvent = (payload, captcha) => post('/events', payload, { captcha });

export const updateEvent = (id, changes) => patch(`/events/${id}`, changes);

export const deleteEvent = (id) => del(`/events/${id}`);

/** Returns HTML, not JSON. */
export async function getEventReport(id) {
  const res = await requestRaw(`/events/${id}/report`, { accept: 'text/html' });
  return res.blob();
}

// --- activities ------------------------------------------------------------

export const addActivity = (eventId, activity, priority) =>
  post(`/events/${eventId}/activities`, activityToApi(activity, { priority }));

export const updateActivity = (eventId, activityId, changes) =>
  patch(`/events/${eventId}/activities/${activityId}`, changes);

export const removeActivity = (eventId, activityId) =>
  del(`/events/${eventId}/activities/${activityId}`);

// --- windows ---------------------------------------------------------------

export const addWindow = (eventId, win) =>
  post(`/events/${eventId}/windows`, windowToApi(win));

export const updateWindow = (eventId, windowId, changes) =>
  patch(`/events/${eventId}/windows/${windowId}`, changes);

export const removeWindow = (eventId, windowId) =>
  del(`/events/${eventId}/windows/${windowId}`);

// --- details ---------------------------------------------------------------

export const addDetail = (eventId, detail, priority) =>
  post(`/events/${eventId}/details`, detailToApi(detail, { priority }));

export const updateDetail = (eventId, detailId, changes) =>
  patch(`/events/${eventId}/details/${detailId}`, changes);

export const removeDetail = (eventId, detailId) =>
  del(`/events/${eventId}/details/${detailId}`);

// --- slots -----------------------------------------------------------------

/**
 * Slots have no id — they are addressed positionally by (activity, window),
 * and a slot row exists iff it is enabled.
 */
export const setSlot = (eventId, activityId, windowId, maxSlotVolunteers = 0) =>
  put(`/events/${eventId}/activities/${activityId}/windows/${windowId}`, { maxSlotVolunteers });

export const unsetSlot = (eventId, activityId, windowId) =>
  del(`/events/${eventId}/activities/${activityId}/windows/${windowId}`);

// --- volunteers ------------------------------------------------------------

/**
 * `rsvps` is nominally optional but the server reads it unconditionally and
 * NPEs into a 500 when it is absent — always send at least `[]`.
 * See docs/legacy/03-api-contract.md §2.
 */
export const addVolunteer = (eventId, payload, captcha) =>
  post(`/events/${eventId}/volunteers`, { rsvps: [], ...payload }, { captcha });

export const updateVolunteer = (eventId, volunteerId, changes) =>
  patch(`/events/${eventId}/volunteers/${volunteerId}`, changes);

export const removeVolunteer = (eventId, volunteerId) =>
  del(`/events/${eventId}/volunteers/${volunteerId}`);

/**
 * Confirm a reminder subscription from an emailed link.
 *
 * Not CAPTCHA-gated, and neither is the unsubscribe: both are one-click links
 * from a mail client, and a CAPTCHA in front of an unsubscribe is a
 * deliverability liability. The token is the only credential either one has.
 */
export const confirmReminders = (eventId, volunteerId, token) =>
  put(`/events/${eventId}/volunteers/${volunteerId}/reminders`, { token }, { anonymous: true });

export const unsubscribeReminders = (eventId, volunteerId, token) =>
  del(`/events/${eventId}/volunteers/${volunteerId}/reminders`, {
    query: { token },
    anonymous: true,
  });

// --- rsvps -----------------------------------------------------------------

const rsvpPath = (eventId, activityId, windowId, volunteerId) =>
  `/events/${eventId}/activities/${activityId}/windows/${windowId}/volunteers/${volunteerId}`;

/** No request body is read by the server. */
export const setRsvp = (eventId, activityId, windowId, volunteerId) =>
  put(rsvpPath(eventId, activityId, windowId, volunteerId), undefined);

export const unsetRsvp = (eventId, activityId, windowId, volunteerId) =>
  del(rsvpPath(eventId, activityId, windowId, volunteerId));
