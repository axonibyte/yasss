/*
 * Copyright (c) 2026 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import java.sql.SQLException;
import java.util.Base64;
import java.util.UUID;

import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;
import com.crowdease.yasss.model.Passkey;
import com.crowdease.yasss.model.User;

import org.json.JSONArray;
import org.json.JSONObject;

import spark.Request;
import spark.Response;

/**
 * Listing and removing an account's passkeys.
 *
 * @author Caleb L. Power
 */
public final class PasskeyListEndpoint extends APIEndpoint {

  /** Which operation an instance serves. */
  public static enum Mode {

    /** {@code GET /v1/users/:user/passkeys} */
    LIST("users/:user/passkeys", HTTPMethod.GET),

    /** {@code DELETE /v1/users/:user/passkeys/:passkey} */
    REMOVE("users/:user/passkeys/:passkey", HTTPMethod.DELETE);

    private final String resource;
    private final HTTPMethod method;

    private Mode(String resource, HTTPMethod method) {
      this.resource = resource;
      this.method = method;
    }
  }

  private final Mode mode;

  /**
   * Instantiates the endpoint.
   *
   * @param mode which operation this instance serves
   */
  public PasskeyListEndpoint(Mode mode) {
    super(mode.resource, APIVersion.VERSION_1, mode.method);
    this.mode = mode;
  }

  /**
   * {@inheritDoc}
   */
  @Override public JSONObject onCall(Request req, Response res, Authorization auth)
      throws EndpointException {
    try {
      User user = null;
      try {
        user = User.getUser(UUID.fromString(req.params("user")));
      } catch(IllegalArgumentException e) { }

      if(null == user)
        throw new EndpointException(req, "user not found", 404);

      // The same check every other per-account endpoint makes: the account itself, or an
      // administrator.
      if(!auth.atLeast(user))
        throw new EndpointException(req, "access denied", 403);

      return Mode.LIST == mode ? list(res, user) : remove(req, res, user);

    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }

  private JSONObject list(Response res, User user) throws SQLException {
    JSONArray out = new JSONArray();
    for(Passkey passkey : Passkey.byUser(user.getID()))
      out.put(
          new JSONObject()
              .put("id", passkey.getID().toString())
              .put("label", passkey.getLabel())
              .put("createdAt", passkey.getCreatedAt())
              .put("lastUsed", passkey.getLastUsed())
              .put("transports", passkey.getTransports())
              // Whether it is synced. The client needs this to answer "is it safe to turn
              // your password off": one synced passkey is recoverable from another device,
              // one device-bound passkey is not.
              .put("backupEligible", passkey.isBackupEligible())
              .put("backupState", passkey.isBackupState())
              // What it was enrolled under. A credential is bound to its relying party for
              // life, so if api.host ever moves this is what says why a passkey stopped
              // working.
              .put("rpID", passkey.getRpID()));

    res.status(200);
    return new JSONObject()
        .put("status", "ok")
        .put("info", "passkeys retrieved")
        .put("passkeys", out);
  }

  private JSONObject remove(Request req, Response res, User user)
      throws EndpointException, SQLException {
    UUID parsed = null;
    try {
      parsed = UUID.fromString(req.params("passkey"));
    } catch(IllegalArgumentException e) { }

    if(null == parsed)
      throw new EndpointException(req, "malformed argument (passkey)", 400);

    final UUID id = parsed;

    // The lockout guard. With password sign-in off, the passkeys ARE the account, and
    // removing the last one leaves nothing that can authenticate it -- recoverable only by
    // email, which is a fallback rather than a plan. Refused with something actionable
    // rather than allowed and regretted.
    if(user.isPasswordLoginDisabled()) {
      var enrolled = Passkey.byUser(user.getID());
      if(1 >= enrolled.size() && enrolled.stream().anyMatch(p -> p.getID().equals(id)))
        throw new EndpointException(
            req,
            "this is the only way left to sign in to this account; turn password sign-in "
            + "back on, or enrol another passkey, before removing it",
            409);
    }

    // Scoped to the account, so naming somebody else's credential is a 404 rather than a
    // deletion.
    if(!Passkey.remove(user.getID(), id))
      throw new EndpointException(req, "passkey not found", 404);

    // No session_epoch bump. Arguably it should happen when the removed credential is the
    // one the current session was established with -- but that is not tracked, and adding
    // the tracking is disproportionate to the risk. Stated here rather than left implicit.
    res.status(200);
    return new JSONObject()
        .put("status", "ok")
        .put("info", "passkey removed");
  }
}
