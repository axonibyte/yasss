/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import com.crowdease.yasss.model.Volunteer.ReminderState;

/**
 * Decides which address a volunteer's reminders go to, and whether that address
 * still needs confirming.
 *
 * <p>Shared by {@code AddVolunteerEndpoint} and {@code ModifyVolunteerEndpoint}
 * so the two cannot drift: consent rules that differ between create and update
 * are how a platform ends up mailing addresses nobody agreed to.
 *
 * <p>Deliberately pure -- it returns a verdict and never throws. {@code
 * EndpointException}'s constructor dereferences the Spark request, which would
 * make this untestable, and these rules are exactly the part worth testing.
 *
 * @author Caleb L. Power
 */
public final class ReminderConsent {

  private ReminderConsent() { }

  /**
   * The outcome of resolving consent.
   *
   * <p>Exactly one of {@code error} and {@code email} is ever non-null.
   *
   * @param email the address to send to
   * @param state the consent state that address should now carry
   * @param error a message the caller should answer 400 with
   */
  public static record Decision(String email, ReminderState state, String error) { }

  /**
   * Resolves the address and consent state for a volunteer opting in.
   *
   * <p>Four rules, each earned:
   *
   * <ul>
   *   <li>a signed-in volunteer who names no address gets their account's,
   *       because asking someone to retype an address the platform already holds
   *       is friction for nothing;
   *   <li>an address that <em>is</em> the volunteer's verified account address is
   *       pre-confirmed -- it has already been proven, and re-proving it would
   *       mean a confirmation email nobody expects;
   *   <li>an address already confirmed on this same volunteer stays confirmed,
   *       so editing an unrelated field does not silently unsubscribe someone
   *       until they re-click a link;
   *   <li>anything else is {@link ReminderState#PENDING} and earns a
   *       confirmation email. That includes changing to a different address,
   *       which must be re-proven.
   * </ul>
   *
   * @param requestedEmail the address in the request, or {@code null}
   * @param accountEmail the signed-in account's address, or {@code null}
   * @param accountVerified whether that account is at least verified
   * @param currentEmail the address already on the volunteer, or {@code null}
   * @param currentState the consent state already on the volunteer
   * @return the {@link Decision}
   */
  public static Decision resolve(
      String requestedEmail,
      String accountEmail,
      boolean accountVerified,
      String currentEmail,
      ReminderState currentState) {

    String email = null == requestedEmail || requestedEmail.isBlank()
        ? null
        : requestedEmail.strip().toLowerCase();

    if(null == email && accountVerified && null != accountEmail)
      email = accountEmail.strip().toLowerCase();

    if(null == email)
      return new Decision(null, null, "missing argument (reminderEmail)");
    // 255 is the width of volunteer.reminder_email; a longer address would be
    // silently truncated into a different address by the INSERT.
    if(255 < email.length() || !Detail.Type.EMAIL.isValid(email))
      return new Decision(null, null, "malformed argument (reminderEmail)");

    boolean isAccountAddress = accountVerified
        && null != accountEmail
        && email.equalsIgnoreCase(accountEmail.strip());

    boolean alreadyConfirmed = ReminderState.CONFIRMED == currentState
        && null != currentEmail
        && email.equalsIgnoreCase(currentEmail.strip());

    return new Decision(
        email,
        isAccountAddress || alreadyConfirmed
            ? ReminderState.CONFIRMED
            : ReminderState.PENDING,
        null);
  }
}
