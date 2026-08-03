/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import java.sql.SQLException;
import java.text.SimpleDateFormat;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;
import java.util.UUID;

/**
 * Renders a volunteer's signup as HTML fragments for email.
 *
 * <p>Extracted from {@code AddVolunteerEndpoint}, which built these inline for
 * the organiser's signup alert. The reminder daemon needs the same fragments,
 * and two copies of this logic would drift.
 *
 * <p>The interesting half is deliberately pure. The overload taking collections
 * has no I/O and is therefore testable; the convenience overload gathers from
 * the database and delegates to it.
 *
 * @author Caleb L. Power
 */
public final class VolunteerSummary {

  private VolunteerSummary() { }

  /**
   * The date format used throughout the mail templates.
   *
   * <p>Deliberately constructed per call rather than held in a static field:
   * {@link SimpleDateFormat} is not thread-safe, and this class is shared
   * between Spark's request threads and the reminder daemon. Hoisting it during
   * an otherwise-innocent cleanup would introduce an intermittent corruption
   * bug that is very hard to attribute.
   *
   * @param timezone the event's IANA zone, or {@code null} for the server's
   * @return a fresh formatter
   */
  private static SimpleDateFormat formatter(String timezone) {
    SimpleDateFormat sdf = new SimpleDateFormat("MM/dd/yyyy hh:mm a");
    if(null != timezone) sdf.setTimeZone(TimeZone.getTimeZone(timezone));
    return sdf;
  }

  /**
   * Renders the volunteer's answers to an event's custom fields.
   *
   * @param volunteer the {@link Volunteer}
   * @return an HTML {@code <ul>}, empty if they answered nothing
   */
  public static String detailList(Volunteer volunteer) {
    HTMLElem list = new HTMLElem("ul");
    for(var detail : volunteer.getDetails().entrySet())
      list.push(
          new HTMLElem("li")
              .push(
                  String.format(
                      "<strong>%1$s</strong>: %2$s",
                      detail.getKey().getLabel(),
                      detail.getValue())));
    return list.toString();
  }

  /**
   * Renders the slots a volunteer has claimed, grouped by activity.
   *
   * <p>The pure half: everything it needs is passed in, so it can be tested
   * without a database.
   *
   * @param activities the event's activities, in display order
   * @param windows the event's windows, in display order
   * @param claimed activity id to the window ids claimed under it
   * @param timezone the event's IANA zone, or {@code null} to use the server's
   * @return an HTML {@code <ul>} of activities, each with its own list of times
   */
  public static String rsvpList(
      Collection<Activity> activities,
      Collection<Window> windows,
      Map<UUID, Set<UUID>> claimed,
      String timezone) {
    HTMLElem list = new HTMLElem("ul");
    if(claimed.isEmpty()) return list.toString();

    final SimpleDateFormat sdf = formatter(timezone);

    for(var activity : activities) {
      if(!claimed.containsKey(activity.getID())) continue;

      HTMLElem windowList = new HTMLElem("ul");
      for(var window : windows) {
        if(!claimed.get(activity.getID()).contains(window.getID())) continue;
        windowList.push(
            new HTMLElem("li")
                .push(
                    sdf.format(
                        window.getBeginTime())));
      }

      list.push(
          new HTMLElem("li")
              .push(activity.getShortDescription())
              .push(windowList));
    }

    return list.toString();
  }

  /**
   * Renders the slots a volunteer has claimed, gathering what it needs.
   *
   * @param event the {@link Event} they signed up for
   * @param volunteer the {@link Volunteer}
   * @return an HTML {@code <ul>}
   * @throws SQLException if a database malfunction occurs
   */
  public static String rsvpList(Event event, Volunteer volunteer) throws SQLException {
    Map<UUID, Set<UUID>> claimed = new HashMap<>();
    for(RSVP rsvp : volunteer.getRSVPS()) {
      if(!claimed.containsKey(rsvp.getActivity()))
        claimed.put(rsvp.getActivity(), new HashSet<>());
      claimed.get(rsvp.getActivity()).add(rsvp.getWindow());
    }

    return rsvpList(
        event.getActivities(), event.getWindows(), claimed, event.getTimezone());
  }

  /**
   * Formats an event's start time for a mail body.
   *
   * <p>Rendered in the <em>event's</em> zone rather than the recipient's: for a
   * physical event, a shift that starts at 9am starts at 9am where the event is,
   * whoever happens to be reading. An event with no recorded zone falls back to
   * the server's, which is what every email did before zones existed.
   *
   * <p>The zone name is appended either way, so the time is never ambiguous.
   *
   * @param when the timestamp
   * @param timezone the event's IANA zone, or {@code null} for the server's
   * @return the formatted date
   */
  public static String eventDate(java.util.Date when, String timezone) {
    SimpleDateFormat sdf = new SimpleDateFormat("MM/dd/yyyy hh:mm a z");
    if(null != timezone) sdf.setTimeZone(TimeZone.getTimeZone(timezone));
    return sdf.format(when);
  }
}
