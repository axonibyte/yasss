/*
 * Copyright (c) 2026 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertTrue;

import java.lang.reflect.Field;
import java.util.Arrays;
import java.util.List;

import org.testng.annotations.Test;

/**
 * Guards the positional binding in {@code User.commit()}.
 *
 * <p>{@code commit} binds by index against a column list written out separately, so adding
 * a column means renumbering the {@code WHERE id} parameter in the UPDATE and appending one
 * to the INSERT. Getting that wrong writes a UUID into whichever column now occupies the
 * old index — silently, with no exception, corrupting every row it touches.
 *
 * <p>That is the highest-probability accidental damage in the passkey work, because
 * {@code password_login_disabled} is the second column added to this table in as many
 * changes. This cannot check the bind indices directly without a database, but it can
 * check the thing that has to move in step with them.
 *
 * @author Caleb L. Power
 */
public class UserColumnBindingTest {

  private static List<String> columns() throws Exception {
    Field f = User.class.getDeclaredField("COLUMNS");
    f.setAccessible(true);
    return Arrays.asList((String[])f.get(null));
  }

  @Test public void everyPersistedColumnIsListed() throws Exception {
    var columns = columns();

    // `id` is bound separately -- it is the WHERE in the UPDATE and the first value in the
    // INSERT -- so the count of the rest is what the other binds have to match.
    assertTrue(columns.contains("id"));
    assertEquals(columns.get(0), "id", "id must lead, because the INSERT binds it first");

    for(String required : new String[] {
        "pubkey", "mfakey", "email", "pending_email", "access_level", "verify_token",
        "verify_token_expires", "session_epoch", "reset_token", "reset_token_expires",
        "password_login_disabled" })
      assertTrue(columns.contains(required), required + " is missing from COLUMNS");
  }

  @Test public void theColumnCountIsPinned() throws Exception {
    // Twelve: id plus eleven values. If this fails, commit()'s two statements need their
    // bind indices checked by hand -- which is the entire point of the test existing.
    assertEquals(
        columns().size(),
        12,
        "COLUMNS changed; re-check every setXxx index in User.commit(), including the "
        + "WHERE id bind in the UPDATE");
  }

  @Test public void thereAreNoDuplicates() throws Exception {
    var columns = columns();
    assertEquals(
        columns.size(),
        columns.stream().distinct().count(),
        "a duplicated column would silently shift every bind after it");
  }
}
