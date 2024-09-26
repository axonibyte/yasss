/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Objects;
import java.util.UUID;
import java.util.regex.Pattern;

import com.axonibyte.lib.db.SQLBuilder;
import com.crowdease.yasss.YasssCore;

public class Detail implements Comparable<Detail> {
  
  public static enum Type {
    STRING(".*"),
    BOOLEAN("^(true|false)"),
    INTEGER("\\d+(\\.\\d{0,9})?"),
    EMAIL(
        "[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"),
    PHONE("(\\+?( |-|\\.)?\\d{1,2}( |-|\\.)?)?(\\(?\\d{3}\\)?|\\d{3})( |-|\\.)?(\\d{3}( |-|\\.)?\\d{4})");
    
    private final Pattern pattern;
    
    private Type(String exp) {
      this.pattern = Pattern.compile(exp);
    }
    
    public boolean isValid(String candidate) {
      return pattern.matcher(candidate).matches();
    }
  }
  
  private UUID id;
  private UUID event;
  private Type type;
  private String label;
  private String hint;
  private int priority;
  private boolean required;
  
  public Detail(UUID id, UUID event, Type type, String label, String hint, int priority, boolean required) {
    this.id = id;
    this.event = event;
    this.type = type;
    this.label = label;
    this.hint = hint;
    this.priority = priority;
    this.required = required;
  }
  
  public UUID getID() {
    return id;
  }
  
  public UUID getEvent() {
    return event;
  }
  
  public Detail setEvent(UUID event) {
    this.event = event;
    return this;
  }
  
  public Type getType() {
    return type;
  }
  
  public Detail setType(Type type) {
    this.type = type;
    return this;
  }
  
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
  
  public boolean isValid(String candidate) {
    if(required && (null == candidate || candidate.isBlank()))
      return false;
    return type.isValid(candidate);
  }
  
  public void commit() throws SQLException {
    Connection con = null;
    PreparedStatement stmt = null;
    
    try {
      con = YasssCore.getDB().connect();
      
      if(null == id) {
        ResultSet res = null;
        stmt = con.prepareStatement(
            new SQLBuilder()
                .select(
                    YasssCore.getDB().getPrefix() + "detail",
                    "id")
                .where("id")
                .toString());
        
        boolean found;
        do {
          id = UUID.randomUUID();
          stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
          res = stmt.executeQuery();
          found = res.next();
          YasssCore.getDB().close(null, null, res);
        } while(found);
        
        YasssCore.getDB().close(null, stmt, null);
      }
      
      stmt = con.prepareStatement(
          new SQLBuilder()
              .update(
                  YasssCore.getDB().getPrefix() + "detail",
                  "event",
                  "detail_type",
                  "label",
                  "hint",
                  "priority",
                  "required")
              .where("id")
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(event));
      stmt.setInt(2, type.ordinal());
      stmt.setString(3, label);
      stmt.setString(4, hint);
      stmt.setInt(5, priority);
      stmt.setBoolean(6, required);
      stmt.setBytes(7, SQLBuilder.uuidToBytes(id));
      
      if(0 == stmt.executeUpdate()) {
        YasssCore.getDB().close(null, stmt, null);
        stmt = con.prepareStatement(
            new SQLBuilder()
                .insert(
                    YasssCore.getDB().getPrefix() + "detail",
                    "id",
                    "event",
                    "detail_type",
                    "label",
                    "hint",
                    "priority",
                    "required")
                .toString());
        stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
        stmt.setBytes(2, SQLBuilder.uuidToBytes(event));
        stmt.setInt(3, type.ordinal());
        stmt.setString(4, label);
        stmt.setString(5, hint);
        stmt.setInt(6, priority);
        stmt.setBoolean(7, required);
        stmt.executeUpdate();
      }
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }
  
  public void delete() throws SQLException {
    if(null == id) return;
    
    Connection con = null;
    PreparedStatement stmt = null;
    
    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .delete(
                  YasssCore.getDB().getPrefix() + "detail")
              .where("id")
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(id));
      stmt.executeUpdate();
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
  }
  
  @Override public int compareTo(Detail detail) {
    Objects.requireNonNull(detail);
    int c;
    return 0 == (c = Integer.compare(priority, detail.priority))
        ? label.compareToIgnoreCase(detail.label)
        : c;
  }
  
}
