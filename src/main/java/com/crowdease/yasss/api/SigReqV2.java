/*
 * Copyright (c) 2026 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.regex.Pattern;

import com.crowdease.yasss.api.AuthToken.AuthException;

import org.json.JSONObject;

/**
 * Version 2 of the AXB-SIG-REQ credential: the same signature scheme over a message that
 * expires and cannot be replayed.
 *
 * <h2>Why there is a version 2</h2>
 *
 * <p>The v1 signed message is {@code JSON.stringify({email, mfa})}. With no MFA enrolled
 * that string is byte-identical forever, so the signature over it is too — a captured
 * {@code Authorization} header is a credential that never expires. Worse, a credential
 * deliberately escapes {@code session_epoch} (so that a platform-wide revoke is a forced
 * re-login rather than a permanent lockout), which means no revocation this application
 * offers can withdraw it. Restricting credentials to the sign-in route bounds that;
 * freshness is what closes it.
 *
 * <h2>The signed bytes are not the received string</h2>
 *
 * <p>This is the most important thing in this class. v1 verifies the signature over the
 * literal {@code creds} string and then acts on the <em>parsed</em> object. Those are two
 * different things, and every gap between them is somewhere a bypass can live: JSON has
 * many renderings of one value -- whitespace, key order, unicode escapes, {@code 1e3} for
 * {@code 1000} -- so "the bytes that were signed" and "the values that were acted on" are
 * related only by whatever the parser happened to do.
 *
 * <p>So the server <b>rebuilds</b> the signed bytes from the values it parsed, and verifies
 * over its own reconstruction. The signature then covers exactly the values that are acted
 * on, by construction rather than by the parser's good behavior.
 *
 * <p>To be clear about one case, because it is the obvious one to reach for: the
 * {@code org.json} in use here <em>refuses</em> a duplicate key outright rather than
 * silently keeping the last, so {@code {"iat":stale,...,"iat":fresh}} is not a split
 * available against v1 either. That is worth knowing and is not worth relying on -- it is
 * one parser's strictness, asserted by nothing, one dependency bump from changing, and
 * precisely the sort of property that should not be load-bearing for a signature.
 *
 * <pre>
 *   AXB-SIG-REQ/2\n
 *   aud=&lt;aud&gt;\n
 *   sub=&lt;sub&gt;\n
 *   acct=&lt;acct&gt;\n
 *   iat=&lt;iat&gt;\n
 *   jti=&lt;jti&gt;\n
 *   mfa=&lt;mfa&gt;\n
 * </pre>
 *
 * <p>Seven lines, fixed order, every line LF-terminated. Every value is validated against
 * a strict character class <em>before</em> the bytes are built, so no value can contain an
 * LF and the framing is unambiguous without length prefixes. Every field is always
 * present even when empty, because {@code JSON.stringify} omits an undefined value and a
 * field that is sometimes there and sometimes not changes the shape of what is signed.
 *
 * <p>The whole thing is ASCII. The email travels as base64url rather than as text
 * specifically so that it is: the library hashes what it is handed, and keeping the signed
 * bytes ASCII removes any dependence on how a non-ASCII address is encoded on the way in.
 *
 * <h2>Why not just add fields to the v1 object</h2>
 *
 * <p>Because it would be a downgrade attack. A v1 verifier verifies over the literal
 * string and ignores fields it does not know, so
 * {@code {"email":…,"mfa":…,"iat":…,"jti":…}} would verify happily as v1 — meaning one
 * blob would be simultaneously a fresh single-use v2 credential and an eternal replayable
 * v1 one. During the transition a v1 verifier necessarily runs in this same process. A
 * separate byte string whose first line names the scheme cannot be reinterpreted by a v1
 * verifier at all.
 *
 * @author Caleb L. Power
 */
public final class SigReqV2 {

  /** Present and equal to 2 on a v2 credential; absent on v1 and on session tickets. */
  public static final String CLAIM_VERSION = "v";

  /** The audience this credential was minted for. */
  public static final String CLAIM_AUDIENCE = "aud";

  /** base64url of the UTF-8 email address, or empty when addressing by account. */
  public static final String CLAIM_SUBJECT = "sub";

  /** The account UUID, or empty when addressing by email. */
  public static final String CLAIM_ACCOUNT = "acct";

  /** Epoch milliseconds at which the client signed. */
  public static final String CLAIM_ISSUED_AT = "iat";

  /** base64url of 16 random bytes; the replay key. */
  public static final String CLAIM_NONCE = "jti";

  /** TOTP digits, or empty. */
  public static final String CLAIM_MFA = "mfa";

  /** The scheme version this class implements. */
  public static final int VERSION = 2;

  private static final Pattern AUD = Pattern.compile("^[A-Za-z0-9._:/-]{1,128}$");
  private static final Pattern SUB = Pattern.compile("^[A-Za-z0-9_-]{0,512}$");
  private static final Pattern ACCT = Pattern.compile(
      "^$|^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");
  private static final Pattern IAT = Pattern.compile("^[0-9]{1,19}$");
  private static final Pattern JTI = Pattern.compile("^[A-Za-z0-9_-]{22}$");
  private static final Pattern MFA = Pattern.compile("^$|^[0-9]{6,8}$");

  /** How a credential's timestamp relates to now. */
  public static enum Verdict {

    /** Inside the skew window. */
    VALID,

    /** Older than the window allows. Either a replay, or a client whose clock is behind. */
    STALE,

    /** Dated further ahead than the window allows. */
    FUTURE
  }

