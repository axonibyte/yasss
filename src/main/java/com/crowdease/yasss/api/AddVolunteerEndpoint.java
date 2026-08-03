/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import java.sql.SQLException;
import java.text.SimpleDateFormat;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;
import com.crowdease.yasss.YasssCore;
import com.crowdease.yasss.model.Activity;
import com.crowdease.yasss.model.Detail;
import com.crowdease.yasss.model.Event;
import com.crowdease.yasss.model.HTMLElem;
import com.crowdease.yasss.model.JSONDeserializer;
import com.crowdease.yasss.model.Mail;
import com.crowdease.yasss.model.RSVP;
import com.crowdease.yasss.model.Slot;
import com.crowdease.yasss.model.User;
import com.crowdease.yasss.model.ReminderConsent;
import com.crowdease.yasss.model.Volunteer;
import com.crowdease.yasss.model.VolunteerSummary;
import com.crowdease.yasss.model.Window;
import com.crowdease.yasss.model.JSONDeserializer.DeserializationException;
import com.crowdease.yasss.model.User.AccessLevel;

import org.json.JSONArray;
import org.json.JSONObject;

import spark.Request;
import spark.Response;

/**
 * Endpoint that handles the adding of a volunteer to an event.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public final class AddVolunteerEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public AddVolunteerEndpoint() {
    super("/events/:event/volunteers", APIVersion.VERSION_1, HTTPMethod.POST);
  }

  /**
   * {@inheritDoc}
   */
  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    try {

      Event event = null;

      try {
        event = Event.getEvent(
            UUID.fromString(
                req.params("event")));
      } catch(IllegalArgumentException e) { }

      if(null == event)
        throw new EndpointException(req, "event not found", 404);

      JSONDeserializer deserializer = new JSONDeserializer(req.body())
        .tokenize("name", true)
        .tokenize("remindersEnabled", false)
        .tokenize("reminderEmail", false)
        .tokenize("details", true)
        .tokenize("user", false)
        .tokenize("rsvps", false)
        .check();

      User user = null;
      if(deserializer.has("user")) {
        try {
          user = User.getUser(
              deserializer.getUUID("user"));
        } catch(DeserializationException e) { }
        
        if(null == user)
          throw new EndpointException(req, "user not found", 404);
      }

      if(!auth.is(Authorization.IS_AUTHENTICATED) && !auth.atLeast(Authorization.IS_HUMAN)
          || auth.is(Authorization.IS_AUTHENTICATED) && !auth.atLeast(AccessLevel.STANDARD)
          || null != user && !auth.atLeast(user))
        throw new EndpointException(req, "access denied", 403);

      if(!auth.atLeast(AccessLevel.ADMIN) && event.isExpired())
        throw new EndpointException(req, "event expired", 412);

      // When multi-user signups are disallowed, a given identity gets one
      // volunteer entry. Identity is the account when there is one, and the
      // originating IP otherwise.
      //
      // Three things were wrong here. The account and IP branches were swapped,
      // so an anonymous caller was counted by account -- dereferencing a null
      // actor and yielding a 500 instead of a signup. And the comparison was
      // reversed: `1 >= count` treats a count of zero as "cap reached", so the
      // very first signup was rejected. Guest RSVP could not have worked.
      if(!event.allowMultiUserSignups() && !auth.atLeast(event)) {
        UUID actorID = null == auth.getActor() ? null : auth.getActor().getID();
        int existing = null != actorID
            ? event.countVolunteers(actorID, null)
            : event.countVolunteers(null, req.ip());
        if(1 <= existing)
          throw new EndpointException(req, "volunteer cap reached", 412);
      }

      String name = bounded(req, deserializer.getString("name").strip(), "name");
      if(name.isBlank())
        throw new EndpointException(req, "malformed argument (name)", 400);

      Volunteer volunteer = new Volunteer(
          null,
          null == user ? null : user.getID(),
          event.getID(),
          deserializer.getString("name"),
          deserializer.has("remindersEnabled")
              ? deserializer.getBool("remindersEnabled")
              : false,
          req.ip());
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
        String value = detailDeserializer.getString("value").strip();
        if(!detail.isValid(value))
          throw new EndpointException(req, "malformed argument (details[].value)", 400);
        details.put(
            fields.get(detailID),
            detailDeserializer.getString("value"));
      }

      for(var field : fields.values())
        if(field.isRequired() && !details.containsKey(field))
          throw new EndpointException(req, "missing required detail", 400);
      
      volunteer.setDetails(details);

      Set<Slot> slots = new HashSet<>();
      
      // `rsvps` is tokenized optional above, but tokenizeJSONArray iterates the
      // array unconditionally -- its `strict` flag only governs malformed
      // elements, not an absent array -- so omitting the field threw rather
      // than validating. A volunteer with no RSVPs is an ordinary request.
      var rsvpDeserializers = deserializer.has("rsvps")
          ? deserializer.tokenizeJSONArray("rsvps", true)
          : java.util.List.<JSONDeserializer>of();

      for(var rsvpDeserializer : rsvpDeserializers) {
        rsvpDeserializer
          .tokenize("activity", true)
          .tokenize("window", true)
          .check();
        Activity activity = event.getActivity(
            rsvpDeserializer.getUUID("activity"));
        if(null == activity)
          throw new EndpointException(req, "activity not found", 404);
        Slot slot = activity.getSlot(
            rsvpDeserializer.getUUID("window"));
        if(null == slot)
          throw new EndpointException(req, "window/slot not found", 404);
        slots.add(slot);
      }

      // Reminder consent. remindersEnabled is intent; reminder_state is the
      // consent fact, and the daemon requires both. The rules themselves live in
      // ReminderConsent so that create and modify cannot drift apart.
      if(volunteer.remindersEnabled()) {
        var decision = ReminderConsent.resolve(
            deserializer.has("reminderEmail")
                ? deserializer.getString("reminderEmail")
                : null,
            null == user ? null : user.getEmail(),
            null != user && auth.atLeast(AccessLevel.STANDARD),
            null,
            null);

        if(null != decision.error())
          throw new EndpointException(req, decision.error(), 400);

        volunteer
            .setReminderEmail(decision.email())
            .setReminderState(decision.state())
            .setReminderToken(UUID.randomUUID());
      }

      volunteer.commit();

      for(var slot : slots) {
        RSVP rsvp = new RSVP(
            slot.getActivity(),
            slot.getWindow(),
            volunteer.getID());
        rsvp.commit();
      }

      User admin = User.getUser(event.getAdmin());
      if(null != admin) {
        Map<String, String> args = new HashMap<>();
        args.put("EVENT_TITLE", event.getShortDescription());
        args.put(
            "EVENT_URL",
            String.format(
                "%1$s/?event=%2$s",
                YasssCore.getAPIHost(),
                event.getID().toString()));
        args.put("VOLUNTEER_NAME", volunteer.getName());
        args.put("VOLUNTEER_DETAILS", VolunteerSummary.detailList(volunteer));
        args.put("RSVP_LIST", VolunteerSummary.rsvpList(event, volunteer));

        Mail mail = new Mail(
            admin.getEmail(),
            "signup-alert",
            args);
        mail.send();
      }

      // Double opt-in. Sent after commit so the token is durable, and only when
      // the address has not already been proven by a verified account.
      if(Volunteer.ReminderState.PENDING == volunteer.getReminderState())
        sendReminderPrompt(event, volunteer);

      res.status(201);
      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully added volunteer")
          .put("volunteer", new JSONObject()
              .put("id", volunteer.getID())
              .put("user", volunteer.getUser())
              .put("event", volunteer.getEvent())
              .put("name", volunteer.getName())
              .put(
                  "details",
                  (JSONArray)details.entrySet()
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
