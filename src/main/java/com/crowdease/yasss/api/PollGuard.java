/*
 * Copyright (c) 2026 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import java.sql.SQLException;

import com.axonibyte.lib.http.rest.EndpointException;
import com.crowdease.yasss.model.Poll;
import com.crowdease.yasss.model.User.AccessLevel;

import spark.Request;

/**
 * The three checks every structural poll endpoint makes, in the order they must
 * be made.
 *
 * <p>Eleven endpoints repeat this preamble. Written out eleven times it is
 * eleven chances to get the order wrong -- and the order carries meaning: a
 * caller who may not touch this poll at all should be told 403 rather than
 * having the shape of the poll leak through a 412.
 *
 * @author Caleb L. Power &lt;cpower&#64;crowdease.com&gt;
 */
final class PollGuard {

  private PollGuard() { }

  /**
   * Resolves the {@code :poll} parameter and checks the caller may change it.
   *
   * @param req the {@link Request}
   * @param auth the caller's {@link Authorization}
   * @return the {@link Poll}
   * @throws EndpointException 404 if there is no such poll, 403 if the caller
   *         does not administer it, 412 if it has closed
   * @throws SQLException if a database malfunction occurs
   */
  static Poll editable(Request req, Authorization auth) throws EndpointException, SQLException {
    Poll poll = resolve(req);

    if(!auth.atLeast(poll))
      throw new EndpointException(req, "access denied", 403);

    // Mirrors the expiry gate on every event mutation. Reshaping a poll after
    // it has closed would move squares that people have already voted on,
    // changing what their answer said after they can no longer revise it.
    //
    // Note that ModifyPollEndpoint deliberately does NOT call this: the
    // deadline lives there, and a closed poll that could not be edited would be
    // one nobody could ever reopen.
    if(!auth.atLeast(AccessLevel.ADMIN) && poll.isClosed())
      throw new EndpointException(req, "poll closed", 412);

    return poll;
  }

  /**
   * Resolves the {@code :poll} parameter.
   *
   * @param req the {@link Request}
   * @return the {@link Poll}
   * @throws EndpointException 404 if there is no such poll
   * @throws SQLException if a database malfunction occurs
   */
  static Poll resolve(Request req) throws EndpointException, SQLException {
    Poll poll = null;
    try {
      poll = APIEndpoint.resolvePoll(req.params("poll"));
    } catch(IllegalArgumentException e) { }

    if(null == poll)
      throw new EndpointException(req, "poll not found", 404);

    return poll;
  }
}
