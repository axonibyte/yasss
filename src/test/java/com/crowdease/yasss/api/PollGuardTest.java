/*
 * Copyright (c) 2026 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.expectThrows;

import java.sql.Timestamp;
import java.util.UUID;

import com.axonibyte.lib.http.rest.EndpointException;
import com.crowdease.yasss.model.Poll;
import com.crowdease.yasss.model.User;
import com.crowdease.yasss.model.User.AccessLevel;

import org.testng.annotations.Test;

/**
 * The preamble every structural poll endpoint runs, and the order it runs in.
 *
 * <p>Eleven endpoints share this, so getting it wrong is wrong eleven times.
 * The order carries meaning beyond tidiness: telling a stranger that a poll has
 * closed is telling them something about a poll that is none of their business,
 * and it distinguishes a poll that exists from one that does not.
 *
 * @author Caleb L. Power
 */
public class PollGuardTest {

  private static User user(AccessLevel level) {
    return new User(UUID.randomUUID(), new byte[32], null, "u@example.com", null, level);
  }

  private static Poll poll(UUID admin, boolean closed) {
    Poll poll = new Poll(
        UUID.randomUUID(), admin, "Poll", "described",
        Poll.Scope.RELATIVE, new Timestamp(System.currentTimeMillis()), true);
    if(closed)
      poll.setResponseDeadline(new Timestamp(System.currentTimeMillis() - 60_000L));
    return poll;
  }

  private static int codeFrom(User actor, Poll poll) {
    EndpointException e = expectThrows(
        EndpointException.class,
        () -> PollGuard.checkEditable(new FakeRequest(), new Authorization(actor, true), poll));
    return e.getErrorCode();
  }

  /** The ordinary case: the organizer, on a poll that is still open. */
  @Test public void theOrganizerMayReshapeAnOpenPoll() throws Exception {
    User owner = user(AccessLevel.STANDARD);
    PollGuard.checkEditable(
        new FakeRequest(), new Authorization(owner, true), poll(owner.getID(), false));
  }

  /**
   * Closed stops the organizer too.
   *
   * <p>Reshaping a poll after it has closed moves squares people have already
   * voted on, at a point where they can no longer revise what they said.
   */
  @Test public void theOrganizerMayNotReshapeAClosedPoll() {
    User owner = user(AccessLevel.STANDARD);
    assertEquals(codeFrom(owner, poll(owner.getID(), true)), 412);
  }

  /**
   * A stranger is refused before closure is ever mentioned.
   *
   * <p>This is the case the ordering exists for. Answering 412 here would
   * confirm that the poll exists and tell them something about its state.
   */
  @Test public void aStrangerIsRefusedBeforeClosureIsMentioned() {
    assertEquals(codeFrom(user(AccessLevel.STANDARD), poll(UUID.randomUUID(), true)), 403);
    assertEquals(codeFrom(user(AccessLevel.STANDARD), poll(UUID.randomUUID(), false)), 403);
  }

  /** An anonymous poll is reshaped by platform admins and nobody else. */
  @Test public void anAnonymousPollIsAdminOnly() {
    assertEquals(codeFrom(user(AccessLevel.STANDARD), poll(null, false)), 403);
  }

  /** Staff keep the closed exemption, so a closed poll can still be repaired. */
  @Test public void staffMayReshapeAClosedPoll() throws Exception {
    PollGuard.checkEditable(
        new FakeRequest(),
        new Authorization(user(AccessLevel.ADMIN), true),
        poll(UUID.randomUUID(), true));
  }
}