  /**
   * A parsed, character-validated v2 credential.
   *
   * <p>Holding one is the proof that every field was present and well-formed. It is not
   * proof that the signature verified — that is {@link #canonicalBytes()} plus the
   * caller's own check — and not proof that it is fresh.
   *
   * @param audience the audience the client signed for
   * @param subject base64url of the UTF-8 email, or empty
   * @param account the account UUID as a string, or empty
   * @param issuedAt epoch milliseconds
   * @param nonce the 22-character base64url replay key
   * @param mfa the TOTP code, or empty
   */
  public static record Credential(
      String audience,
      String subject,
      String account,
      long issuedAt,
      String nonce,
      String mfa) {

    /**
     * The exact bytes the signature must cover.
     *
     * <p>Built from these parsed values rather than from anything the sender framed, which
     * is the point of the whole class.
     *
     * @return the canonical signed message
     */
    public byte[] canonicalBytes() {
      return new StringBuilder()
          .append("AXB-SIG-REQ/").append(VERSION).append('\n')
          .append("aud=").append(audience).append('\n')
          .append("sub=").append(subject).append('\n')
          .append("acct=").append(account).append('\n')
          .append("iat=").append(issuedAt).append('\n')
          .append("jti=").append(nonce).append('\n')
          .append("mfa=").append(mfa).append('\n')
          .toString()
          .getBytes(StandardCharsets.US_ASCII);
    }

    /**
     * The email address this credential names, if it names one.
     *
     * @return the decoded address, or {@code null} when addressed by account
     */
    public String email() {
      if(subject.isEmpty()) return null;
      return new String(
          Base64.getUrlDecoder().decode(subject), StandardCharsets.UTF_8);
    }

    /** The 16 raw bytes of the nonce, for the replay ledger. */
    public byte[] nonceBytes() {
      return Base64.getUrlDecoder().decode(nonce);
    }
  }

  /**
   * Whether a parsed {@code creds} object claims to be v2.
   *
   * <p>An absent version means v1, which is what every existing client and every session
   * ticket sends. A version this build does not implement is refused rather than treated
   * as v1 — silently downgrading a future client would undo whatever that version added.
   *
   * @param creds the parsed credentials object
   * @return {@code true} if this is a v2 credential
   * @throws AuthException if the version is present but not one this build understands
   */
  public static boolean isV2(JSONObject creds) throws AuthException {
    if(!creds.has(CLAIM_VERSION)) return false;

    // Deliberately not getInt, which coerces: the string "2" would read as version 2, so
    // a sender could choose how their own version field is interpreted.
    Object raw = creds.get(CLAIM_VERSION);
    if(!(raw instanceof Integer version))
      throw new AuthException("credential version is not an integer");

    if(VERSION == version) return true;
    throw new AuthException("unsupported credential version %1$d", version);
  }

  /**
   * Parses and validates a v2 credential.
   *
   * <p>Every field is required and every field is checked against its character class
   * here, before any of it reaches a cipher, a database, or the canonical byte string.
   *
   * @param creds the parsed credentials object
   * @return the validated credential
   * @throws AuthException if anything is missing or malformed
   */
  public static Credential parse(JSONObject creds) throws AuthException {
    String audience = require(creds, CLAIM_AUDIENCE, AUD);
    String subject = require(creds, CLAIM_SUBJECT, SUB);
    String account = require(creds, CLAIM_ACCOUNT, ACCT);
    String issuedAt = require(creds, CLAIM_ISSUED_AT, IAT);
    String nonce = require(creds, CLAIM_NONCE, JTI);
    String mfa = require(creds, CLAIM_MFA, MFA);

    // Exactly one of the two addressing modes. Both would be ambiguous and neither
    // identifies anybody, and letting either through would mean the canonical bytes could
    // be built for a credential that names no account.
    if(subject.isEmpty() == account.isEmpty())
      throw new AuthException("credential must name exactly one of sub or acct");

    long millis;
    try {
      millis = Long.parseLong(issuedAt);
    } catch(NumberFormatException e) {
      // Reachable: the pattern allows 19 digits, which overflows a signed long.
      throw new AuthException("credential timestamp is out of range");
    }

    return new Credential(audience, subject, account, millis, nonce, mfa);
  }

  /**
   * Whether a credential is fresh enough to act on.
   *
   * <p>Symmetric, and deliberately so. An asymmetric window buys little: the replay ledger
   * has to retain a nonce for the whole future half regardless, since a credential dated
   * ahead of us must stay unreplayable until it goes stale.
   *
   * @param credential the parsed credential
   * @param now epoch milliseconds
   * @param skewMillis how far either side of now is acceptable
   * @return what to do about it
   */
  public static Verdict evaluate(Credential credential, long now, long skewMillis) {
    long delta = now - credential.issuedAt();
    if(delta > skewMillis) return Verdict.STALE;
    if(-delta > skewMillis) return Verdict.FUTURE;
    return Verdict.VALID;
  }

  private static String require(JSONObject creds, String field, Pattern shape)
      throws AuthException {
    if(!creds.has(field))
      throw new AuthException("credential is missing %1$s", field);

    Object raw = creds.get(field);
    // Deliberately not optString, which would coerce a number or a boolean into something
    // that might match. A field of the wrong type is malformed, not convertible.
    if(!(raw instanceof String value))
      throw new AuthException("credential field %1$s is not a string", field);

    if(!shape.matcher(value).matches())
      throw new AuthException("credential field %1$s is malformed", field);

    return value;
  }

  private SigReqV2() { }

}
