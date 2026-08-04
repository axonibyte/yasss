/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Represents a simple HTML element.
 *
 * <p>Callers push two very different kinds of thing into an element: literal
 * markup they wrote themselves ({@code "<br />"}, {@code "&#x2610;"}, a nested
 * {@link HTMLElem}) and text that came from a user. Only the second needs
 * escaping, and this class cannot tell them apart on its own -- so text goes in
 * through {@link #text(String)}, which marks it as text by construction.
 * Attribute values are escaped unconditionally, since there is no legitimate
 * reason to inject markup into one.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public class HTMLElem {

  /**
   * Escapes a string for use as element content or in a double-quoted
   * attribute value.
   *
   * <p>The ampersand is replaced first; doing it last would re-escape the
   * ampersands the other replacements just introduced.
   *
   * @param raw the text to escape, which may be {@code null}
   * @return the escaped text, or an empty string if {@code raw} was null
   */
  public static String escape(String raw) {
    if(null == raw) return "";
    return raw
      .replace("&", "&amp;")
      .replace("<", "&lt;")
      .replace(">", "&gt;")
      .replace("\"", "&quot;")
      .replace("'", "&#39;");
  }

  /**
   * Wraps user-supplied text so that it can be pushed into an element without
   * being read as markup.
   *
   * <p>This exists because {@link #push(Object...)} cannot escape
   * unconditionally -- several call sites deliberately push literal markup --
   * and an escaping method that has to be remembered at every call site is one
   * that will eventually be forgotten. A value that arrives as
   * {@code HTMLElem.text(...)} is safe wherever it ends up.
   *
   * @param raw the text, which may be {@code null}
   * @return an object whose {@code toString} is the escaped text
   */
  public static Object text(String raw) {
    final String escaped = escape(raw);
    return new Object() {
      @Override public String toString() {
        return escaped;
      }
    };
  }

  private List<Object> vals = new ArrayList<>();
  private Map<String, String> attrs = new HashMap<>();
  private String tagName = null;

  /**
   * Instantiates the HTML element.
   *
   * @param tagName the name of the tag (no angle brackets pls)
   */
  public HTMLElem(String tagName) {
    this.tagName = tagName;
  }

  /**
   * A key-value attribute to include within the angle brackets of this HTML element.
   *
   * @param key the attribute's key
   * @param value the attribute's value (without quotes)
   * @return this {@link HTMLElem} instance
   */
  public HTMLElem attr(String key, String val) {
    this.attrs.put(key, val);
    return this;
  }

  /**
   * Adds one or more values to the end of the element, just before the closing
   * tag.
   *
   * @param vals a varargs array of values (which can be other elements) to
   *        include within this element
   * @return this {@link HTMLElem} instance
   */
  public HTMLElem push(Object... vals) {
    for(var val : vals)
      this.vals.add(val);
    return this;
  }

  /**
   * Inserts a value into the list of element values at a particular index.
   *
   * @param val the value (which can be another element) to insert
   * @return this {@link HTMLElem} instance
   */
  public HTMLElem insert(int idx, Object val) {
    this.vals.add(idx, val);
    return this;
  }

  /**
   * {@inheritDoc}
   */
  @Override public String toString() {
    StringBuilder attrSB = new StringBuilder();
    for(var attr : attrs.entrySet())
      attrSB.append(
          String.format(
              // Unconditional: every value passed here today is a constant, so
              // this changes no output, and it means an attribute can never
              // become an injection point if that stops being true.
              " %1$s=\"%2$s\"",
              attr.getKey(),
              escape(attr.getValue())));
    
    StringBuilder valSB = new StringBuilder();
    for(var val : vals)
      valSB.append(val.toString());
    
    return String.format(
        "<%1$s%2$s>%3$s</%1$s>",
        tagName,
        attrSB.toString(),
        valSB.toString());
  }
  
}
