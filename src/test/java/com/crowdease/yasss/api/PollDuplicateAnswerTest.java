/*
 * Copyright (c) 2026 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import static org.easymock.EasyMock.createMock;
import static org.easymock.EasyMock.eq;
import static org.easymock.EasyMock.expect;
import static org.easymock.EasyMock.isNull;
import static org.easymock.EasyMock.replay;
import static org.easymock.EasyMock.same;
import static org.easymock.EasyMock.verify;
import static org.testng.Assert.assertEquals;

import java.sql.Connection;
import java.util.UUID;

import com.crowdease.yasss.model.Poll;

import org.testng.annotations.Test;

/**
 * Which identity a single-answer poll matches on.
 *
 * <p>The requirement has two halves and they pull in opposite directions, which
 * is why it is worth pinning rather than reading:
 *
 * <ul>
 *   <li>a signed-in respondent is matched on their account and nothing else, so
 *       they are never turned away because a flatmate answered from this
 *       browser or a colleague answered from this office;
 *   <li>their fingerprint is recorded anyway, so answering and then signing out
 *       does not buy a second vote.
 * </ul>
 *
 * <p>The second half is what makes the obvious optimisation wrong: skipping the
 * fingerprint when the caller is authenticated looks like dead work and removes
 * half the feature. These tests assert the <em>read</em> side, which is where
 * the two halves could silently converge; the write side is unconditional in
 * {@code AddPollResponseEndpoint} and has no branch to get wrong.
 *
 * @author Caleb L. Power
 */
public class PollDuplicateAnswerTest {

  private static final String IP = "2001:db8::1";
  private static final byte[] FINGERPRINT = new byte[32];

  /**
   * Signed in: the account is the only thing consulted.
   *
   * <p>Both the address and the fingerprint are supplied and both must be
   * ignored -- a test that passed nulls for them could not tell the difference
   * between "not consulted" and "nothing to consult".
   */
  @Test public void aSignedInCallerIsMatchedOnTheirAccountAlone() throws Exception {
    Poll poll = createMock(Poll.class);
    Connection con = createMock(Connection.class);
    UUID actor = UUID.randomUUID();

    expect(poll.countResponses(same(con), eq(actor), isNull(), isNull())).andReturn(1);
    replay(poll);

    assertEquals(PollAnswers.countExisting(poll, con, actor, IP, FINGERPRINT), 1);
    verify(poll);
  }

  /**
   * Anonymous: the address and the fingerprint, and the account is not
   * consulted because there is not one.
   */
  @Test public void ananonymousCallerIsMatchedOnAddressAndFingerprint() throws Exception {
    Poll poll = createMock(Poll.class);
    Connection con = createMock(Connection.class);

    expect(poll.countResponses(same(con), isNull(), eq(IP), same(FINGERPRINT))).andReturn(0);
    replay(poll);

    assertEquals(PollAnswers.countExisting(poll, con, null, IP, FINGERPRINT), 0);
    verify(poll);
  }

  /**
   * A browser that produced no digest is still matched on its address.
   *
   * <p>A hardened profile refusing a canvas read is a person, not an attack, and
   * they must still be able to answer -- so the fingerprint travels as null and
   * the address carries the check on its own.
   */
  @Test public void aCallerWithNoFingerprintIsStillMatchedOnAddress() throws Exception {
    Poll poll = createMock(Poll.class);
    Connection con = createMock(Connection.class);

    expect(poll.countResponses(same(con), isNull(), eq(IP), isNull())).andReturn(1);
    replay(poll);

    assertEquals(PollAnswers.countExisting(poll, con, null, IP, null), 1);
    verify(poll);
  }
}
