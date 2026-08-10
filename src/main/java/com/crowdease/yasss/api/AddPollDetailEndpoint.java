/*
 * Copyright (c) 2026 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import java.sql.SQLException;

import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;
import com.crowdease.yasss.model.Detail;
import com.crowdease.yasss.model.JSONDeserializer;
import com.crowdease.yasss.model.JSONDeserializer.DeserializationException;
import com.crowdease.yasss.model.Poll;
import com.crowdease.yasss.model.PollDetail;

import org.json.JSONObject;

import spark.Request;
import spark.Response;

/**
 * Endpoint that adds a custom question to a poll.
 *
 * @author Caleb L. Power &lt;cpower&#64;crowdease.com&gt;
 */
public final class AddPollDetailEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public AddPollDetailEndpoint() {
    super("/polls/:poll/details", APIVersion.VERSION_1, HTTPMethod.POST);
  }

  /**
   * {@inheritDoc}
   */
  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    try {
      Poll poll = PollGuard.editable(req, auth);

      JSONDeserializer deserializer = new JSONDeserializer(req.body())
          .tokenize("type", true)
          .tokenize("label", true)
          .tokenize("hint", false)
          .tokenize("priority", false)
          .tokenize("required", false)
          .check();

      PollDetail detail = new PollDetail(
          null,
          poll.getID(),
          enumOf(req, Detail.Type.class, deserializer.getString("type"), "type"),
          bounded(req, deserializer.getString("label").strip(), "label"),
          deserializer.has("hint")
              ? bounded(req, deserializer.getString("hint").strip(), "hint")
              : "",
          deserializer.has("priority")
              ? deserializer.getInt("priority")
              : poll.getDetails().size(),
          deserializer.has("required") && deserializer.getBool("required"));

      if(detail.getLabel().isBlank())
        throw new EndpointException(req, "malformed argument (string: label)", 400);
      if(0 > detail.getPriority() || 255 < detail.getPriority())
        throw new EndpointException(req, "malformed argument (int: priority)", 400);

      detail.commit();

      res.status(201);
      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully created detail")
          .put("detail", PollView.detail(detail));

    } catch(DeserializationException e) {
      throw new EndpointException(req, e.getMessage(), 400, e);
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
