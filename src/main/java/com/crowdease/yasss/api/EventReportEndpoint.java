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
import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;
import java.util.UUID;

import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.AuthStatus;
import com.axonibyte.lib.http.rest.Endpoint;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;
import com.crowdease.yasss.YasssCore;
import com.crowdease.yasss.api.AuthToken.AuthException;
import com.crowdease.yasss.model.Event;
import com.crowdease.yasss.model.HTMLElem;
import com.crowdease.yasss.model.User;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import spark.Request;
import spark.Response;

public final class EventReportEndpoint extends Endpoint {

  private static final String TOTAL_COLS = "5";
  private static final String ACTIVITY_COLSPAN = "2";
  private static final String DETAIL_COLSPAN = "3";
  private static final String RSVP_COLSPAN = "2";
  private static final String VOLUNTEER_COLSPAN = "2";
  private static final int ADDITIONAL_NOCAP_VOLUNTEERS = 5;

  private static final Logger logger = LoggerFactory.getLogger(EventReportEndpoint.class);

  public EventReportEndpoint() {
    super("/events/:event/report", APIVersion.VERSION_1, HTTPMethod.GET);
  }

  @Override public String answer(Request req, Response res, AuthStatus auth) throws EndpointException {    
    HTMLElem htmlBody = new HTMLElem("body");
    
    try {
      Event event = null;

      try {
        event = Event.getEvent(
            UUID.fromString(
                req.params("event")));
      } catch(IllegalArgumentException e) { }

      if(null == event)
        throw new EndpointException(req, "event not found", 404);

      htmlBody.push(
          new HTMLElem("h1")
              .push(event.getShortDescription()));
      
      HTMLElem volTable = new HTMLElem("table")
          .push(
              new HTMLElem("tr")
                  .push(
                      new HTMLElem("th")
                          .attr("colspan", TOTAL_COLS)
                          .push("Volunteers")));
      for(var volunteer : event.getVolunteers()) {
        List<HTMLElem> rows = new ArrayList<>();
        
        for(var detail : volunteer.getDetails().entrySet()) {
          rows.add(
              new HTMLElem("tr")
                  .push(
                      new HTMLElem("td")
                          .attr("colspan", DETAIL_COLSPAN)
                          .push(
                              String.format(
                                  "<strong>%1$s:</strong> %2$s",
                                  detail.getKey().getLabel(),
                                  detail.getValue()))));
        }

        rows.get(0).insert(
            0,
            new HTMLElem("td")
            .attr("colspan", VOLUNTEER_COLSPAN)
            .attr("rowspan", "" + (1 + rows.size()))
            .attr("class", "category")
            .push(volunteer.getName()));

        rows.add(
            new HTMLElem("td")
                .push("<br />"));

        for(var row : rows)
          volTable.push(row);
      }
      
      htmlBody.push(volTable);

      final SimpleDateFormat sdf = new SimpleDateFormat("MM/dd/yyyy hh:mm a");

      for(var window : event.getWindows()) {
        StringBuilder tsSB = new StringBuilder(
            sdf.format(
                window.getBeginTime()));
        if(null != window.getEndTime())
          tsSB.append(" - ").append(
              sdf.format(
                  window.getEndTime()));

        HTMLElem table = new HTMLElem("table")
            .push(
                new HTMLElem("tr")
                    .push(
                        new HTMLElem("th")
                            .attr("colspan", TOTAL_COLS)
                            .push(tsSB.toString())));

        for(var slot : window.getSlots()) {
          List<HTMLElem> rows = new ArrayList<>();

          for(var volunteer : slot.getRSVPs().values()) {
            rows.add(
                new HTMLElem("tr")
                    .push(
                        new HTMLElem("td")
                            .attr("colspan", RSVP_COLSPAN)
                            .push(volunteer.getName()),
                        new HTMLElem("td")
                            .attr("class", "checkbox")
                            .push("&#x2610;")));
          }
          
          var activity = event.getActivity(slot.getActivity());

          int activityRSVPCount = activity.countRSVPs();
          int activityRSVPCap = activity.getMaxActivityVolunteers();
          int slotRSVPCap = slot.getMaxSlotVolunteers();

          int remaining;

          if(0 != activityRSVPCap && (0 == slotRSVPCap || activityRSVPCap <= slotRSVPCap))
            remaining = activityRSVPCap - (activityRSVPCount > rows.size() ? rows.size() : activityRSVPCount);
          else if(0 != slotRSVPCap && (0 == activityRSVPCap || activityRSVPCap < slotRSVPCap))
            remaining = slotRSVPCap - rows.size();
          else
            remaining = ADDITIONAL_NOCAP_VOLUNTEERS;

          for(int i = 0; i < remaining; i++)
            rows.add(
                new HTMLElem("tr")
                    .push(
                        new HTMLElem("td")
                            .attr("colspan", RSVP_COLSPAN)
                            .push("<br /><hr />"),
                        new HTMLElem("td")
                            .attr("class", "checkbox")
                            .push("&#x2610;")));

          logger.debug(
              "slot at (a,w) = ({},{}) has description \"{}\"",
              activity.getID().toString(),
              slot.getWindow().toString(),
              activity.getShortDescription());
          
          rows.get(0).insert(
              0,
              new HTMLElem("td")
                  .attr("colspan", ACTIVITY_COLSPAN)
                  .attr("rowspan", "" + rows.size())
                  .attr("class", "category")
                  .push(activity.getShortDescription()));

          for(var row : rows)
            table.push(row);
        }

        htmlBody.push(table);
      }
      
    } catch(SQLException e) {
      throw new EndpointException(req, "database malfunction", 500, e);
    }

    String reportTemplate;
    try(Scanner scanner = new Scanner(
        YasssCore.class.getResourceAsStream("/public/report.html"), "UTF-8")) {
      reportTemplate = scanner.useDelimiter("\\A").next();
    }

    res.type("text/html");
    return reportTemplate.replace("{{ REPORT_BODY }}", htmlBody.toString());
  }

  @Override public AuthStatus authenticate(Request req, Response res) throws EndpointException {
    String authString = req.headers("Authorization");
    User user = null;

    try {
      AuthToken token = new AuthToken(authString);
      String nextSession = token.process();
      user = token.getUser();

      res.header(APIEndpoint.ACCOUNT_HEADER, user.getID().toString());
      res.header(APIEndpoint.SESSION_HEADER, nextSession);

      return new Authorization(true, true); // set up CAPTCHAS later
      
    } catch(AuthException e) {
      logger.error("authorization error: {}", e.getMessage());
    } catch(SQLException e) {
      logger.error(
          "database malfunction: {}",
          null == e.getMessage() ? "no further info available" : e.getMessage());
      throw new EndpointException(req, "internal server error", 500, e);
    }
    
    return new Authorization(false, true);
  }
  
}
