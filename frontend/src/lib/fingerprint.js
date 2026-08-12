/**
 * A browser fingerprint, for polls that allow one answer each.
 *
 * The honest framing first, because it belongs next to the code and not only in
 * the warning the organizer is shown: this is a speed bump. Anybody who wants
 * to answer twice can open a private window. What it stops is the ordinary
 * case -- somebody clicking the link again, or refreshing and voting twice by
 * accident.
 *
 * COMPUTED ONLY WHEN THE POLL ALLOWS ONE ANSWER EACH. A poll that permits
 * several collects nothing at all, and that is the default, so the default
 * deployment collects nothing. The caller enforces this; there is deliberately
 * no way to ask this module for a digest "just in case".
 *
 * What is sent is a SHA-256 of the signals below. The server then hashes that
 * again with the poll's id before storing it, so the same browser answering two
 * polls stores two unrelated values and this cannot become a way to follow
 * somebody around the service.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

/**
 * A canvas rendering, as a data URL.
 *
 * This is the signal that makes the whole thing worth doing: the others are
 * values a server sees in headers anyway, and without this two identical phone
 * models on the same OS produce the same digest -- which makes the mechanism a
 * no-op for exactly the population it most needs to tell apart.
 *
 * It is also the signal that makes this fingerprinting in the regulatory sense,
 * which is why the privacy policy names it.
 *
 * Returns an empty string rather than throwing on a hardened profile that
 * refuses to read pixels back.
 */
function canvasSignal() {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 60;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.textBaseline = 'top';
    ctx.font = '14px "Arial"';
    ctx.fillStyle = '#f60';
    ctx.fillRect(0, 0, 120, 30);
    ctx.fillStyle = '#069';
    ctx.fillText('yasss/poll 0123', 2, 12);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('yasss/poll 0123', 4, 20);
    return canvas.toDataURL();
  } catch {
    return '';
  }
}

/** The signals, in a fixed order. Order matters: it is part of the digest. */
function signals() {
  const nav = globalThis.navigator ?? {};
  const scr = globalThis.screen ?? {};
  let zone = '';
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    zone = '';
  }

  return [
    nav.userAgent ?? '',
    nav.language ?? '',
    (nav.languages ?? []).join(','),
    String(nav.hardwareConcurrency ?? ''),
    String(nav.deviceMemory ?? ''),
    String(nav.maxTouchPoints ?? ''),
    `${scr.width ?? ''}x${scr.height ?? ''}x${scr.colorDepth ?? ''}`,
    String(Math.round((globalThis.devicePixelRatio ?? 1) * 100) / 100),
    zone,
    String(new Date().getTimezoneOffset()),
    canvasSignal(),
  ];
}

/*
 * Deliberately excluded, so nobody adds them back as an improvement:
 *
 * - WebGL's UNMASKED_RENDERER_WEBGL, which Firefox and Safari mask by default.
 *   It adds instability, not entropy: the same browser reports differently
 *   after a driver update.
 * - Font enumeration, AudioContext and plugin lists, which are slow, noisy, and
 *   the signals that make a fingerprint look like tracking rather than a
 *   duplicate check.
 * - The IP address. The server already has it and does not need this one's
 *   opinion of it.
 */

/**
 * The digest to send with an answer.
 *
 * @returns {Promise<string|null>} 64 lowercase hex characters, or null if this
 *   browser would not produce one -- in which case the answer is submitted
 *   without it and the address carries the check alone. A person on a hardened
 *   profile is a person, not an attack, and must still be able to answer.
 */
export async function fingerprint() {
  try {
    const joined = signals().join(' ');
    // Not null merely because the canvas was refused: the other signals still
    // distinguish most browsers, and something beats the address alone.
    return bytesToHex(sha256(new TextEncoder().encode(joined)));
  } catch {
    return null;
  }
}
