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

public final class APIInfoEndpoint extends APIEndpoint {

  public APIInfoEndpoint() {
    super("", APIVersion.VERSION_1, HTTPMethod.GET);
  }

  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    res.status(200);
    return new JSONObject()
        .put("status", "ok")
       .put("uptime", System.currentTimeMillis() - YasssCore.getLaunchTime())
       .put("version", APIVersion.VERSION_1.ordinal());
  }
  
}
