/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import java.sql.SQLException;
import java.util.regex.Pattern;

public class Detail {

  public static enum Type {
    STRING(".*"),
    BOOLEAN("^(true|false)"),
    INTEGER("\\d+(\\.\\d{0,9})?"),
    EMAIL("[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"),
    PHONE("(\\+?( |-|\\.)?\\d{1,2}( |-|\\.)?)?(\\(?\\d{3}\\)?|\\d{3})( |-|\\.)?(\\d{3}( |-|\\.)?\\d{4})");

    private final Pattern pattern;

    private Type(String exp) {
      this.pattern = Pattern.compile(exp);
    }

    public boolean isValid(String candidate) {
      return pattern.matcher(candidate).matches();
    }
  }

  private String label;
  private String hint;
  private int priority;
  private boolean required;

  public String getLabel() {
    return label;
  }

  public Detail setLabel(String label) {
    this.label = label;
    return this;
  }

  public String getHint() {
    return hint;
  }

  public Detail setHint(String hint) {
    this.hint = hint;
    return this;
  }

  public int getPriority() {
    return priority;
  }

  public Detail setPriority(int priority) {
    this.priority = priority;
    return this;
  }

  public boolean isRequired() {
    return required;
  }

  public Detail setRequired(boolean required) {
    this.required = required;
    return this;
  }

  public void commit() throws SQLException {
  }

  public void delete() throws SQLException {
  }
  
}
