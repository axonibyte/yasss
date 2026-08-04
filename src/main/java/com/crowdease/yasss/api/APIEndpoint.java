/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import java.sql.SQLException;

import java.util.HashMap;
import java.util.Map;
import com.crowdease.yasss.model.Event;
import com.crowdease.yasss.model.Mail;
import com.crowdease.yasss.model.Volunteer;
import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.AuthStatus;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;
import com.axonibyte.lib.http.rest.JSONEndpoint;
import com.crowdease.yasss.YasssCore;
import com.crowdease.yasss.api.AuthToken.AuthException;
import com.crowdease.yasss.model.JSONDeserializer;
import com.crowdease.yasss.model.User;
import com.crowdease.yasss.model.JSONDeserializer.DeserializationException;

import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import spark.Request;
import spark.Response;

/**
 * Represents a standard API endpoint that can accept a JSON request and returns
 * a JSON response.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public abstract class APIEndpoint extends JSONEndpoint {

  public static final String ACCESS_LEVEL_HEADER = "AXB-ACCESS-LEVEL";
  public static final String ACCOUNT_HEADER = "AXB-ACCOUNT";
  public static final String SESSION_HEADER = "AXB-SESSION";
  
  private static final Logger logger = LoggerFactory.getLogger(APIEndpoint.class);

  /**
   * Instantiates the endpoint.
   *
   * @param resource the version-exclusive path used to access the endpoint
   * @param version the {@link APIVersion} associated with the endpoint, which
   *        prepended to the resource path accordingly
   * @param methods the array of HTTP methods that can be used to hit the endpoint
   */
  protected APIEndpoint(String resource, APIVersion version, HTTPMethod... methods) {
    super(resource, version, methods);
  }

  /**
   * {@inheritDoc}
   */
  @Override public AuthStatus authenticate(Request req, Response res) throws EndpointException {
    String authString = req.headers("Authorization");
    User user = null;

    try {
      AuthToken token = new AuthToken(authString);
      String nextSession = token.process();
      user = token.getUser();

      res.header(ACCESS_LEVEL_HEADER, user.getAccessLevel().name());
      res.header(ACCOUNT_HEADER, user.getID().toString());
      res.header(SESSION_HEADER, nextSession);
      
    } catch(AuthException e) {
      logger.error("authorization error: {}", e.getMessage());
    } catch(SQLException e) {
      logger.error(
          "database malfunction: {}",
          null == e.getMessage() ? "no further info available" : e.getMessage());
      throw new EndpointException(req, "internal server error", 500, e);
    }
    
    return new Authorization(user, verifyHuman(req));
  }

  /**
   * Determines whether the caller should be treated as human.
   *
   * <p>The CAPTCHA validator is only constructed when {@code auth.captcha.required}
   * is enabled, and the shipped default is disabled -- so this must tolerate a
   * null validator. Note that returning {@code false} in that case would be
   * wrong: registration, credential reset, account verification, anonymous
   * event publication and anonymous volunteer signup all gate on
   * {@code IS_HUMAN}, and would become unreachable in exactly the deployments
   * that never asked for CAPTCHAs in the first place. No CAPTCHA configured
   * means the check does not apply, not that it fails.
   *
   * @param req the HTTP {@link Request}
   * @return {@code true} if the caller passes the human check
   */
  protected static boolean verifyHuman(Request req) {
    return verifyHuman(
        req.headers(com.axonibyte.lib.http.captcha.CAPTCHAValidator.CAPTCHA_HEADER),
        req.ip());
  }

  /**
   * Determines whether a caller should be treated as human, given their CAPTCHA
   * token and originating address.
   *
   * @param captchaToken the value of the CAPTCHA header, or {@code null}
   * @param ipAddr the caller's IP address
   * @return {@code true} if the caller passes the human check
   */
  protected static boolean verifyHuman(String captchaToken, String ipAddr) {
    var validator = YasssCore.getCAPTCHAValidator();
    return null == validator || validator.verify(captchaToken, null, ipAddr);
  }

  /**
   * {@inheritDoc}
   */
  @Override public JSONObject doEndpointTask(Request req, Response res, AuthStatus auth) throws EndpointException {
    return onCall(req, res, (Authorization)auth);
  }

  /**
   * Executes the endpoint workflow.
   *
   * @param req the HTTP {@link Request}
   * @param res the HTTP {@link Response}
   * @param auth the {@link Authorization} associated with the actor accessing
   *        the endpoint
   * @return the {@link JSONObject} response
   * @throws EndpointException if a malfunction occurs during the execution of
   *         the endpoint's workflow
   */
  public abstract JSONObject onCall(Request req, Response res, Authorization auth) throws EndpointException;

  /**
   * Converts the query parameters into a {@link JSONObject}. If there exists
   * only one value for the associated parameter, the value added to the object
   * will be a string; otherwise, the value will be an array of strings.
   *
   * @param req the HTTP {@link Request}
   * @return a {@link JSONDeserializer} to assist in the deserialization of the
   *         JSON object
   * @throws DeserializationException if the deserialization process fails for
   *         some reason (which should never happen on this particular method)
   */
  protected JSONDeserializer deserializeQueryParams(Request req) throws DeserializationException {
    JSONObject map = new JSONObject();
    for(var param : req.queryParams()) {
      var argArr = req.queryParamsValues(param);
      map.put(
          param,
          1 == argArr.length ? argArr[0] : argArr);
    }
    return new JSONDeserializer(map);
  }

  /**
   * The width of every user-facing text column in the schema.
   *
   * Every one of them is {@code VARCHAR(255)} -- names, descriptions, labels,
   * hints, detail answers, email addresses.
   */
  public static final int MAX_TEXT_LENGTH = 255;

  /**
   * Bounds a user-supplied string to what its column can hold.
   *
   * <p>Nothing checked this, so any text longer than the column simply reached
   * the database and came back as {@code database malfunction} with a 500 and a
   * stack trace -- a plain client mistake reported as a server fault. Found by
   * the fuzzer with a 256-character volunteer name.
   *
   * <p>Counted in code points rather than {@link String#length()}, because
   * {@code VARCHAR(255)} counts characters and {@code length()} counts UTF-16
   * code units. Everything outside the basic multilingual plane -- most emoji,
   * historic scripts, a good deal of CJK extension -- takes two units per
   * character, so a 200-emoji name measured 400 and was refused with a 400
   * despite fitting the column with room to spare. The old count was strictly
   * conservative, so this only ever accepts more than it did; it is not a hole
   * being opened.
   *
   * @param req the HTTP {@link Request}
   * @param value the value to check, which may be {@code null}
   * @param token the argument name, for the error message
   * @return {@code value}, unchanged
   * @throws EndpointException with a 400 if the value is too long
   */
  protected static String bounded(Request req, String value, String token)
      throws EndpointException {
    if(null != value && MAX_TEXT_LENGTH < value.codePointCount(0, value.length()))
      throw new EndpointException(
          req,
          String.format("malformed argument (string too long: %1$s)", token),
          400);
    return value;
  }

  /** The width of the {@code pubkey} column: a raw Ed25519 public key. */
  private static final int PUBKEY_BYTES = 32;

  /**
   * Verifies that a base64 public key decodes to the right number of bytes.
   *
   * <p>{@code Credentialed.setPubkey} rejects malformed base64 but not
   * well-formed base64 of the wrong length, so a longer key decoded cleanly and
   * then overflowed {@code BINARY(32)} -- surfacing as {@code database
   * malfunction} with a 500. Found by the fuzzer.
   *
   * @param req the HTTP {@link Request}
   * @param pubkey the base64-encoded key
   * @return {@code pubkey}, unchanged
   * @throws EndpointException with a 400 if it is not a 32-byte key
   */
  protected static String validPubkey(Request req, String pubkey) throws EndpointException {
    try {
      if(PUBKEY_BYTES != java.util.Base64.getDecoder().decode(pubkey).length)
        throw new IllegalArgumentException();
    } catch(IllegalArgumentException | NullPointerException e) {
      throw new EndpointException(req, "malformed argument (pubkey)", 400);
    }
    return pubkey;
  }

  /**
   * Reads a positive integer from deserialized query parameters.
   *
   * <p>{@link #deserializeQueryParams(Request)} necessarily stores every value
   * as a {@link String}, but {@code JSONDeserializer.getInt} casts to
   * {@link Integer} -- so reading a numeric query argument the ordinary way
   * throws a {@link ClassCastException} and surfaces as a confusing 400. This
   * parses leniently instead. It is deliberately local to query handling rather
   * than a change to {@code getInt}, which would alter behavior for every
   * endpoint that reads a request body.
   *
   * @param req the HTTP {@link Request}
   * @param deserializer the {@link JSONDeserializer} holding the query params
   * @param token the parameter name
   * @param max the largest value accepted
   * @return the parsed value
   * @throws EndpointException with a 400 if the value is absent, unparseable,
   *         below 1, or above {@code max}
   */
  protected static int queryInt(
      Request req, JSONDeserializer deserializer, String token, int max)
      throws EndpointException {
    int value;
    try {
      value = Integer.parseInt(String.valueOf(deserializer.get(token)).strip());
    } catch(NumberFormatException | DeserializationException e) {
      throw new EndpointException(req, String.format("malformed argument (%1$s)", token), 400);
    }
    // The ceiling is not cosmetic. Listing endpoints compute `limit * (page - 1)`
    // as a SQL offset and `page * limit` for the next-page link, so an unbounded
    // value overflows int into a negative offset and comes back as a 500 for
    // what is plainly a client mistake. A cap also stops one request asking the
    // database to materialise an entire table.
    if(1 > value || max < value)
      throw new EndpointException(req, String.format("malformed argument (%1$s)", token), 400);
    return value;
  }

  /**
   * Resolves the {@code :event} path parameter, by UUID or by short code.
   *
   * <p>Tries the UUID first, since that is what every existing link carries,
   * and falls back to the code. There is no ambiguity between the two: a
   * normalised code is eight characters and a UUID is thirty-six, so a string
   * cannot be both.
   *
   * <p>Every endpoint taking {@code :event} goes through this, which is what
   * makes a code usable everywhere a UUID is rather than only on the one
   * endpoint someone remembered to update.
   *
   * @param raw the path parameter
   * @return the {@link Event}, or {@code null} if nothing matches
   * @throws SQLException if a database malfunction occurs
   */
  // Public rather than protected: EventReportEndpoint extends Endpoint rather
  // than APIEndpoint, because it answers HTML instead of JSON, and it takes the
  // same :event parameter as everything else.
  public static Event resolveEvent(String raw) throws SQLException {
    if(null == raw) return null;
    try {
      return Event.getEvent(java.util.UUID.fromString(raw));
    } catch(IllegalArgumentException e) {
      return Event.getEventByCode(raw);
    }
  }

  /** The largest page size any listing endpoint will serve. */
  public static final int MAX_PAGE_SIZE = 200;

  /**
   * The largest page number any listing endpoint will serve.
   *
   * <p>Chosen so that {@code MAX_PAGE * MAX_PAGE_SIZE} cannot overflow an
   * {@code int}, which is the arithmetic every caller performs.
   */
  public static final int MAX_PAGE = 1_000_000;


  /**
   * Sends a volunteer the double opt-in confirmation for their reminders.
   *
   * <p>Shared by the create and modify endpoints. Call this only <em>after</em>
   * the volunteer has been committed: the link carries the stored reminder
   * token, and mailing a token that a later failure rolls back gives the
   * recipient a link that can never work.
   *
   * @param event the {@link Event} they signed up for
   * @param volunteer the {@link Volunteer}, already committed
   */
  protected static void sendReminderPrompt(Event event, Volunteer volunteer) {
    Map<String, String> args = new HashMap<>();
    args.put("EVENT_TITLE", event.getShortDescription());
    args.put(
        "EVENT_URL",
        String.format("%1$s/?event=%2$s", YasssCore.getAPIHost(), event.getID()));
    args.put(
        "SUBSCRIBE",
        String.format(
            "%1$s/?action=confirm-reminders&event=%2$s&volunteer=%3$s&token=%4$s",
            YasssCore.getAPIHost(),
            event.getID(),
            volunteer.getID(),
            volunteer.getReminderToken()));

    new Mail(volunteer.getReminderEmail(), "signup-prompt", args).send();
  }

  /**
   * Validates an IANA timezone identifier.
   *
   * <p>Checked against the JVM's own tz database rather than a pattern: the
   * value has to be one {@link java.time.ZoneId} can actually resolve, because
   * every renderer downstream -- the mail templates especially -- will hand it
   * straight to one. A plausible-looking name that is not in the database would
   * fail much later, inside an email nobody is watching.
   *
   * <p>Offsets like {@code +05:00} are deliberately rejected. An offset is
   * wrong for half the year anywhere that observes daylight saving, and events
   * are routinely scheduled across a transition.
   *
   * @param req the {@link Request}
   * @param timezone the candidate identifier
   * @return the identifier, unchanged
   * @throws EndpointException with a 400 if it names no known zone
   */
  protected static String validTimezone(Request req, String timezone) throws EndpointException {
    if(null == timezone || !java.time.ZoneId.getAvailableZoneIds().contains(timezone))
      throw new EndpointException(req, "malformed argument (timezone)", 400);
    return timezone;
  }

  /** The longest reminder lead time worth allowing: one year, in minutes. */
  public static final int MAX_LEAD_MINUTES = 525_600;

  /**
   * Validates a per-event reminder lead time.
   *
   * <p>Bounded rather than merely non-negative. Zero would mean "remind them as
   * the event begins", which is not a reminder; and an unbounded value makes
   * every future event permanently due, so the first sweep after it is set
   * mails the entire backlog at once.
   *
   * @param req the {@link Request}
   * @param minutes the candidate lead time
   * @return the lead time, unchanged
   * @throws EndpointException with a 400 if it is out of range
   */
  protected static int validLeadTime(Request req, int minutes) throws EndpointException {
    if(1 > minutes || MAX_LEAD_MINUTES < minutes)
      throw new EndpointException(req, "malformed argument (reminderLeadTime)", 400);
    return minutes;
  }
}
