/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import java.util.UUID;

/**
 * The check behind every token that arrives in somebody's inbox.
 *
 * <p>Shared by account verification and credential reset so the two cannot drift
 * apart, and pure so the whole matrix is testable without a database.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public final class ExpiringToken {

  /**
   * The outcome of presenting a token.
   */
  public static enum Status {

    /**
     * No token is outstanding, or the one presented is not it.
     *
     * <p>The caller answers 403. Deliberately indistinguishable from a malformed
     * token and from an account that has no token at all: anything else lets a
     * caller ask whether a given account has an outstanding reset, one guess at
     * a time.
     */
    NO_MATCH,

    /**
     * The right token, presented too late.
     *
     * <p>The caller answers 410, which is the difference between "this link is
     * not yours" and "this link was yours and you waited too long" -- and the
     * latter is worth telling somebody, because the fix is to request another.
     *
     * <p>Reachable only on a match, which is what stops the status doubling as
     * an oracle for whether a token exists.
     */
    EXPIRED,

    /**
     * The right token, in time.
     */
    VALID
  }

  /**
   * Decides what to do with a presented token.
   *
   * @param stored the token on the account, or {@code null} if none is
   *        outstanding
   * @param expires the epoch millisecond at which it lapses, or {@code null} for
   *        a token that does not expire. Null is what every token minted before
   *        migration 022 has, and it is honored rather than treated as expired:
   *        retrofitting a deadline onto links already sitting in inboxes would
   *        break them at upgrade time and buy nothing
   * @param supplied the token from the request, which may be {@code null} or
   *        anything at all
   * @param now the current epoch millisecond
   * @return the {@link Status}
   */
  public static Status check(UUID stored, Long expires, String supplied, long now) {
    if(null == stored || null == supplied) return Status.NO_MATCH;

    UUID parsed;
    try {
      parsed = UUID.fromString(supplied);
    } catch(IllegalArgumentException e) {
      return Status.NO_MATCH;
    }

    if(!stored.equals(parsed)) return Status.NO_MATCH;
    // Note the order: expiry is only ever consulted after the token matches.
    return null != expires && now > expires ? Status.EXPIRED : Status.VALID;
  }

  private ExpiringToken() { }

}
