/*
 * Copyright (c) 2026 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import java.util.UUID;

/**
 * Something a person can own, and therefore be allowed to change.
 *
 * <p>Exists so that the rule governing that lives in one place. It is a short
 * rule with a long consequence: <em>you may change a thing if you are its
 * administrator, and a thing with no administrator can be changed only by a
 * platform admin</em>. The second half is why publishing anonymously is
 * irreversible — an event or poll with a null admin has no owner to recognise,
 * so nobody but staff will ever be able to edit it. That is a promise made to
 * every visitor who publishes without an account, and it must not come to be
 * enforced by two copies of the same code that can drift apart.
 *
 * <p>Deliberately not an abstract class. {@link Event} and {@link Poll} share
 * this one question and nothing else — their tables, their children and their
 * lifecycles have almost nothing in common — so a common superclass would be
 * inventing a relationship to hold three methods.
 *
 * @author Caleb L. Power &lt;cpower@crowdease.com&gt;
 */
public interface Ownable {

  /**
   * Retrieves the identifier of this thing.
   *
   * @return the {@link UUID}
   */
  UUID getID();

  /**
   * Retrieves the account that administers this thing.
   *
   * @return the administrator's {@link UUID}, or {@code null} if it was created
   *         anonymously and therefore has no owner
   */
  UUID getAdmin();

  /**
   * Names this kind of thing for a human reading a log line.
   *
   * <p>The authorization log is what an operator reads when they are working
   * out why something answered 403, and "determining access to modify {}" is
   * considerably less useful when it cannot say what {} was.
   *
   * @return a lowercase noun, such as {@code "event"} or {@code "poll"}
   */
  String getKind();
}
