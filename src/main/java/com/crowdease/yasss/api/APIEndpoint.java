/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.AuthStatus;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;
import com.axonibyte.lib.http.rest.JSONEndpoint;
import com.crowdease.yasss.model.JSONDeserializer;
import com.crowdease.yasss.model.JSONDeserializer.DeserializationException;

import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import spark.Request;
import spark.Response;

public abstract class APIEndpoint extends JSONEndpoint {

  private static final Logger logger = LoggerFactory.getLogger(APIEndpoint.class);

  protected APIEndpoint(String resource, APIVersion version, HTTPMethod... methods) {
    super(resource, version, methods);
  }

  @Override public AuthStatus authenticate(Request req, Response res) throws EndpointException {
    return new Authorization(null, false); // TODO implement this
  }

  @Override public JSONObject doEndpointTask(Request req, Response res, AuthStatus auth) throws EndpointException {
    return onCall(req, res, (Authorization)auth);
  }

  public abstract JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException;

  protected JSONDeserializer deserializeQueryParams(Request req) throws DeserializationException {
    JSONObject map = new JSONObject();
    for(var param : req.queryParams()) {
      var argArr = req.queryParamsValues(param);
      map.put(
          param,
          1 == argArr.length ? argArr[0] : argArr);
    }
    return new JSONDeserializer(map);
  }
  
}
