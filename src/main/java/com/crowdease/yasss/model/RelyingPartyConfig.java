/*
 * Copyright (c) 2026 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Which relying party a passkey belongs to, and which origins may perform a ceremony for
 * it.
 *
 * <h2>Why this is a class and not two config lookups</h2>
 *
 * <p>A WebAuthn credential is bound to its RP ID <em>for life</em>. There is no migration:
 * change the RP ID and every enrolled passkey silently stops working, with the failure
 * happening inside the browser where no server log will ever see it. So the value has to
 * be derived once, deterministically, validated, and logged.
 *
 * <p><b>And the shipped default cannot work.</b> {@code api.host} defaults to
 * {@code http://127.0.0.1:7455}, in the packaged configuration and in the e2e stack. An
 * IP address is a
 * <a href="https://www.w3.org/TR/webauthn-2/#relying-party-identifier">potentially
 * trustworthy origin</a>, so the API is reachable and everything else works — but it is
 * not a <em>registrable domain</em>, so every browser refuses every ceremony outright.
 * Out of the box, passkeys cannot work at all, and nothing server-side says why.
 *
 * <p>Worse, that failure is invisible to the test suite. Playwright's virtual
 * authenticator replaces {@code navigator.credentials} in the page and derives the RP ID
 * as {@code req.rp?.id ?? new URL(req.origin).hostname} with no registrable-suffix check
 * at all — so the browser tier passes green against {@code 127.0.0.1} while production
 * fails. This class exists so that a unit test can catch what no browser test here can,
 * and so that a deployment which cannot support passkeys says so at boot instead of
 * shipping a button that does nothing.
 *
 * @author Caleb L. Power
 */
public final class RelyingPartyConfig {

  /** Why an RP ID was refused, or {@code null} when it was not. */
  public static enum Refusal {

    /** Nothing to derive from. */
    MISSING("no api.host and no auth-free passkey.rpID to fall back on"),

    /** An IPv4 or IPv6 literal. Trustworthy as an origin, illegal as an RP ID. */
    IP_LITERAL(
        "an IP address is not a registrable domain, so every browser will refuse every "
        + "ceremony; set passkey.rpID to a hostname, or point api.host at one"),

    /** A scheme, a port, a path — anything that is not bare host. */
    NOT_A_BARE_HOST("an RP ID is a bare hostname: no scheme, no port, no path");

    private final String detail;

    private Refusal(String detail) {
      this.detail = detail;
    }

    /** @return why this value cannot be an RP ID */
    public String detail() {
      return detail;
    }
  }

  /**
   * A resolved configuration, or a refusal explaining why there is not one.
   *
   * @param rpID the relying party identifier, or {@code null} if refused
   * @param origins the origins a ceremony may be performed at
   * @param refusal why {@link #rpID()} is null, or {@code null} if it is not
   */
  public static record Resolved(String rpID, Set<String> origins, Refusal refusal) {

    /** @return whether passkeys can operate under this configuration */
    public boolean usable() {
      return null == refusal;
    }
  }

  /**
   * Resolves the relying party from configuration.
   *
   * @param configuredRpID {@code passkey.rpID}, or null/blank to derive from the host
   * @param apiHost {@code api.host}
   * @param configuredOrigins {@code passkey.origins}, or the {@code same-origin} sentinel
   * @return the resolution, usable or not
   */
  public static Resolved resolve(String configuredRpID, String apiHost, String configuredOrigins) {
    String rpID = (null == configuredRpID || configuredRpID.isBlank()
        || "same-origin".equals(configuredRpID))
        ? hostOf(apiHost)
        : configuredRpID.strip();

    if(null == rpID || rpID.isBlank())
      return new Resolved(null, Set.of(), Refusal.MISSING);

    // Checked before the IP test, because "https://example.org" contains characters that
    // would otherwise make it look like a perfectly good hostname to a naive check.
    if(rpID.contains("/") || rpID.contains(":") && !isIPv6Literal(rpID)
        || rpID.contains("@") || rpID.contains(" "))
      return new Resolved(null, Set.of(), Refusal.NOT_A_BARE_HOST);

    if(isIPLiteral(rpID))
      return new Resolved(null, Set.of(), Refusal.IP_LITERAL);

    return new Resolved(rpID, origins(configuredOrigins, apiHost), null);
  }

  /**
   * The origins a ceremony may be performed at.
   *
   * <p>Deliberately separate from {@code api.allowedOrigins}: those govern which
   * <em>sites</em> may read a response, this governs which origin a <em>ceremony</em> was
   * performed at. They usually hold the same value, which is why both accept the same
   * sentinel — but a wildcard CORS setting must never become a wildcard ceremony origin,
   * so {@code *} is refused here rather than honored.
   */
  private static Set<String> origins(String configured, String apiHost) {
    Set<String> out = new LinkedHashSet<>();

    if(null == configured || configured.isBlank() || "same-origin".equals(configured)) {
      if(null != apiHost && !apiHost.isBlank()) out.add(apiHost.strip());
      return out;
    }

    for(String origin : configured.split(",")) {
      String trimmed = origin.strip();
      // A wildcard here would accept a ceremony performed at any site that could reach a
      // browser holding the user's passkey, which is the whole attack WebAuthn's origin
      // binding exists to prevent.
      if(trimmed.isEmpty() || "*".equals(trimmed)) continue;
      out.add(trimmed);
    }

    return out;
  }

  /** The host component of a URL, or null if it has none. */
  private static String hostOf(String url) {
    if(null == url || url.isBlank()) return null;
    try {
      String host = new URI(url.strip()).getHost();
      if(null == host) return null;
      // URI hands back an IPv6 literal wrapped in brackets; strip them so the IP check
      // below sees the address rather than the notation.
      return host.startsWith("[") && host.endsWith("]")
          ? host.substring(1, host.length() - 1)
          : host;
    } catch(URISyntaxException e) {
      return null;
    }
  }

  /** Whether a host is an IP address rather than a name. */
  private static boolean isIPLiteral(String host) {
    return isIPv4Literal(host) || isIPv6Literal(host);
  }

  private static boolean isIPv4Literal(String host) {
    String[] parts = host.split("\\.", -1);
    if(4 != parts.length) return false;
    for(String part : parts) {
      if(part.isEmpty() || part.length() > 3) return false;
      for(char c : part.toCharArray()) if(c < '0' || c > '9') return false;
      if(Integer.parseInt(part) > 255) return false;
    }
    return true;
  }

  private static boolean isIPv6Literal(String host) {
    // Deliberately loose: anything with two consecutive colons, or more colons than a
    // hostname could carry, is not a name. Being generous here costs a refusal with a
    // clear message; being strict risks accepting something a browser will not.
    if(!host.contains(":")) return false;
    for(char c : host.toCharArray())
      if(!(Character.digit(c, 16) >= 0 || ':' == c || '.' == c || '%' == c)) return false;
    return true;
  }

  private RelyingPartyConfig() { }

}
