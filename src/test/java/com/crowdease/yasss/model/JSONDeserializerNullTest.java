/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertTrue;

import com.crowdease.yasss.model.JSONDeserializer.DeserializationException;

import org.testng.annotations.Test;

/**
 * Covers telling "clear this" apart from "leave this alone".
 *
 * <p>An event's timezone and reminder lead time are both nullable in the schema
 * and both offer a "use the default" choice in the interface. Neither could be
 * cleared, because {@code org.json} represents a JSON null as
 * {@link org.json.JSONObject#NULL} rather than a Java null: {@code has} answered
 * true, every typed getter then failed its cast, and the request came back a
 * 400. So the client omitted the key instead, the select moved, and a reload put
 * it back.
 *
 * @author Caleb L. Power
 */
public class JSONDeserializerNullTest {

  private static JSONDeserializer of(String body) throws DeserializationException {
    return new JSONDeserializer(body)
        .tokenize("timezone", false)
        .tokenize("reminderLeadTime", false)
        .check();
  }

  @Test public void explicitNull_isPresentAndNull() throws DeserializationException {
    var d = of("{\"timezone\":null}");
    // Both, and that is the point: the key *was* supplied, so "did they mention
    // it" and "what did they say" are genuinely different questions.
    assertTrue(d.has("timezone"), "an explicit null is still a supplied key");
    assertTrue(d.isNull("timezone"));
  }

  @Test public void absentKey_isNeither() throws DeserializationException {
    var d = of("{}");
    assertFalse(d.has("timezone"));
    assertFalse(d.isNull("timezone"), "an absent key must not read as a clear");
  }

  @Test public void aRealValue_isPresentAndNotNull() throws DeserializationException {
    var d = of("{\"timezone\":\"America/Chicago\"}");
    assertTrue(d.has("timezone"));
    assertFalse(d.isNull("timezone"));
  }

  @Test public void worksForNumbersToo() throws DeserializationException {
    var d = of("{\"reminderLeadTime\":null}");
    assertTrue(d.has("reminderLeadTime"));
    assertTrue(d.isNull("reminderLeadTime"));

    var set = of("{\"reminderLeadTime\":120}");
    assertFalse(set.isNull("reminderLeadTime"));
  }

  @Test public void anUnregisteredTokenIsFalseRatherThanFatal()
      throws DeserializationException {
    // `get` throws for a token nobody tokenized. `has` already swallows that;
    // `isNull` must match it, or the two would disagree about the same key.
    var d = of("{}");
    assertFalse(d.has("nonsense"));
    assertFalse(d.isNull("nonsense"));
  }
}
