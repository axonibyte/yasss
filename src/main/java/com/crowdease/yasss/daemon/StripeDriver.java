/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.daemon;

import com.axonibyte.lib.db.SQLBuilder;
import com.crowdease.yasss.YasssCore;
import com.crowdease.yasss.model.Event;
import com.stripe.Stripe;
import com.stripe.exception.StripeException;
import com.stripe.model.Price;
import com.stripe.model.checkout.Session;
import com.stripe.param.PriceListParams;
import com.stripe.param.checkout.SessionCreateParams;
import com.stripe.param.checkout.SessionRetrieveParams;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.HashSet;
import java.util.Set;

/**
 * Handles Stripe interactions.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public final class StripeDriver {

  private static final Logger logger = LoggerFactory.getLogger(StripeDriver.class);
  
  private final String lookupKey;

  /**
   * Instantiates the Stripe driver. As the Stripe API essentially uses a
   * singleton pattern, the API key specified through this constructor will be
   * the API key used globally throughout this platform... use {@code null} to
   * avoid overwriting the global API key.
   *
   * @param apiKey the Stripe API key
   * @param lookupKey the Stripe lookup key associated with the event publishing price
   */
  public StripeDriver(String apiKey, String lookupKey) {
    if(null != apiKey) Stripe.apiKey = apiKey;
    this.lookupKey = lookupKey;
  }

  /**
   * Starts a Stripe checkout session.
   *
   * @param eventID the ID of the event to associate with the checkout session
   * @return the URL that the user should be redirected to in order to pay the
   *         amount owed
   * @throws SQLException if a database malfunction occurs
   * @throws StripeException if a Stripe malfunction occurs
   */
  public String startCheckout(Event event) throws SQLException, StripeException {
    var prices = Price.list(
        PriceListParams.builder()
        .addLookupKey(lookupKey)
        .setLimit(1L)
        .build())
      .getData();

    if(prices.isEmpty())
      throw new RuntimeException(
          String.format(
              "failed to find prices associated with lookup key %1$s",
              lookupKey));

    logger.info(
        "lookup key {} found to be associated with price ID {}",
        lookupKey,
        prices.get(0).getId());
    
    Session session = Session.create(
        SessionCreateParams.builder()
            .setMode(SessionCreateParams.Mode.PAYMENT)
            .setSuccessUrl(
                String.format(
                    "%1$s?action=payment-success&event=%2$s&share",
                    YasssCore.getAPIHost(),
                    event.getID().toString()))
            .setCancelUrl(
                String.format(
                    "%1$s?action=payment-canceled",
                    YasssCore.getAPIHost()))
            .setAutomaticTax(
                SessionCreateParams.AutomaticTax.builder()
                    .setEnabled(true)
                    .build())
            .addLineItem(
                SessionCreateParams.LineItem.builder()
                    .setQuantity(1L)
                    .setPrice(prices.get(0).getId())
                    .build())
            .putMetadata("event_id", event.getID().toString())
            .build());
    
    Connection con = null;
    PreparedStatement stmt = null;
    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .insert(
                  YasssCore.getDB().getPrefix() + "checkout_session",
                  "event",
                  "session_id")
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(event.getID()));
      stmt.setString(2, session.getId());
      stmt.executeUpdate();
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, null);
    }
    
    return session.getUrl();
  }

  /**
   * Fulfills any checkout session associated with an event, if at least one of
   * the associated checkout sessions have been paid.
   *
   * @param event the {@link Event}
   * @return {@code true} if at least one session associated with the event was
   *         marked as paid (will return {@code false} if no sessions were found,
   *         even if the event is already published)
   * @throws SQLException if a database malfunction occurs
   * @throws StripeException if a Stripe malfunction occurs
   */
  public boolean fulfillCheckout(Event event) throws SQLException, StripeException {
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;

    Set<String> checkoutSessions = new HashSet<>();

    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
          .select(
              YasssCore.getDB().getPrefix() + "checkout_session",
              "session_id")
          .where("event")
          .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(event.getID()));
      res = stmt.executeQuery();

      while(res.next())
        checkoutSessions.add(
            res.getString("session_id"));

      logger.info(
          "found {} checkout session(s) associated with event {}",
          checkoutSessions.size(),
          event.getID().toString());

      for(var sessionID : checkoutSessions) {
        Session session = Session.retrieve(
            sessionID,
            SessionRetrieveParams.builder()
                .addExpand("line_items")
                .build(),
            null);

        logger.info(
            "checkout session {} for event {} has payment status {}",
            sessionID,
            event.getID().toString(),
            session.getPaymentStatus());
        
        if(!session.getPaymentStatus().equalsIgnoreCase("unpaid")) {
          event.publish(true);
          event.commit();
          
          YasssCore.getDB().close(null, stmt, res);
          stmt = con.prepareStatement(
              new SQLBuilder()
                  .delete(
                      YasssCore.getDB().getPrefix() + "checkout_session")
                  .where("event")
                  .toString());
          stmt.setBytes(1, SQLBuilder.uuidToBytes(event.getID()));
          stmt.executeUpdate();
          return true;
        }
      }
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }

    return false;
  }

  /**
   * Fulfills a Stripe checkout session, if it's been paid.
   *
   * @param sessionID the ID of the session supposedly paid
   * @return true if the checkout session was fulfilled (either just now or previously)
   * @throws SQLException if a database malfunction occurs
   * @throws StripeException if a Stripe malfunction occurs
   */
  public boolean fulfillCheckout(String sessionID) throws SQLException, StripeException {
    Session session = Session.retrieve(
        sessionID,
        SessionRetrieveParams.builder()
            .addExpand("line_items")
            .build(),
        null);
    
    if(session.getPaymentStatus().equalsIgnoreCase("unpaid")) {
      logger.error(
          "failed to fulfill Stripe session {} (unpaid)",
          sessionID);

      return false;
    }
      
    Connection con = null;
    PreparedStatement stmt = null;
    ResultSet res = null;
    Event event = null;
    
    try {
      con = YasssCore.getDB().connect();
      stmt = con.prepareStatement(
          new SQLBuilder()
              .select(
                  YasssCore.getDB().getPrefix() + "checkout_session",
                  "event")
              .where("session_id")
              .toString());
      stmt.setString(1, sessionID);
      res = stmt.executeQuery();
      
      if(res.next())
        event = Event.getEvent(
            SQLBuilder.bytesToUUID(
                res.getBytes("event")));
      
      if(null == event) {
        logger.error("session {} was mapped to a nonexistent event!", sessionID);
        return false;
      }
        
      if(event.isPublished()) {
        logger.warn(
            "tried to fulfill checkout session {} but event {} is already published",
            sessionID,
            event.getID().toString());
        
      } else {
        logger.info(
            "fulfilled checkout session {} and published event {}",
            sessionID,
            event.getID().toString());
        event.publish(true);
        event.commit();
      }
      
      YasssCore.getDB().close(null, stmt, res);
      stmt = con.prepareStatement(
          new SQLBuilder()
              .delete(
                  YasssCore.getDB().getPrefix() + "checkout_session")
              .where("event")
              .toString());
      stmt.setBytes(1, SQLBuilder.uuidToBytes(event.getID()));
      stmt.executeUpdate();

      return true;
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
      
  }
  
}
