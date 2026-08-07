/*
 * Copyright (c) 2026 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import java.util.LinkedHashSet;
import java.util.Set;

import com.crowdease.yasss.YasssCore;
import com.webauthn4j.WebAuthnManager;
import com.webauthn4j.credential.CredentialRecord;
import com.webauthn4j.credential.CredentialRecordImpl;
import com.webauthn4j.converter.AttestedCredentialDataConverter;
import com.webauthn4j.converter.util.ObjectConverter;
import com.webauthn4j.data.AuthenticationData;
import com.webauthn4j.data.AuthenticationParameters;
import com.webauthn4j.data.AuthenticationRequest;
import com.webauthn4j.data.RegistrationData;
import com.webauthn4j.data.RegistrationParameters;
import com.webauthn4j.data.RegistrationRequest;
import com.webauthn4j.data.attestation.authenticator.AttestedCredentialData;
import com.webauthn4j.data.client.Origin;
import com.webauthn4j.data.client.challenge.Challenge;
import com.webauthn4j.data.client.challenge.DefaultChallenge;
import com.webauthn4j.server.ServerProperty;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * The only class that touches webauthn4j.
 *
 * <p>Confined deliberately. The library's {@code verify} takes a {@link ServerProperty}
 * that <em>we</em> construct, and constructing it wrong — the wrong origin, the wrong
 * relying party, a challenge that was not the one issued — weakens the ceremony silently
 * rather than failing. Keeping every one of those constructions in one place means there
 * is one thing to review and one thing to test, and it means swapping the library is a
 * single-file change if it ever needs to be.
 *
 * <p>Attestation is deliberately not verified. {@code createNonStrictWebAuthnManager} is
 * the named constructor for exactly that posture, which is the right one for a consumer
 * service: verifying it answers "which make of authenticator is this", requires either a
 * bundled metadata blob or a network fetch at boot, and a volunteer-scheduling application
 * has no business asking.
 *
 * @author Caleb L. Power
 */
public final class PasskeyVerifier {

  private static final Logger logger = LoggerFactory.getLogger(PasskeyVerifier.class);

  private static final WebAuthnManager MANAGER =
      WebAuthnManager.createNonStrictWebAuthnManager();
  private static final ObjectConverter CONVERTER = new ObjectConverter();

  /** Raised when a ceremony does not verify. Carries no detail for the caller. */
  public static class PasskeyException extends Exception {
    PasskeyException(String message) {
      super(message);
    }
  }

  /** What a successful registration produced. */
  public static record Registered(
      byte[] credentialID,
      byte[] publicKey,
      long signCount,
      String transports,
      byte[] aaguid,
      boolean backupEligible,
      boolean backupState) { }

  /** What a successful assertion produced. */
  public static record Asserted(long signCount, boolean userVerified) { }

  /**
   * Verifies a registration ceremony.
   *
   * @param challenge the bytes that were issued and have just been spent
   * @param clientDataJSON as returned by the authenticator
   * @param attestationObject as returned by the authenticator
   * @param transports the transports the client reported, or {@code null}
   * @return what was enrolled
   * @throws PasskeyException if it does not verify
   */
  public static Registered verifyRegistration(
      byte[] challenge, byte[] clientDataJSON, byte[] attestationObject, Set<String> transports)
      throws PasskeyException {
    try {
      RegistrationData data = MANAGER.verify(
          new RegistrationRequest(attestationObject, clientDataJSON, transports),
          new RegistrationParameters(
              serverProperty(challenge),
              // No explicit algorithm list: the defaults cover ES256 and RS256, and ES256
              // is what every authenticator in practice returns.
              null,
              // userVerificationRequired = false. The ceremony asks for user verification
              // but does not demand it, so a security key with no PIN can still enrol;
              // whether a given assertion actually verified the user is read off the
              // result at sign-in, which is where it matters.
              false,
              // userPresenceRequired
              true));

      var attested = data.getAttestationObject().getAuthenticatorData().getAttestedCredentialData();
      var flags = data.getAttestationObject().getAuthenticatorData();

      return new Registered(
          attested.getCredentialId(),
          new AttestedCredentialDataConverter(CONVERTER).convert(attested),
          data.getAttestationObject().getAuthenticatorData().getSignCount(),
          null == data.getTransports() || data.getTransports().isEmpty()
              ? null
              : String.join(",", data.getTransports().stream().map(Object::toString).toList()),
          null == attested.getAaguid() ? null : attested.getAaguid().getBytes(),
          flags.isFlagBE(),
          flags.isFlagBS());

    } catch(Exception e) {
      // Deliberately no detail to the caller. The message goes to the log; what comes back
      // is that it did not verify.
      logger.debug("passkey registration did not verify: {}", e.getMessage());
      throw new PasskeyException("registration did not verify");
    }
  }

  /**
   * Verifies an authentication ceremony against an enrolled credential.
   *
   * @param passkey the credential the assertion names
   * @param challenge the bytes that were issued and have just been spent
   * @param clientDataJSON as returned by the authenticator
   * @param authenticatorData as returned by the authenticator
   * @param signature as returned by the authenticator
   * @param userHandle as returned by the authenticator, or {@code null}
   * @return what the assertion reported
   * @throws PasskeyException if it does not verify
   */
  public static Asserted verifyAuthentication(
      Passkey passkey, byte[] challenge, byte[] clientDataJSON, byte[] authenticatorData,
      byte[] signature, byte[] userHandle)
      throws PasskeyException {
    try {
      AttestedCredentialData attested =
          new AttestedCredentialDataConverter(CONVERTER).convert(passkey.getPublicKey());

      CredentialRecord record = new CredentialRecordImpl(
          null, null, null, null, passkey.getSignCount(), attested, null, null, null, null);

      AuthenticationData data = MANAGER.verify(
          new AuthenticationRequest(
              passkey.getCredentialID(), userHandle, authenticatorData, clientDataJSON, signature),
          new AuthenticationParameters(
              serverProperty(challenge),
              record,
              null,
              // userVerificationRequired = false, and read off the result instead. Asking
              // for it here would refuse a security key tapped without a PIN outright;
              // what the caller needs is to know which happened, so that MFA can be
              // required in the second case rather than the sign-in being refused.
              false,
              true));

      var flags = data.getAuthenticatorData();
      return new Asserted(flags.getSignCount(), flags.isFlagUV());

    } catch(Exception e) {
      logger.debug("passkey assertion did not verify: {}", e.getMessage());
      throw new PasskeyException("assertion did not verify");
    }
  }

  /**
   * The server's side of the ceremony.
   *
   * <p>Every field here is one that silently weakens the check if it is wrong, which is
   * why nothing else in the codebase is allowed to build one.
   */
  private static ServerProperty serverProperty(byte[] challenge) {
    var relyingParty = YasssCore.getRelyingParty();
    if(null == relyingParty)
      throw new IllegalStateException("no relying party; passkeys should not be reachable");

    Set<Origin> origins = new LinkedHashSet<>();
    for(String origin : relyingParty.origins()) origins.add(new Origin(origin));

    Challenge issued = new DefaultChallenge(challenge);
    // The token-binding id is null because token binding is dead: no browser ships it.
    return new ServerProperty(origins, relyingParty.rpID(), issued, null);
  }

  private PasskeyVerifier() { }

}
