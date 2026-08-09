/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

import spark.Request;

/**
 * A Spark {@link Request} with no servlet behind it.
 *
 * <p>A hand-written subclass rather than a mock. {@link Request} has a
 * protected no-arg constructor and no final accessors, so overriding the few
 * methods the endpoints actually call is both possible and considerably more
 * legible than the equivalent stubbing -- and nothing here delegates to the
 * null {@code HttpServletRequest} underneath.
 *
 * <p>Only what the tests need is overridden. Anything else will throw, which is
 * the desired behavior: a test reaching for an unmodelled part of the request
 * should fail loudly rather than quietly see a default.
 *
 * @author Caleb L. Power
 */
final class FakeRequest extends Request {

  private final Map<String, String[]> queryParams = new LinkedHashMap<>();
  private final Map<String, String> headers = new HashMap<>();
  private final Map<String, String> params = new HashMap<>();
  private String body = "";
  private String ip = "127.0.0.1";
  private String pathInfo = "/v1/test";
  private String requestMethod = "GET";

  /** Adds a query parameter, repeatable to model a multi-valued one. */
  FakeRequest query(String key, String... values) {
    queryParams.put(key, values);
    return this;
  }

  FakeRequest header(String key, String value) {
    headers.put(key, value);
    return this;
  }

  FakeRequest param(String key, String value) {
    params.put(key, value);
    return this;
  }

  FakeRequest body(String value) {
    this.body = value;
    return this;
  }

  FakeRequest ip(String value) {
    this.ip = value;
    return this;
  }

  FakeRequest method(String value) {
    this.requestMethod = value;
    return this;
  }

  @Override public Set<String> queryParams() {
    return queryParams.keySet();
  }

  @Override public String[] queryParamsValues(String key) {
    return queryParams.get(key);
  }

  @Override public String queryParams(String key) {
    String[] values = queryParams.get(key);
    return null == values || 0 == values.length ? null : values[0];
  }

  @Override public String headers(String key) {
    return headers.get(key);
  }

  @Override public String params(String key) {
    return params.get(key);
  }

  @Override public String body() {
    return body;
  }

  @Override public String ip() {
    return ip;
  }

  @Override public String pathInfo() {
    return pathInfo;
  }

  @Override public String requestMethod() {
    return requestMethod;
  }
}
