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

import com.axonibyte.lib.auth.CryptoException;
import com.crowdease.yasss.YasssCore;
import com.crowdease.yasss.model.User;

import org.bouncycastle.util.encoders.Base64;
import org.bouncycastle.util.encoders.DecoderException;
import org.json.JSONException;
import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class AuthToken {

  private static final String authHeader = "AXB-SIG-REQ";
  private static final Logger logger = LoggerFactory.getLogger(AuthToken.class);

  private final String authString;

  private User user = null;

  public AuthToken(String authString) {
    this.authString = authString;
  }

  public String process() throws AuthException, SQLException {
    if(null == authString)
      throw new AuthException("no auth string; skipping");
    else logger.info("processing auth string");

    String[] header = authString.split("\\s+");
    if(2 != header.length || !authHeader.equalsIgnoreCase(header[0]))
      throw new AuthException("malformed Authorization header");

    try {
      JSONObject payload = new JSONObject(
          new String(
              Base64.decode(header[1])));

      System.err.println(payload.toString());

      String sig = payload.getString("sig");
      String creds = payload.getString("creds");
      JSONObject credsJSO;

      try {
        credsJSO = new JSONObject(
            new String(
                Base64.decode(creds)));
      } catch(DecoderException e) {
        credsJSO = new JSONObject(creds);
      }

      if(credsJSO.has("account")) {
        user = User.getUser(
            UUID.fromString(
                credsJSO.getString("account")));
      } else if(credsJSO.has("email")) {
        user = User.getUser(
            credsJSO.getString("email"));
      }

      if(null == user)
        throw new AuthException("user does not exist");

      if(user.verifySig(creds, sig)
          && (null == user.getEncMFASecret()
              || user.verifyTOTP(
                  credsJSO.getString("mfa")))) {
        logger.info(
            "user {} successfully authenticated (new session)",
            user.getID().toString());
      } else if(YasssCore.getTicketEngine().verify(creds, sig)) {
        logger.info(
            "user {} successfully authenticated via ticket engine",
            user.getID().toString());
      } else {
        throw new AuthException("user %1$s failed to authenticate", user.getID().toString());
      }

      // TODO probably need to rework this a bit so that it also serves as a CSRF token
      
      String sessionCreds = Base64.toBase64String(
          new JSONObject()
              .put("account", user.getID().toString())
              .toString()
              .getBytes());
      String sessionSig = null;
      try {
        sessionSig = YasssCore.getTicketEngine().sign(sessionCreds);
      } catch(CryptoException e) {
        throw new AuthException("failed to sign session token");
      }

      return Base64.toBase64String(
          new JSONObject()
              .put("creds", sessionCreds)
              .put("sig", sessionSig)
              .toString()
              .getBytes());
      
    } catch(DecoderException | IllegalArgumentException | JSONException e) {
      e.printStackTrace();
      throw new AuthException("failed to decode %1$s payload", authHeader);
    }
    
  }

  public User getUser() {
    return user;
  }

  public static class AuthException extends Exception {
    AuthException(String format, Object... args) {
      super(String.format(format, args));
    }
  }
  
}
