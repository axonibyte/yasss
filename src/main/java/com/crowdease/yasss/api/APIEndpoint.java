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
import com.crowdease.yasss.model.AccessCode;
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
import com.crowdease.yasss.model.Poll;
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

  /**
   * Why a credential was refused, when saying so gives nothing away.
   *
   * <p>Only ever set for a clock-skew rejection, which is decided before any account is
   * looked up -- so any caller can trigger it with any garbage and it reveals nothing
   * about whether an account exists. A replay is deliberately <em>not</em> hinted at: that
   * is only reachable after a signature has already verified, so naming it would confirm
   * to whoever captured the header that it was genuine.
   */
  public static final String AUTH_HINT_HEADER = "AXB-AUTH-HINT";

  /**
   * The server's clock, in epoch milliseconds, so a client can correct for its own.
   *
   * <p>Not the standard {@code Date} header, which is not CORS-safelisted and so cannot
   * be read by a cross-origin client -- which is exactly the case that needs it.
   */
  public static final String SERVER_TIME_HEADER = "AXB-SERVER-TIME";

  /** The value of {@link #AUTH_HINT_HEADER} when a credential is outside the skew window. */
  public static final String HINT_CLOCK_SKEW = "CLOCK_SKEW";
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
   * Whether a password-derived credential may be presented to this endpoint, as opposed
   * to a session ticket.
   *
   * <p>Defaults to {@code false}, and that default is the point: a credential is a
   * permanent bearer token that {@code session_epoch} cannot revoke, so the set of places
   * one is accepted should be as small as possible and should have to be stated. Only the
   * sign-in route overrides this. See {@link AuthToken#process()}.
   *
   * @return {@code true} if this endpoint is a sign-in route
   */
  protected boolean acceptsCredentials() {
    return false;
  }

  /**
   * {@inheritDoc}
   */
  @Override public AuthStatus authenticate(Request req, Response res) throws EndpointException {
    String authString = req.headers("Authorization");
    User user = null;
    AuthToken token = null;

    try {
      token = new AuthToken(authString, acceptsCredentials());
      String nextSession = token.process();
      user = token.getUser();

      res.header(ACCESS_LEVEL_HEADER, user.getAccessLevel().name());
      res.header(ACCOUNT_HEADER, user.getID().toString());
      res.header(SESSION_HEADER, nextSession);
      
    } catch(AuthException e) {
      // A wrong clock is otherwise indistinguishable from a wrong password: the request
      // just becomes anonymous and the client reports "invalid credentials", which is
      // both false and unactionable. Saying so costs nothing -- skew is decided before
      // any account is resolved, so this reveals nothing about who exists.
      if(token.clockSkewed()) {
        res.header(AUTH_HINT_HEADER, HINT_CLOCK_SKEW);
        res.header(SERVER_TIME_HEADER, Long.toString(System.currentTimeMillis()));
      }
      logger.debug("authorization error: {}", e.getMessage());
    } catch(SQLException e) {
      logger.error(
          "database malfunction: {}",
          null == e.getMessage() ? "no further info available" : e.getMessage());
      throw new EndpointException(req, "internal server error", 500, e);
    }
    
    return new Authorization(user, verifyHuman(req));
  }

  /**
   * Replaces the session ticket on a response after revoking the caller's
   * sessions.
   *
   * <p>{@link #authenticate} mints a ticket before {@code onCall} runs, so an
   * endpoint that then bumps its own actor's {@code session_epoch} would hand
   * back a ticket its next request refuses. Changing your own password, or
   * signing your other devices out, would sign out the device you did it from --
   * which reads as the feature being broken.
   *
   * <p>Uses {@code setHeader} rather than Spark's {@code Response.header}, which
   * appends: two {@code AXB-SESSION} headers is not a fix.
   *
   * <p>Only ever call this for the account that initiated the revocation. Doing
   * it for a third party -- an administrator resetting somebody else -- would
   * hand the administrator a ticket for an account that is not theirs.
   *
   * @param res the HTTP {@link Response}
   * @param actor the authenticated caller, whose sessions were just revoked
   * @param revokedAt the watermark that was just written. The replacement has to
   *        start strictly after it -- {@code SessionTicket} treats a session
   *        beginning at the epoch as revoked, so a reissue landing in the same
   *        millisecond as the revocation would be dead on arrival, which on a
   *        coarse clock is most of the time
   */
  protected static void reissueSession(Response res, User actor, long revokedAt) {
    if(null == actor) return;
    try {
      long now = Math.max(System.currentTimeMillis(), revokedAt + 1);
      res.raw().setHeader(SESSION_HEADER, AuthToken.issue(actor.getID(), now, now));
    } catch(AuthException e) {
      // The revocation itself stands; the caller simply has to sign in again.
      logger.error("could not reissue a session for {}: {}", actor.getID(), e.getMessage());
    }
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
   * normalized code is eight characters and a UUID is thirty-six, so a string
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

  /**
   * Resolves a {@code :poll} path parameter, by {@link java.util.UUID} or by
   * short code.
   *
   * <p>The twin of {@link #resolveEvent(String)}, and deliberately a separate
   * method rather than something clever built on the shared registry. An
   * endpoint under {@code /polls} wants a poll: handed a code that names an
   * event, the honest answer is "no such poll" and a 404, not a redirect into a
   * different resource on a route that has never returned one.
   *
   * @param raw the path parameter
   * @return the {@link Poll}, or {@code null} if nothing matches
   * @throws SQLException if a database malfunction occurs
   */
  public static Poll resolvePoll(String raw) throws SQLException {
    if(null == raw) return null;
    try {
      return Poll.getPoll(java.util.UUID.fromString(raw));
    } catch(IllegalArgumentException e) {
      return Poll.getPollByCode(raw);
    }
  }

  /**
   * Resolves a bare short code to whatever it names.
   *
   * <p>What the single entry box needs, and the reason codes share a namespace
   * at all: the person typing eight characters off a flyer does not know
   * whether they are holding an event or a poll, so this answers the question
   * for them in one round trip rather than making the client guess and retry.
   *
   * @param raw the code, in any spelling a human might produce
   * @return what it names, or {@code null} if nothing holds that code
   * @throws SQLException if a database malfunction occurs
   */
  public static AccessCode.Ref resolveCode(String raw) throws SQLException {
    return AccessCode.resolve(raw);
  }

  /**
   * Validates and parses a time of day, as {@code HH:mm}.
   *
   * <p>Deliberately not {@link java.sql.Time#valueOf(String)}, which accepts
   * only {@code HH:mm:ss} and throws an unchecked
   * {@link IllegalArgumentException} on anything else -- a 500 where a 400
   * belongs. Seconds are not accepted rather than merely ignored: a poll asks
   * about nine o'clock, and a caller sending {@code 09:00:30} has misunderstood
   * something that silently discarding the seconds would leave them believing.
   *
   * @param req the {@link Request}
   * @param raw the candidate, as {@code HH:mm}
   * @param token the argument name, for the error message
   * @return the parsed {@link java.sql.Time}
   * @throws EndpointException with a 400 if it is not a time of day
   */
  protected static java.sql.Time validTime(Request req, String raw, String token)
      throws EndpointException {
    // Digits checked one at a time rather than handed to parseInt, which
    // accepts a leading sign -- so "+9:00" parsed as nine o'clock and was
    // accepted, having passed both the length check and the range check. The
    // four positions that must be digits are the whole format, so saying so
    // directly is both shorter and the thing that is actually true.
    if(null != raw && 5 == raw.length() && ':' == raw.charAt(2)
        && digit(raw, 0) && digit(raw, 1) && digit(raw, 3) && digit(raw, 4)) {
      int hour = (raw.charAt(0) - '0') * 10 + (raw.charAt(1) - '0');
      int minute = (raw.charAt(3) - '0') * 10 + (raw.charAt(4) - '0');
      if(24 > hour && 60 > minute)
        return java.sql.Time.valueOf(String.format("%02d:%02d:00", hour, minute));
    }
    throw new EndpointException(req, "malformed argument (" + token + ")", 400);
  }

  private static boolean digit(String raw, int index) {
    char c = raw.charAt(index);
    return '0' <= c && '9' >= c;
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
