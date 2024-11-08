/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import java.sql.SQLException;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import com.axonibyte.lib.auth.CryptoException;
import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;
import com.crowdease.yasss.YasssCore;
import com.crowdease.yasss.model.JSONDeserializer;
import com.crowdease.yasss.model.Mail;
import com.crowdease.yasss.model.User;
import com.crowdease.yasss.model.JSONDeserializer.DeserializationException;
import com.crowdease.yasss.model.User.AccessLevel;

import org.json.JSONObject;

import spark.Request;
import spark.Response;

/**
 * Endpoint responsible for resetting a user's credentials.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public class ResetUserEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public ResetUserEndpoint() {
    super("/users/:user", APIVersion.VERSION_1, HTTPMethod.POST);
  }

  /**
   * {@inheritDoc}
   */
  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    if(!auth.is(Authorization.IS_HUMAN) && !auth.is(AccessLevel.ADMIN))
      throw new EndpointException(req, "access denied", 403);
    
    try {
      User user = null;
      
      try {
        user = User.getUser(
            UUID.fromString(
                req.params("user")));
      } catch(IllegalArgumentException e) {
        user = User.getUser(req.params("user"));
      }
      
      if(null == user)
        throw new EndpointException(req, "user not found", 404);
      
      String reqBody = req.body();
      
      try {
        
        if(null == reqBody || reqBody.isEmpty())
          throw new EmptyBodyException();
        
        JSONDeserializer deserializer = new JSONDeserializer(req.body())
            .tokenize("token", false)
            .tokenize("pubkey", false)
            .check();
        
        if(!deserializer.has("token") && !deserializer.has("pubkey"))
          throw new EmptyBodyException();

        System.err.println(deserializer.getString("token"));
        
        if(!YasssCore.getTicketEngine().verify(
            user.getID().toString(),
            deserializer.getString("token"))) {
          throw new EndpointException(req, "access denied", 403);
        }
        
        try {
          user.setPubkey(
              deserializer.getString("pubkey"));
        } catch(CryptoException e) {
          throw new EndpointException(req, "malformed argument (pubkey)", 400, e);
        }

        user.commit();
        
        res.status(200);
        return new JSONObject()
            .put("status", "ok")
            .put("info", "credentials successfully reset");
        
      } catch(EmptyBodyException e) {
        
        if(null == user.getEmail())
          throw new EndpointException(req, "user has no verified email", 409);
        
        Map<String, String> args = new HashMap<>();
        args.put(
            "RESET_LINK",
            String.format(
                "%1$s?action=reset-user&user=%2$s&token=%3$s",
                YasssCore.getAPIHost(),
                user.getID().toString(),
                YasssCore.getTicketEngine().sign(
                    user.getID().toString())));
        
        Mail mail = new Mail(
            user.getEmail(),
            "reset-user",
            args);
        mail.send();
        
        res.status(202);
        return new JSONObject()
            .put("status", "ok")
            .put("info", "credential reset request initiated");
      }
      
    } catch(DeserializationException e) {
      throw new EndpointException(req, e.getMessage(), 400, e);
    } catch(CryptoException e) {
      throw new EndpointException(req, "cryptographic malfunction", 500, e);
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }

  private static final class EmptyBodyException extends Exception { }
  
}
