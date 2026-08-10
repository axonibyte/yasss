/*
 * Copyright (c) 2026 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import java.sql.SQLException;
import java.util.UUID;

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
 * Endpoint that changes a custom question on a poll.
 *
 * @author Caleb L. Power &lt;cpower&#64;crowdease.com&gt;
 */
public final class ModifyPollDetailEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public ModifyPollDetailEndpoint() {
    super("/polls/:poll/details/:detail", APIVersion.VERSION_1, HTTPMethod.PATCH);
  }

  /**
   * {@inheritDoc}
   */
  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    try {
      Poll poll = PollGuard.editable(req, auth);

      PollDetail detail = null;
      try {
        detail = poll.getDetail(UUID.fromString(req.params("detail")));
      } catch(IllegalArgumentException e) { }

      if(null == detail)
        throw new EndpointException(req, "detail not found", 404);

      JSONDeserializer deserializer = new JSONDeserializer(req.body())
          .tokenize("type", false)
          .tokenize("label", false)
          .tokenize("hint", false)
          .tokenize("priority", false)
          .tokenize("required", false)
          .check();

      if(deserializer.has("type"))
        detail.setType(enumOf(req, Detail.Type.class, deserializer.getString("type"), "type"));

      if(deserializer.has("label")) {
        detail.setLabel(bounded(req, deserializer.getString("label").strip(), "label"));
        if(detail.getLabel().isBlank())
          throw new EndpointException(req, "malformed argument (string: label)", 400);
      }

      if(deserializer.has("hint"))
        detail.setHint(bounded(req, deserializer.getString("hint").strip(), "hint"));

      if(deserializer.has("priority")) {
        detail.setPriority(deserializer.getInt("priority"));
        if(0 > detail.getPriority() || 255 < detail.getPriority())
          throw new EndpointException(req, "malformed argument (int: priority)", 400);
      }

      if(deserializer.has("required"))
        detail.setRequired(deserializer.getBool("required"));

      detail.commit();

      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully updated detail")
          .put("detail", PollView.detail(detail));

    } catch(DeserializationException e) {
      throw new EndpointException(req, e.getMessage(), 400, e);
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
}
