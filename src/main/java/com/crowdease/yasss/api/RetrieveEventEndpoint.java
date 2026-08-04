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

import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;
import com.crowdease.yasss.YasssCore;
import com.crowdease.yasss.model.Event;
import com.crowdease.yasss.model.User;
import com.crowdease.yasss.model.Volunteer;
import com.crowdease.yasss.model.User.AccessLevel;
import com.stripe.exception.StripeException;

import org.json.JSONArray;
import org.json.JSONObject;

import spark.Request;
import spark.Response;

/**
 * Endpoint responsible for retrieving the details of an event.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public final class RetrieveEventEndpoint extends APIEndpoint {

  /**
   * Instantiates the endpoint.
   */
  public RetrieveEventEndpoint() {
    super("/events/:event", APIVersion.VERSION_1, HTTPMethod.GET);
  }

  /**
   * {@inheritDoc}
   */
  @Override public JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException {
    try {
      Event event = null;

      try {
        event = resolveEvent(req.params("event"));
      } catch(IllegalArgumentException e) { }

      if(null == event)
        throw new EndpointException(req, "event not found", 404);

      // Fulfilment is only attempted for a caller who could plausibly have just
      // paid -- the event's own organiser, or an admin. It used to run for any
      // caller at all, so anyone holding an unpublished event id could drive one
      // Stripe API round trip per outstanding checkout session, on repeat, with
      // no authentication.
      if(!event.isPublished()
         && (null == YasssCore.getStripe()
             || !auth.atLeast(event)
             || !YasssCore.getStripe().fulfillCheckout(event))
         && !auth.atLeast(AccessLevel.ADMIN))
        throw new EndpointException(req, "event not published", 402);

      JSONArray activityArr = new JSONArray();
      JSONArray windowArr = new JSONArray();
      JSONArray volunteerArr = new JSONArray();
      JSONArray detailArr = new JSONArray();
      Map<UUID, Volunteer> volunteers = new HashMap<>();

      for(var volunteer : event.getVolunteers())
        volunteers.put(volunteer.getID(), volunteer);

      for(var activity : event.getActivities()) {
        JSONArray slotArr = new JSONArray();
        for(var slot : activity.getSlots()) {
          // Ids only for callers who are shown the volunteers themselves. The
          // `volunteers` array below is authorization-filtered; this one was
          // not, so an anonymous GET returned every volunteer id and an exact
          // per-slot headcount for an event whose volunteer list it then
          // withheld. `rsvpCount` stays unconditional -- how full a slot is, is
          // what a volunteer needs in order to decide whether to sign up.
          JSONArray rsvpArr = new JSONArray();
          int rsvpCount = 0;
          for(var rsvp : slot.getRSVPs().entrySet()) {
            // Counted before the filter, not after. `rsvpCount` used to be
            // `rsvpArr.length()`, so filtering the ids also zeroed the count --
            // and the count is what every viewer legitimately needs in order to
            // see whether a slot has room.
            rsvpCount++;
            if(auth.atLeast(User.getUser(rsvp.getValue().getUser())) || auth.atLeast(event))
              rsvpArr.put(rsvp.getValue().getID());
          }
          slotArr.put(
              new JSONObject()
                  .put("window", slot.getWindow())
                  .put("maxSlotVolunteers", slot.getMaxSlotVolunteers())
                  .put("rsvps", rsvpArr)
                  .put("rsvpCount", rsvpCount));
        }
        activityArr.put(
            new JSONObject()
                .put("id", activity.getID())
                .put("shortDescription", activity.getShortDescription())
                .put("longDescription", activity.getLongDescription())
                .put("maxActivityVolunteers", activity.getMaxActivityVolunteers())
                .put("maxSlotVolunteersDefault", activity.getMaxSlotVolunteersDefault())
                .put("priority", activity.getPriority())
                .put("slots", slotArr));
      }

      for(var window : event.getWindows())
        windowArr.put(
            new JSONObject()
                .put("id", window.getID())
                .put("begin", window.getBeginTime().getTime())
                .put(
                    "end",
                    null != window.getEndTime()
                        ? window.getEndTime().getTime()
                        : JSONObject.NULL));

      for(var detail : event.getDetails())
        detailArr.put(
            new JSONObject()
                .put("id", detail.getID())
                .put("type", detail.getType())
                .put("label", detail.getLabel())
                .put("hint", detail.getHint())
                .put("priority", detail.getPriority())
                .put("required", detail.isRequired()));

      for(var volunteer : volunteers.values()) {
        if(!auth.atLeast(User.getUser(volunteer.getUser()))
            && !auth.atLeast(event))
          continue;
        
        volunteerArr.put(
            new JSONObject()
                .put("id", volunteer.getID())
                .put("name", volunteer.getName())
                .put("remindersEnabled", volunteer.remindersEnabled())
                          // The address itself is deliberately not
                          // disclosed: the platform is the sender, and
                          // the organiser has no operational need for it.
                          .put(
                              "reminderConfirmed",
                              Volunteer.ReminderState.CONFIRMED
                                  == volunteer.getReminderState())
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
      }

      res.status(200);
      return new JSONObject()
          .put("status", "ok")
          .put("info", "successfully retrieved event")
          .put("event", new JSONObject()
              .put("id", event.getID())
              .put("admin", event.getAdmin())
              .put("shortDescription", event.getShortDescription())
              .put("longDescription", event.getLongDescription())
              .put("emailOnSubmission", event.emailOnSubmissionEnabled())
              .put("allowMultiUserSignups", event.allowMultiUserSignups())
              .put("timezone", event.getTimezone())
              .put("code", event.getCode())
              .put("reminderLeadTime", event.getReminderLeadTime())
              .put("isPublished", event.isPublished())
              .put("activities", activityArr)
              .put("windows", windowArr)
              .put("details", detailArr)
              .put("volunteers", volunteerArr)
              .put(
                  // `1 >= count` reported an event as maxed when nobody had
                  // signed up at all, and as not-maxed once two entries
                  // existed. Guarding on a null actor rather than on
                  // IS_AUTHENTICATED matters because atLeast() short-circuits
                  // to true when the signin requirement is disabled, leaving
                  // getActor() null.
                  "volunteersMaxed",
                  event.allowMultiUserSignups() || auth.atLeast(event)
                      ? false
                      : null != auth.getActor()
                          ? 1 <= event.countVolunteers(
                              auth.getActor().getID(),
                              null)
                      : 1 <= event.countVolunteers(
                          null,
                          req.ip()))
              .put("expired", event.isExpired()));

    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    } catch(StripeException e) {
      throw new EndpointException(req, "stripe malfunction", 500, e);
    }
  }
}
