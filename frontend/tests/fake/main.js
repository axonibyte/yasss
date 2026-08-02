/**
 * Entry point for the fake API, launched by Playwright's webServer.
 *
 * Serves the built app and the API from one origin, which is how the real
 * deployment works — the Java server hosts both from the shadow jar.
 */
import { startFakeApi } from './server.js';

const port = Number(process.env.FAKE_PORT ?? 4173);
const staticDir = process.env.FAKE_STATIC ?? '../src/main/resources/public';
const captchaSiteKey = process.env.FAKE_CAPTCHA_KEY || null;

startFakeApi({ port, staticDir, captchaSiteKey });

// eslint-disable-next-line no-console
console.log(`fake API listening on http://localhost:${port} serving ${staticDir}`);
