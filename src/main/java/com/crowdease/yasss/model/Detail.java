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

/**
 * Modals a detail that a volunteer has (or optionally, must) fill out as it
 * pertains to a particular {@link Event}.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public class Detail implements Comparable<Detail> {

  /**
   * Datatypes that are accepted for details.
   *
   * @author Caleb L. Power <cpower@crowdease.com>
   */
  public static enum Type {

    /**
     * A standard string type.
     *
     * <p>{@code (?s)} rather than a bare {@code .*}: Java's {@code .} does not
     * match a line terminator unless DOTALL is on, so the type that means "any
     * string" was rejecting any answer containing a newline with a 400 -- while
     * the event title, the activity label and every other free-text field
     * accepted one happily. A pasted multi-line answer is the ordinary way to
     * hit it.
     */
    STRING("(?s).*"),

    /**
     * A standard boolean (e.g. `true` or `false`).
     */
    BOOLEAN("^(true|false)"),

    /**
     * Some non-negative integer.
     */
    INTEGER("\\d+(\\.\\d{0,9})?"),

    /**
     * An email address.
     */
    EMAIL(
        "[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"),

    /**
     * A phone number.
     */
    PHONE("(\\+?( |-|\\.)?\\d{1,2}( |-|\\.)?)?(\\(?\\d{3}\\)?|\\d{3})( |-|\\.)?(\\d{3}( |-|\\.)?\\d{4})");
    
    private final Pattern pattern;
    
    private Type(String exp) {
      this.pattern = Pattern.compile(exp);
    }

    /**
     * Determines whether or not the candidate is appropriate for the {@link Type}.
     *
     * @return {@code true} iff the candidate matches the type's regular expression
     */
    public boolean isValid(String candidate) {
      return pattern.matcher(candidate).matches();
    }

    /**
     * Puts a candidate into the form this type stores and validates.
     *
     * <p>Only {@link #EMAIL} does anything: its pattern is lowercase-only,
     * mirroring a Java pattern compiled without {@code CASE_INSENSITIVE}, so
     * validating a raw answer rejected every address with a capital letter in
     * it. Normalising here rather than at each call site keeps the two
     * volunteer endpoints from drifting apart, and means the stored value is
     * the one that was checked.
     *
     * @param candidate the raw answer
     * @return the normalised answer, or {@code candidate} unchanged
     */
    public String normalize(String candidate) {
      if(null == candidate) return null;
      return EMAIL == this ? candidate.toLowerCase() : candidate;
    }
  }
  
  private UUID id;
  private UUID event;
  private Type type;
  private String label;
  private String hint;
  private int priority;
  private boolean required;

  /**
   * Instantiates a {@link Detail}.
   *
   * @param id the {@link UUID} of this {@link Detail}
   * @param event the {@link UUID} of the associated {@link Event}
   * @param type this detail's {@link type}
   * @param label the label of the detail
   * @param hint the hint for the detail
   * @param priority the detail's priority, to influence retrieval order
   * @param required {@code true} if a volunteer must answer the question
a   */
  public Detail(UUID id, UUID event, Type type, String label, String hint, int priority, boolean required) {
    this.id = id;
    this.event = event;
    this.type = type;
    this.label = label;
    this.hint = hint;
    this.priority = priority;
    this.required = required;
  }

  /**
   * Retrieves the {@link UUID} associated with this {@link Detail}.
   *
   * @return the detail's {@link UUID}
   */
  public UUID getID() {
    return id;
  }

  /**
   * Retrieves the {@link UUID} of the event associated with this {@link Detail}.
   *
   * @return the event's {@link UUID}
   */
  public UUID getEvent() {
    return event;
  }

  /**
   * Sets the {@link UUID} of the event associated with this {@link Detail}.
   *
   * @param event the event's {@link UUID}
   * @return this {@link Detail} instance
   */
  public Detail setEvent(UUID event) {
    this.event = event;
    return this;
  }

  /**
   * Retrieves the {@link Type} of {@link Detail} this is.
   *
   * @return this detail's {@link Type}
   */
  public Type getType() {
    return type;
  }

  /**
   * Sets the {@link Type} of {@link Detail} this is.
   *
   * @param type this detail's {@link Type}
   * @return this {@link Detail} instance
   */
  public Detail setType(Type type) {
    this.type = type;
    return this;
  }

  /**
   * Retrieves the label of the {@link Detail}
   *
   * @return the detail's label
   */
  public String getLabel() {
    return label;
  }

  /**
   * Sets the label of this {@link Detail}
   *
   * @param label the detail's label
   * @return this {@link Detail} instance
   */
  public Detail setLabel(String label) {
    this.label = label;
    return this;
  }

  /**
   * Retrieves the hint assigned to this {@link Detail}.
   *
   * @return the detail's hint
   * @return this {@link Detail} instance
   */
  public String getHint() {
    return hint;
  }

  /**
   * Sets the hint assigned to this {@link Detail}.
   *
   * @param hint the detail's hint
   * @return this {@link Detail} instance
   */
  public Detail setHint(String hint) {
    this.hint = hint;
    return this;
  }

  /**
   * Retrieves the priority of this {@link Detail}, used for properly ordering
   * the response of a detail retrieval request.
   *
   * @return the detail priority
   */
  public int getPriority() {
    return priority;
  }

  /**
   * Sets the priority of this {@link Detail}, used for properly ordering the
   * response of a detail retrieval request.
   *
   * @param priority the detail priority
   * @return this {@link Detail} instance
   */
  public Detail setPriority(int priority) {
    this.priority = priority;
    return this;
  }

  /**
   * Determines whether or not this {@link Detail} is required.
   *
   * @return {@code true} iff the volunteer must submit a response to this detail
   */
  public boolean isRequired() {
    return required;
  }

  /**
   * Sets whether or not this {@link Detail} is required.
   *
   * @param required {@code true} iff the volunteer must submit a response to
   *        this detail
   * @return this {@link Detail} instance
   */
  public Detail setRequired(boolean required) {
    this.required = required;
    return this;
  }

  /**
   * Determines whether or not the value of a submitted detail is valid. In other
   * words, ensures that the value isn't {@code null} or blank if the detail is
   * required, and ensures that the value (if provided) is valid with respect to
   * the detail's {@link Type}.
   *
   * @return {@code true} if the value candidate is valid
   */
  public boolean isValid(String candidate) {
    if(required && (null == candidate || candidate.isBlank()))
      return false;
    return type.isValid(candidate);
  }

  /**
   * Saves this {@link Detail} to the database. If the {@link Detail} already
   * exists, the record is simply updated.
   *
   * @throws SQLException if a database malfunction occurs
   */
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

  /**
   * Removes this {@link Detail} from the database, if it exists.
   *
   * @throws SQLException if a database malfunction occurs
   */
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

  /**
   * {@inheritDoc}
   */
  @Override public int compareTo(Detail detail) {
    Objects.requireNonNull(detail);
    int c;
    if(0 != (c = Integer.compare(priority, detail.priority))) return c;
    if(0 != (c = label.compareToIgnoreCase(detail.label))) return c;
    // As in Activity: `getDetails` collects into a TreeSet, so two custom
    // fields sharing a label collapsed into one on read. Asking a volunteer the
    // same question twice is unusual but perfectly legal, and losing the second
    // one silently is not.
    return Activity.compareIDs(getID(), detail.getID());
  }
  

  /**
   * Resolves a {@code detail_type} column into a {@link Type}.
   *
   * <p>The column is a {@code TINYINT UNSIGNED} and was read straight into
   * {@code values()[...]}, so an out-of-range value threw
   * {@link ArrayIndexOutOfBoundsException} from inside a model getter that no
   * endpoint catches -- turning a bad row into a 500 on every read of the event
   * that contains it.
   *
   * <p>Out of range resolves to {@link Type#STRING}, which accepts anything and
   * so cannot reject an answer that was already stored.
   *
   * @param ordinal the stored ordinal
   * @return the {@link Type}
   */
  public static Type typeOf(int ordinal) {
    Type[] values = Type.values();
    return 0 <= ordinal && ordinal < values.length ? values[ordinal] : Type.STRING;
  }
}
