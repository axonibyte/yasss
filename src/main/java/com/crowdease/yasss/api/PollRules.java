/*
 * Copyright (c) 2026 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import com.axonibyte.lib.http.rest.EndpointException;
import com.crowdease.yasss.model.Poll;

import spark.Request;

/**
 * The settings a poll cannot sensibly hold at the same time.
 *
 * <p>Separate from the endpoints because create and modify must agree exactly.
 * A rule enforced on creation and forgotten on edit is a rule that anyone can
 * step around by making the poll twice, and it would be enforced in the place
 * least likely to be read.
 *
 * @author Caleb L. Power &lt;cpower@crowdease.com&gt;
 */
final class PollRules {

  private PollRules() { }

  /**
   * Checks a poll's settings against each other.
   *
   * <p>These are not field validations -- every value here is individually fine
   * -- they are combinations that would publish a poll into a state where it
   * cannot do what it says. A poll whose results are promised "after the
   * deadline" and which has no deadline never shows anybody anything, and
   * nothing about it looks wrong until somebody waits for results that are not
   * coming.
   *
   * @param req the {@link Request}
   * @param poll the {@link Poll} as it would be saved
   * @throws EndpointException with a 400 naming the missing piece
   */
  static void validate(Request req, Poll poll) throws EndpointException {
    // A zone is exactly what ZONED means, and exactly what WALL_CLOCK does not.
    // Storing one under wall clock would be a value nothing reads, and the next
    // person to look would reasonably assume it was in force.
    if(Poll.TimeMode.ZONED == poll.getTimeMode() && null == poll.getTimezone())
      throw new EndpointException(req, "missing argument (timezone) for a zoned poll", 400);
    if(Poll.TimeMode.WALL_CLOCK == poll.getTimeMode() && null != poll.getTimezone())
      throw new EndpointException(
          req, "unexpected argument (timezone) for a wall-clock poll", 400);

    // "After the close" needs a close. A relative poll has no dates that could
    // pass, so without a deadline there is no such moment, ever.
    if(poll.requiresDeadline() && null == poll.getResponseDeadline())
      throw new EndpointException(
          req,
          "missing argument (responseDeadline) for this resultVisibility",
          400);

    // Only the organizer may see the results, and an anonymous poll has no
    // organizer -- so this combination hides the results from everybody
    // including the person who ran it.
    if(Poll.ResultVisibility.CREATOR_ONLY == poll.getResultVisibility() && null == poll.getAdmin())
      throw new EndpointException(
          req,
          "resultVisibility CREATOR_ONLY requires a signed-in creator",
          400);
  }
}
