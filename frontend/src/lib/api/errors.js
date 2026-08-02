/**
 * API error type and predicates.
 *
 * The server speaks a `{status, info}` envelope and the legacy client trusted
 * `status` over the HTTP code (app.js:1383). We keep both: `status` decides
 * success, `httpStatus` drives the flow-specific messages the UI shows.
 */
export class ApiError extends Error {
  /**
   * @param {string} info      the server's human-readable message
   * @param {number} httpStatus
   * @param {unknown} [body]   the parsed response body, when there was one
   */
  constructor(info, httpStatus, body = null) {
    super(info);
    this.name = 'ApiError';
    this.info = info;
    this.httpStatus = httpStatus;
    this.body = body;
  }
}

export const isNotFound = (e) => e instanceof ApiError && e.httpStatus === 404;
export const isUnpublished = (e) => e instanceof ApiError && e.httpStatus === 402;
export const isForbidden = (e) => e instanceof ApiError && e.httpStatus === 403;
export const isExpired = (e) => e instanceof ApiError && e.httpStatus === 412;
export const isConflict = (e) => e instanceof ApiError && e.httpStatus === 409;

/**
 * Raised when an authenticated request comes back without a rotated session
 * header. The server issues `AXB-SESSION` on every successful authentication,
 * so its absence means the session is gone (app.js:1370-1379).
 */
export class SessionLostError extends Error {
  constructor() {
    super('Your user session was lost! Please log in again.');
    this.name = 'SessionLostError';
  }
}
