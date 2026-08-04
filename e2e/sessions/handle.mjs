/**
 * Where `verify.mjs` leaves state for `after-restart.mjs`.
 *
 * The two halves of this stage cannot be one script: between them `run.sh`
 * restarts the application and backdates a token in SQL, neither of which a
 * driver can do from inside the container it runs in. A file on the mounted
 * repo is the handoff.
 */
export const HANDLE = new URL('./handle.json', import.meta.url);
