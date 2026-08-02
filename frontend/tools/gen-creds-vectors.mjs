/**
 * Regenerate docs/legacy/creds-golden-vectors.json.
 *
 * The vectors pin the AXB-SIG-REQ credential derivation so the npm-based
 * replacement in src/lib/crypto/creds.js cannot drift from what shipped. Every
 * existing account's public key was produced by the legacy bundle, so a drift
 * would silently lock users out rather than fail loudly.
 *
 * Two independent oracles are cross-checked here:
 *
 *   1. the legacy browserify bundle (.reference/axb-sig-req.min.js), run in a
 *      node:vm sandbox — its `crypto` module is an empty stub, so supplying
 *      `self.crypto` is enough to make @noble/ed25519@1.x fall through to WebCrypto
 *   2. node:crypto / OpenSSL, with zero third-party code
 *
 * src/lib/crypto/creds.js is the third oracle and is checked against the
 * committed vectors by tests/unit/creds.test.js.
 *
 * Usage: npm run vectors
 */
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  webcrypto, scryptSync, createPrivateKey, createPublicKey, sign as nodeSign,
} from 'node:crypto';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUNDLE = path.join(HERE, '../.reference/axb-sig-req.min.js');
const OUT = path.join(HERE, '../../docs/legacy/creds-golden-vectors.json');

// DER prefix for a PKCS#8-wrapped raw Ed25519 seed.
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

/** Oracle 1: the legacy bundle. */
function loadLegacyBundle() {
  if (!fs.existsSync(BUNDLE)) {
    console.error(
      `Legacy bundle not found at ${BUNDLE}.\n` +
      'It is removed in Phase 6 once the vectors are frozen; the committed\n' +
      'vectors remain the source of truth for tests/unit/creds.test.js.');
    process.exit(2);
  }
  const sandbox = {
    self: { crypto: webcrypto },
    console, process, TextEncoder, TextDecoder, Buffer,
    setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(BUNDLE, 'utf8'), sandbox);
  return sandbox.window.genCreds;
}

/** Oracle 2: node:crypto, no third-party code. */
function nodeOracle(email, password, mfa, salt) {
  const seed = scryptSync(
    Buffer.from(password.normalize('NFKC')),
    Buffer.from(salt.normalize('NFKC')),
    32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

  const priv = createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]),
    format: 'der',
    type: 'pkcs8',
  });
  const spki = createPublicKey(priv).export({ format: 'der', type: 'spki' });
  const pubkey = spki.subarray(spki.length - 32).toString('base64');

  const creds = JSON.stringify({ email, mfa }).normalize('NFKC');
  const sig = nodeSign(null, Buffer.from(creds), priv).toString('base64');
  const payload = Buffer.from(
    JSON.stringify({ creds, sig }).normalize('NFKC')).toString('base64');

  return { payload, pubkey };
}

// Every call site in the legacy app passes mfa='' and salt=''. The empty salt
// means the keypair is a pure function of the password — normative, not a bug
// we get to fix. accountReset additionally passes email='' (the empty-email case).
const CASES = [
  { name: 'ascii', email: 'bob@example.com', password: 'hunter2' },
  { name: 'empty-password', email: 'bob@example.com', password: '' },
  { name: 'unicode-nfkc', email: 'josé@example.com', password: 'ﬁancé́pw' },
  { name: 'long-password', email: 'a@b.co', password: 'x'.repeat(256) },
  { name: 'empty-email', email: '', password: 'resetpw' },
];

const genCreds = loadLegacyBundle();
const out = [];
let allMatch = true;

for (const c of CASES) {
  const { name, email, password, mfa = '', salt = '' } = c;
  const legacy = await genCreds(email, password, mfa, salt);
  const node = nodeOracle(email, password, mfa, salt);
  const match = legacy.pubkey === node.pubkey && legacy.payload === node.payload;
  if (!match) allMatch = false;
  console.log(`${match ? 'MATCH  ' : 'DIFFER '} ${name}`);
  if (!match) {
    console.log(`   pubkey  legacy=${legacy.pubkey}\n           node  =${node.pubkey}`);
    console.log(`   payload legacy=${legacy.payload}\n           node  =${node.payload}`);
  }
  out.push({ name, email, password, mfa, salt, pubkey: legacy.pubkey, payload: legacy.payload });
}

if (!allMatch) {
  console.error('\nOracles disagree — refusing to write vectors.');
  process.exit(1);
}

fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`\nBoth oracles agree. Wrote ${out.length} vectors to ${path.relative(process.cwd(), OUT)}`);
