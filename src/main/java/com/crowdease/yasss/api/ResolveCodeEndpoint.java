/*
 * Copyright (c) 2026 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import java.sql.SQLException;
import java.util.Locale;

import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;
import com.crowdease.yasss.model.AccessCode;

import org.json.JSONObject;

import spark.Request;
import spark.Response;

/**
 * Endpoint that says what a short code names.
 *
 * <p>What the single entry box needs. Somebody typing eight characters off a
 * flyer does not know whether they are holding an event or a poll, and this
 * answers that in one round trip -- rather than having the client guess, ask
 * for an event, and fall back to asking for a poll when that 404s.
 *
 * <p>Deliberately not a redirect. The client decides what to open and how, and
 * a 302 into {@code /polls/:id} would make the shape of the answer depend on
 * whether the caller followed it.
 *
 * @author Caleb L. Power &lt;cpower&#64;crowdease.com&gt;
 */
public final class ResolveCodeEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public ResolveCodeEndpoint() {
    super("/codes/:code", APIVersion.VERSION_1, HTTPMethod.GET);
  }

  /**
   * {@inheritDoc}
   */
  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    try {
      AccessCode.Ref ref = resolveCode(req.params("code"));

      // No authorization check, and that is the point of a code: holding one is
      // the permission. It says only what kind of thing exists and where, which
      // is what the caller is about to ask for anyway -- and the endpoint they
      // ask next applies whatever rules that thing has.
      if(null == ref)
        throw new EndpointException(req, "code not found", 404);

      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully resolved code")
          .put("kind", ref.kind().name().toLowerCase(Locale.ROOT))
          .put("id", ref.target());

    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
