/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import com.crowdease.yasss.model.ReminderConsent;
import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;
import com.crowdease.yasss.model.Detail;
import com.crowdease.yasss.model.Event;
import com.crowdease.yasss.model.JSONDeserializer;
import com.crowdease.yasss.model.User;
import com.crowdease.yasss.model.Volunteer;
import com.crowdease.yasss.model.JSONDeserializer.DeserializationException;
import com.crowdease.yasss.model.User.AccessLevel;

import org.json.JSONArray;
import org.json.JSONObject;

import spark.Request;
import spark.Response;

/**
 * Endpoint that handles the modification of event volunteers.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public final class ModifyVolunteerEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public ModifyVolunteerEndpoint() {
    super("/events/:event/volunteers/:volunteer", APIVersion.VERSION_1, HTTPMethod.PATCH);
  }

  /**
   * {@inheritDoc}
   */
  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    try {
      Event event = null;
      Volunteer volunteer = null;

      try {
        event = resolveEvent(req.params("event"));

        if(null != event)
          volunteer = event.getVolunteer(
              UUID.fromString(
                  req.params("volunteer")));
        
      } catch(IllegalArgumentException e) { }

      if(null == volunteer)
        throw new EndpointException(req, "volunteer not found", 404);

      if(!auth.atLeast(User.getUser(volunteer.getUser()))
          && !auth.atLeast(event))
        throw new EndpointException(req, "access denied", 403);

      if(!auth.atLeast(AccessLevel.ADMIN) && event.isExpired())
        throw new EndpointException(req, "event expired", 412);

      JSONDeserializer deserializer = new JSONDeserializer(req.body())
        .tokenize("name", false)
        .tokenize("remindersEnabled", false)
        .tokenize("reminderEmail", false)
        .tokenize("details", false)
        .tokenize("user", false)
        .check();

      if(deserializer.has("user")) {
        User user = null;
        try {
          user = User.getUser(
              deserializer.getUUID("user"));
        } catch(IllegalArgumentException e) { }

        if(null == user)
          throw new EndpointException(req, "user not found", 404);

        volunteer.setUser(user.getID());
      }

      if(deserializer.has("name")) {
        String name = bounded(req, deserializer.getString("name").strip(), "name");
        if(name.isBlank())
          throw new EndpointException(req, "malformed argument (name)", 400);
        volunteer.setName(name);
      }

      if(deserializer.has("details")) {
        Map<UUID, Detail> fields = event.getDetails()
          .stream()
          .collect(
              Collectors.toMap(
                  e -> e.getID(),
                  e -> e,
                  (a, b) -> a,
                  LinkedHashMap::new));

        Map<Detail, String> details = new LinkedHashMap<>();
        for(var detailDeserializer : deserializer.tokenizeJSONArray("details", true)) {
          detailDeserializer
            .tokenize("detail", true)
            .tokenize("value", true)
            .check();
          UUID detailID = detailDeserializer.getUUID("detail");
          if(!fields.containsKey(detailID))
            throw new EndpointException(req, "detail not found", 404);
          Detail detail = fields.get(detailID);
          // `bounded` for the same reason it guards `name`: detail_value is
          // VARCHAR(255), and without it an over-long answer reached the insert
          // and came back as `database malfunction` with a 500 -- on the one
          // endpoint an anonymous volunteer has no way to avoid. Found by the
          // frontend input fuzzer.
          String value = bounded(
              req,
              // Normalised before validating: an EMAIL custom field's pattern is
              // lowercase-only, so a capitalised answer was refused outright.
              detail.getType().normalize(
                  detailDeserializer.getString("value").strip()),
              "details[].value");
          if(!detail.isValid(value))
            throw new EndpointException(req, "malformed argument (details[].value)", 400);
          // The stripped value is the one that was validated, so it is the one
          // that gets stored; re-reading the raw token here wrote back a value
          // nothing had checked.
          details.put(detail, value);
        }

        for(var field : fields.values())
          if(field.isRequired() && !details.containsKey(field))
            throw new EndpointException(req, "missing required detail", 400);

        volunteer.setDetails(details);
      }

      if(deserializer.has("remindersEnabled"))
        volunteer.enableReminders(
            deserializer.getBool("remindersEnabled"));

      // Consent is re-resolved on every update that leaves reminders on, so a
      // changed address is re-proven rather than inheriting the old address's
      // confirmation. Turning reminders off leaves the stored state alone --
      // the daemon requires both, and preserving it means switching back on with
      // the same address does not demand a pointless second confirmation.
      boolean promptNeeded = false;
      if(volunteer.remindersEnabled()) {
        var decision = ReminderConsent.resolve(
            deserializer.has("reminderEmail")
                ? deserializer.getString("reminderEmail")
                : volunteer.getReminderEmail(),
            null == auth.getActor() ? null : auth.getActor().getEmail(),
            auth.atLeast(AccessLevel.STANDARD),
            volunteer.getReminderEmail(),
            volunteer.getReminderState());

        if(null != decision.error())
          throw new EndpointException(req, decision.error(), 400);

        promptNeeded = Volunteer.ReminderState.PENDING == decision.state();
        volunteer
            .setReminderEmail(decision.email())
            .setReminderState(decision.state());

        // A fresh token on every re-prompt, so a link mailed to an address the
        // volunteer has since corrected cannot confirm the new one.
        if(promptNeeded) volunteer.setReminderToken(UUID.randomUUID());
      }

      volunteer.commit();

      if(promptNeeded) sendReminderPrompt(event, volunteer);

      res.status(200);
      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully updated volunteer")
          .put("volunteer", new JSONObject()
              .put("id", volunteer.getID())
              .put("user", volunteer.getUser())
              .put("event", volunteer.getEvent())
              .put("name", volunteer.getName())
              .put(
                  "details",
                  (JSONArray)volunteer.getDetails()
                      .entrySet()
                      .stream()
                      .map(
                          d -> new JSONObject()
                              .put("detail", d.getKey().getID())
                              .put("value", d.getValue()))
                      .collect(
                          JSONArray::new,
                          JSONArray::put,
                          (a, b) -> {
                            for(final Object o : b) a.put(o);
                          })));
      
    } catch(DeserializationException e) {
      throw new EndpointException(req, e.getMessage(), 400, e);
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }
  }
  
}
