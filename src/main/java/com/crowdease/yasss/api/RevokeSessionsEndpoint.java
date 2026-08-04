/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import java.sql.SQLException;
import java.util.UUID;

import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;
import com.crowdease.yasss.YasssCore;
import com.crowdease.yasss.model.User;
import com.crowdease.yasss.model.User.AccessLevel;

import org.json.JSONObject;

import spark.Request;
import spark.Response;

/**
 * Invalidates sessions, either for one account or for the whole platform.
 *
 * <p>Two resources, one implementation, because the mechanism is the same in
 * both cases and splitting it would let them drift.
 *
 * <p>What makes either of them immediate is the {@code session_epoch} column on
 * {@code user}: {@code AuthToken} loads the account row before it decides
 * anything, so a bumped epoch is in force on the very next request with no cache
 * to invalidate and nothing to propagate. Wiping the stored signing keys, which
 * the platform-wide form also does, is <em>not</em> immediate on its own -- a
 * running process still holds its signers in memory. The two are complementary:
 * the epoch acts now, the wipe makes it survive a restart.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public final class RevokeSessionsEndpoint extends APIEndpoint {

  /**
   * Which set of sessions an instance of this endpoint ends.
   */
  public static enum Mode {

    /**
     * One account's sessions: "sign me out everywhere". Available to the account
     * itself and to an administrator.
     */
    ACCOUNT("/users/:user/sessions"),

    /**
     * Every session on the platform. Administrators only -- this is the break
     * glass for a suspected key compromise.
     */
    PLATFORM("/sessions");

    private final String resource;

    private Mode(String resource) {
      this.resource = resource;
    }
  }

  private final Mode mode;

  /**
   * Instantiates the endpoint.
   *
   * @param mode which sessions this instance ends
   */
  public RevokeSessionsEndpoint(Mode mode) {
    super(mode.resource, APIVersion.VERSION_1, HTTPMethod.DELETE);
    this.mode = mode;
  }

  /**
   * {@inheritDoc}
   */
  @Override public JSONObject onCall(Request req, Response res, Authorization auth)
      throws EndpointException {
    try {
      return Mode.PLATFORM == mode
          ? revokePlatform(req, res, auth)
          : revokeAccount(req, res, auth);

    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }

  private JSONObject revokeAccount(Request req, Response res, Authorization auth)
      throws EndpointException, SQLException {
    User user = null;
    try {
      user = User.getUser(
          UUID.fromString(
              req.params("user")));
    } catch(IllegalArgumentException e) { }

    if(null == user)
      throw new EndpointException(req, "user not found", 404);

    // atLeast(user) is the same check every other per-account endpoint makes:
    // the account itself, or an administrator.
    if(!auth.atLeast(user))
      throw new EndpointException(req, "access denied", 403);

    long now = System.currentTimeMillis();
    user.setSessionEpoch(now);
    user.commit();

    // The one device that asked keeps working. Signing out everywhere including
    // the browser you clicked it in is indistinguishable from a bug, and it
    // would stop anyone from confirming that it did anything.
    if(null != auth.getActor() && auth.getActor().getID().equals(user.getID()))
      reissueSession(res, user, now);

    res.status(200);
    return new JSONObject()
        .put("status", "ok")
        .put("info", "sessions successfully revoked");
  }

  private JSONObject revokePlatform(Request req, Response res, Authorization auth)
      throws EndpointException, SQLException {
    if(!auth.atLeast(AccessLevel.ADMIN))
      throw new EndpointException(req, "access denied", 403);

    long now = System.currentTimeMillis();
    int affected = User.revokeAllSessions(now);
    // Ordered after the epoch bump: the epoch is what takes effect immediately,
    // and reset() mints a replacement signer, so doing it the other way round
    // would leave a brief window where the new signer existed but the watermark
    // had not moved.
    YasssCore.getTicketEngine().reset();

    // Including the caller's own, and then handed back a fresh one -- an
    // administrator who cannot reach the next endpoint after pulling this lever
    // cannot see whether it worked.
    if(null != auth.getActor()) reissueSession(res, auth.getActor(), now);

    res.status(200);
    return new JSONObject()
        .put("status", "ok")
        .put("info", "all sessions successfully revoked")
        .put("accounts", affected);
  }

}
