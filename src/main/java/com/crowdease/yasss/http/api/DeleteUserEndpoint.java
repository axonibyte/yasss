/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.http.api;

import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;

import org.json.JSONObject;

import spark.Request;
import spark.Response;

public class DeleteUserEndpoint extends APIEndpoint {

  protected DeleteUserEndpoint() {
    super(null, APIVersion.VERSION_1, null);
  }

  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    return null;
  }
}
