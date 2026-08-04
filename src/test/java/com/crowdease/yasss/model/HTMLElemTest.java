/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertTrue;

import org.testng.annotations.Test;

/**
 * Markup escaping.
 *
 * <p>{@link HTMLElem} builds two HTML surfaces that render user-supplied text:
 * the organiser's printable report, served as {@code text/html} from the same
 * origin as the app, and every templated email. Both interpolated with
 * {@code String.format} and escaped nothing, so a volunteer could choose their
 * own name and have it executed in the organiser's browser.
 *
 * <p>The distinction this class draws is the load-bearing one:
 * {@code push} must <em>not</em> escape, because several callers deliberately
 * push literal markup, while {@link HTMLElem#text(String)} always must.
 *
 * @author Caleb L. Power
 */
public class HTMLElemTest {

  private static final String XSS = "<img src=x onerror=\"alert('h')\">";

  @Test public void escapesTheFiveDangerousCharacters() {
    assertEquals(
        HTMLElem.escape("<a href=\"x\">O'Brien & Co</a>"),
        "&lt;a href=&quot;x&quot;&gt;O&#39;Brien &amp; Co&lt;/a&gt;");
  }

  /**
   * The ampersand has to go first. Replacing it last would re-escape the
   * ampersands the other four replacements had just introduced, so
   * {@code <} would render as {@code &amp;lt;} -- visible as literal
   * {@code &lt;} on the page.
   */
  @Test public void escapesAmpersandsBeforeTheEntitiesItIntroduces() {
    assertEquals(HTMLElem.escape("<"), "&lt;");
    assertEquals(HTMLElem.escape("&lt;"), "&amp;lt;");
  }

  @Test public void treatsNullAsEmpty() {
    assertEquals(HTMLElem.escape(null), "");
    assertEquals(HTMLElem.text(null).toString(), "");
  }

  @Test public void leavesOrdinaryTextAlone() {
    assertEquals(HTMLElem.escape("Setup crew, 8am"), "Setup crew, 8am");
  }

  /** Non-ASCII is not escaped: the document is UTF-8 and these are safe. */
  @Test public void leavesNonAsciiAlone() {
    assertEquals(HTMLElem.escape("日本語 🎉 مرحبا"), "日本語 🎉 مرحبا");
  }

  @Test public void textNodesAreEscapedWhereverTheyEndUp() {
    String html = new HTMLElem("td").push(HTMLElem.text(XSS)).toString();
    assertFalse(html.contains("<img"), html);
    assertTrue(html.contains("&lt;img"), html);
  }

  /**
   * The counterpart, and the reason {@code push} cannot simply escape
   * everything: callers pass literal markup through it on purpose.
   */
  @Test public void pushKeepsLiteralMarkupIntact() {
    assertEquals(new HTMLElem("td").push("<br />").toString(), "<td><br /></td>");
    assertEquals(new HTMLElem("td").push("&#x2610;").toString(), "<td>&#x2610;</td>");
  }

  @Test public void nestedElementsStillRender() {
    String html = new HTMLElem("li")
        .push(new HTMLElem("strong").push(HTMLElem.text("Shirt size:")), HTMLElem.text(" L"))
        .toString();
    assertEquals(html, "<li><strong>Shirt size:</strong> L</li>");
  }

  /**
   * Attribute values are escaped unconditionally. Every value passed today is
   * a constant, so this changes no output -- it is there so that an attribute
   * can never become an injection point if that stops being true.
   */
  @Test public void escapesAttributeValues() {
    String html = new HTMLElem("td").attr("class", "a\" onmouseover=\"alert(1)").toString();
    assertFalse(html.contains("onmouseover=\""), html);
    assertTrue(html.contains("&quot;"), html);
  }

  @Test public void ordinaryAttributesAreUnaffected() {
    assertEquals(
        new HTMLElem("td").attr("colspan", "2").toString(),
        "<td colspan=\"2\"></td>");
  }
}
