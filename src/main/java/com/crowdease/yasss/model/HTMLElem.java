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
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public class HTMLElem {
  
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
              " %1$s=\"%2$s\"",
              attr.getKey(),
              attr.getValue()));
    
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
