/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import java.sql.SQLException;

import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.AuthStatus;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;
import com.axonibyte.lib.http.rest.JSONEndpoint;
import com.crowdease.yasss.YasssCore;
import com.crowdease.yasss.api.AuthToken.AuthException;
import com.crowdease.yasss.model.JSONDeserializer;
import com.crowdease.yasss.model.User;
import com.crowdease.yasss.model.JSONDeserializer.DeserializationException;

import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import spark.Request;
import spark.Response;

/**
 * Represents a standard API endpoint that can accept a JSON request and returns
 * a JSON response.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public abstract class APIEndpoint extends JSONEndpoint {

  public static final String ACCESS_LEVEL_HEADER = "AXB-ACCESS-LEVEL";
  public static final String ACCOUNT_HEADER = "AXB-ACCOUNT";
  public static final String SESSION_HEADER = "AXB-SESSION";
  
  private static final Logger logger = LoggerFactory.getLogger(APIEndpoint.class);

  /**
   * Instantiates the endpoint.
   *
   * @param resource the version-exclusive path used to access the endpoint
   * @param version the {@link APIVersion} associated with the endpoint, which
   *        prepended to the resource path accordingly
   * @param methods the array of HTTP methods that can be used to hit the endpoint
   */
  protected APIEndpoint(String resource, APIVersion version, HTTPMethod... methods) {
    super(resource, version, methods);
  }

  /**
   * {@inheritDoc}
   */
  @Override public AuthStatus authenticate(Request req, Response res) throws EndpointException {
    String authString = req.headers("Authorization");
    User user = null;

    try {
      AuthToken token = new AuthToken(authString);
      String nextSession = token.process();
      user = token.getUser();

      res.header(ACCESS_LEVEL_HEADER, user.getAccessLevel().name());
      res.header(ACCOUNT_HEADER, user.getID().toString());
      res.header(SESSION_HEADER, nextSession);
      
    } catch(AuthException e) {
      logger.error("authorization error: {}", e.getMessage());
    } catch(SQLException e) {
      logger.error(
          "database malfunction: {}",
          null == e.getMessage() ? "no further info available" : e.getMessage());
      throw new EndpointException(req, "internal server error", 500, e);
    }
    
    return new Authorization(user, verifyHuman(req));
  }

  /**
   * Determines whether the caller should be treated as human.
   *
   * <p>The CAPTCHA validator is only constructed when {@code auth.captcha.required}
   * is enabled, and the shipped default is disabled -- so this must tolerate a
   * null validator. Note that returning {@code false} in that case would be
   * wrong: registration, credential reset, account verification, anonymous
   * event publication and anonymous volunteer signup all gate on
   * {@code IS_HUMAN}, and would become unreachable in exactly the deployments
   * that never asked for CAPTCHAs in the first place. No CAPTCHA configured
   * means the check does not apply, not that it fails.
   *
   * @param req the HTTP {@link Request}
   * @return {@code true} if the caller passes the human check
   */
  protected static boolean verifyHuman(Request req) {
    return verifyHuman(
        req.headers(com.axonibyte.lib.http.captcha.CAPTCHAValidator.CAPTCHA_HEADER),
        req.ip());
  }

  /**
   * Determines whether a caller should be treated as human, given their CAPTCHA
   * token and originating address.
   *
   * @param captchaToken the value of the CAPTCHA header, or {@code null}
   * @param ipAddr the caller's IP address
   * @return {@code true} if the caller passes the human check
   */
  protected static boolean verifyHuman(String captchaToken, String ipAddr) {
    var validator = YasssCore.getCAPTCHAValidator();
    return null == validator || validator.verify(captchaToken, null, ipAddr);
  }

  /**
   * {@inheritDoc}
   */
  @Override public JSONObject doEndpointTask(Request req, Response res, AuthStatus auth) throws EndpointException {
    return onCall(req, res, (Authorization)auth);
  }

  /**
   * Executes the endpoint workflow.
   *
   * @param req the HTTP {@link Request}
   * @param res the HTTP {@link Response}
   * @param auth the {@link Authorization} associated with the actor accessing
   *        the endpoint
   * @return the {@link JSONObject} response
   * @throws EndpointException if a malfunction occurs during the execution of
   *         the endpoint's workflow
   */
  public abstract JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException;

  /**
   * Converts the query parameters into a {@link JSONObject}. If there exists
   * only one value for the associated parameter, the value added to the object
   * will be a string; otherwise, the value will be an array of strings.
   *
   * @param req the HTTP {@link Request}
   * @return a {@link JSONDeserializer} to assist in the deserialization of the
   *         JSON object
   * @throws DeserializationException if the deserialization process fails for
   *         some reason (which should never happen on this particular method)
   */
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

  /**
   * Reads a positive integer from deserialized query parameters.
   *
   * <p>{@link #deserializeQueryParams(Request)} necessarily stores every value
   * as a {@link String}, but {@code JSONDeserializer.getInt} casts to
   * {@link Integer} -- so reading a numeric query argument the ordinary way
   * throws a {@link ClassCastException} and surfaces as a confusing 400. This
   * parses leniently instead. It is deliberately local to query handling rather
   * than a change to {@code getInt}, which would alter behavior for every
   * endpoint that reads a request body.
   *
   * @param req the HTTP {@link Request}
   * @param deserializer the {@link JSONDeserializer} holding the query params
   * @param token the parameter name
   * @return the parsed value
   * @throws EndpointException with a 400 if the value is absent, unparseable, or below 1
   */
  protected static int queryInt(Request req, JSONDeserializer deserializer, String token)
      throws EndpointException {
    int value;
    try {
      value = Integer.parseInt(String.valueOf(deserializer.get(token)).strip());
    } catch(NumberFormatException | DeserializationException e) {
      throw new EndpointException(req, String.format("malformed argument (%1$s)", token), 400);
    }
    if(1 > value)
      throw new EndpointException(req, String.format("malformed argument (%1$s)", token), 400);
    return value;
  }

}
