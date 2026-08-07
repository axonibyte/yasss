/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;
import com.crowdease.yasss.YasssCore;

import org.json.JSONObject;

import spark.Request;
import spark.Response;

/**
 * Endpoint that provides some basic information about the runtime. Helpful when
 * a random endpoint needs to be used for initial authentication, but not
 * necessarily used for such purposes.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public final class APIInfoEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public APIInfoEndpoint() {
    super("", APIVersion.VERSION_1, HTTPMethod.GET);
  }

  /**
   * {@inheritDoc}
   */

  /**
   * {@inheritDoc}
   *
   * <p>The only endpoint that returns {@code true}. There is no {@code /login} route in
   * this API -- authenticating against the version root <em>is</em> the sign-in, and the
   * client exchanges the credential it presents here for a session ticket immediately.
   * See {@link AuthToken#process()} for why every other endpoint refuses one.</p>
   */
  @Override protected boolean acceptsCredentials() {
    return true;
  }

  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    // This is the readiness check -- what a supervisor polls, and what
    // `e2e/run.sh` waits on before it believes the stack is up. It read nothing
    // but in-memory state, so it answered "ok" with a dead database while every
    // endpoint that matters returned `database malfunction`. A 503 is what a
    // supervisor acts on; a 200 with a sad field in the body is not.
    //
    // Set on the response rather than thrown as an EndpointException, which
    // would be the obvious spelling. `Endpoint.onRequest` prints a stack trace
    // for any code at or above 500, and this one is polled on a timer -- so an
    // hour of database downtime would bury the log under several hundred
    // identical traces of a condition that is already reported, in one line,
    // by the probe itself. The trace would say where the throw was, which
    // nobody needs to be told.
    if(!YasssCore.databaseHealthy()) {
      res.status(503);
      return new JSONObject()
          .put("status", "error")
          .put("info", "database unavailable")
          // Still worth answering, because these are exactly what somebody
          // debugging the outage wants: which build, and how long it has been up.
          .put("uptime", System.currentTimeMillis() - YasssCore.getLaunchTime())
          .put("build", YasssCore.getVersion());
    }

    res.status(200);

    JSONObject resBody = new JSONObject()
      .put("status", "ok")
      .put("uptime", System.currentTimeMillis() - YasssCore.getLaunchTime())
      .put("version", APIVersion.VERSION_1.ordinal())
      // The build, as opposed to `version` above, which is the *API* version --
      // an ordinal, and therefore 0. Nothing on a running system said which
      // build it was.
      .put("build", YasssCore.getVersion())
      .put("debug", YasssCore.debugEnabled())
      // Published rather than enforced: the password never leaves the browser,
      // so the client is the only tier that can apply this. See
      // YasssCore.getPasswordMinLength.
      .put("passwordMinLength", YasssCore.getPasswordMinLength())
      // What a v2 credential must name, and how far its timestamp may sit from ours.
      // Published rather than guessed: behind a proxy the client cannot know the
      // deployment's public name, and a wrong audience fails every sign-in silently.
      .put("sigAudience", YasssCore.getSigAudience())
      .put("sigMaxSkew", YasssCore.getSigMaxSkew())
      // So a client can tell whether it may still fall back to the replayable format.
      .put("acceptLegacySig", YasssCore.acceptLegacySig())
      // The clock a credential is judged against, so a client that has never been
      // refused can still correct for its own drift before it signs.
      .put("serverTime", System.currentTimeMillis())
      // So the client can hide a sign-in button that could not have worked. A relying
      // party that cannot be resolved -- an IP address for api.host, most likely -- makes
      // every ceremony fail inside the browser, where nothing server-side sees it.
      .put("passkeys", null != YasssCore.getRelyingParty());

    if(null != YasssCore.getCAPTCHAValidator())
      resBody.put("captcha", YasssCore.getCAPTCHAValidator().getSiteKey());

    return resBody;
  }
  
}
