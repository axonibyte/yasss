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
  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    res.status(200);

    JSONObject resBody = new JSONObject()
      .put("status", "ok")
      .put("uptime", System.currentTimeMillis() - YasssCore.getLaunchTime())
      .put("version", APIVersion.VERSION_1.ordinal());

    if(null != YasssCore.getCAPTCHAKeys())
      resBody.put("captcha", YasssCore.getCAPTCHAKeys().getKey());

    return resBody;
  }
  
}
