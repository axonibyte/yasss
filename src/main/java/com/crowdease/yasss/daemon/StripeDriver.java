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
import com.stripe.model.PriceCollection;
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
import java.util.UUID;

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
  public String startCheckout(UUID eventID) throws SQLException, StripeException {
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
    
    Session session = Session.create(
        SessionCreateParams.builder()
            .setMode(SessionCreateParams.Mode.PAYMENT)
            .setSuccessUrl(
                String.format(
                    "%1$s?action=payment-success&event=%2$s&share",
                    YasssCore.getAPIHost(),
                    eventID.toString()))
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
      stmt.setBytes(1, SQLBuilder.uuidToBytes(eventID));
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
   * Fulfills a Stripe checkout session, if it's been paid.
   *
   * @param sessionID the ID of the session supposedly paid
   * @throws SQLException if a database malfunction occurs
   * @throws StripeException if a Stripe malfunction occurs
   */
  public void fulfillCheckout(String sessionID) throws SQLException, StripeException {
    Session session = Session.retrieve(
        sessionID,
        SessionRetrieveParams.builder()
            .addExpand("line_items")
            .build(),
        null);
    
    if("unpaid" == session.getPaymentStatus()) {
      logger.error(
          "failed to fulfill Stripe session {} (unpaid)",
          sessionID);

      return;
      
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
        
      } else {
        
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
        
      }
      
    } catch(SQLException e) {
      throw e;
    } finally {
      YasssCore.getDB().close(con, stmt, res);
    }
      
  }
  
}
