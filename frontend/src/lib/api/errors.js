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
