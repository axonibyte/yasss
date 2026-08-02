/**
 * Dependency seam between the API client and session state.
 *
 * `client.js` needs to read the current session token and hand back rotated
 * ones, but must not import session state directly — that would make the client
 * untestable without a live store and would create an import cycle
 * (session -> api -> session). State registers itself here at boot instead.
 */

/** @type {{ getToken(): string|null, onRotate(token: string): void, onLost(): void }} */
let bridge = {
  getToken: () => null,
  onRotate: () => {},
  onLost: () => {},
};

export function installAuthBridge(impl) {
  bridge = { ...bridge, ...impl };
}

/** Test helper — restores the inert default. */
export function resetAuthBridge() {
  bridge = { getToken: () => null, onRotate: () => {}, onLost: () => {} };
}

export const getToken = () => bridge.getToken();
export const notifyRotate = (token) => bridge.onRotate(token);
export const notifyLost = () => bridge.onLost();
