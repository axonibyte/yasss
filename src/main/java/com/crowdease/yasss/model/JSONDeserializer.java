/*
 * Copyright (c) 2022 Axonibyte Innovations, LLC.
 *
 * Original source (com.axonibyte.lib.http.rest.JSONTokenizer) licensed under the
 * Apache License, Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License. You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed
 * under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
 * CONDITIONS OF ANY KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations under the License.
 *
 * Modifications copyright (c) 2024 CrowdEase, LLC. Changes include:
 *
 * - removal of spark.Request as a dependency
 * - removal of com.axonibyte.lib.http.rest.EndpointException as a dependency
 * - implementation and inclusion of a depdency on DeserializationException
 * - implementation of recursive iterable tokenizer for org.json.JSONArray
 * - make timestamp retrieval slightly more robust
 * - add constructor for String arguments
 * - minor aesthetic changes in exception messaging
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.model;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.AbstractMap.SimpleEntry;
import java.util.Map.Entry;

import org.json.JSONException;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Assists in the retrieval of arguments from the body of a request.
 *
 * @author Caleb L. Power <cpower@axonibyte.com>
 */
public class JSONDeserializer {

  private JSONObject data = null;
  private Map<String, Entry<String[], Boolean>> requirements = new HashMap<>();

  /**
   * Instantiates this tokenizer from a {@link JSONObject}.
   *
   * @param data the serialized {@link JSONObject}
   * @throws DeserializationException if the data could not be deserialized
   */
  public JSONDeserializer(JSONObject data) throws DeserializationException {
    if(null == data)
      throw new DeserializationException("null object");

    this.data = data;
  }

  /**
   * Instantiates the tokenizer from a {@link String}.
   *
   * @param data the serialized {@link String}
   * @throws DeserializationException if the data could not be deserialized
   */
  public JSONDeserializer(String data) throws DeserializationException {
    if(null == data)
      throw new DeserializationException("null object");

    try {
      this.data = new JSONObject(data);
    } catch(JSONException e) {
      throw new DeserializationException("malformed object");
    }
  }

  /**
   * Flags the provided path as a potential parameter to be retrieved in the future.
   *
   * @param path the parameter path, in JSON notation (without a preceding dot)
   * @param required {@code true} if {@link JSONDeserializer::check} should throw an exception
   *        when executed if the parameter does not exist in the request body
   * @return this object
   */
  public JSONDeserializer tokenize(String path, boolean required) {
    String[] tokens = path.split("\\.");
    requirements.put(path, new SimpleEntry<>(tokens, required));
    return this;
  }

  /**
   * Retrieves the underlying data.
   *
   * @return the underlying JSON object representing the original request
   */
  public JSONObject getData() {
    return data;
  }

  /**
   * Determines whether or not the request body contains the provided parameter.
   *
   * @param token the parameter in question
   * @return {@code true} iff the parameter exists in the JSON body
   */
  public boolean has(String token) {
    try {
      return null != get(token);
    } catch(DeserializationException | RuntimeException e) {
      return false;
    }
  }

  private Object get(String[] tokens, JSONObject json) throws ClassCastException {
    String token = tokens[0];
    if(token.isBlank()) throw new RuntimeException("malformed token");

    if(null == json) return null;
    
    if(tokens.length == 1) return json.opt(token);
    return get(
        Arrays.copyOfRange(tokens, 1, tokens.length),
        json.optJSONObject(token));
  }

  /**
   * Retrieves the value of the provided parameter. If it doesn't exist and it was
   * marked as a required parameter, throw a {@link DeserializationException}. If it
   * doesn't exist and it was marked as an optional parameter, return {@code null}.
   *
   * @param token the path to the requested value
   * @return the value or {@code null} if it doesn't exist and no exception is thrown
   * @throws DeserializationException if the values doesn't exist but was required
   */
  public Object get(String token) throws DeserializationException {
    Entry<String[], Boolean> entry = requirements.get(token);
    if(null == entry)
      throw new RuntimeException("unregistered token");
    
    String[] arr = entry.getKey();
    boolean required = entry.getValue();

    Object value = get(arr, data);

    if(required && null == value)
      throw new DeserializationException("missing argument (%1$s)", token);

    return value;
  }

  /**
   * Retrieves the string value associated with the provided parameter.
   *
   * @param token the path to the requested value
   * @return the value or {@code null} if the value was nonexistent but optional
   * @throws DeserializationException if the value was nonexistent and required,
   *         or if the value could not be cast as a String
   */
  public String getString(String token) throws DeserializationException {
    try {
      return (String)get(token);
    } catch(ClassCastException e) {
      throw new DeserializationException(e, "malformed argument (string: %1$s)", token);
    }
  }

  /**
   * Retrieves the {@link BigDecimal} value associated with the provided parameter.
   *
   * @param token the path to the requested value
   * @return the value or {@code null} if the value was nonexistent but optional
   * @throws DeserializationException if the value was nonexistent and required,
   *         or if the value could not be cast as a {@link BigDecimal}
   */
  public BigDecimal getDecimal(String token) throws DeserializationException {
    try {
      return (BigDecimal)get(token);
    } catch(ClassCastException e) {
      throw new DeserializationException(e, "malformed argument (decimal: %1$s)", token);
    }
  }

  /**
   * Retrieves the Integer value associated with the provided parameter.
   *
   * @param token the path to the requested value
   * @return the value or {@code null} if the value was nonexistent but optional
   * @throws DeserializationException if the value was nonexistent and required,
   *         or if the value could not be cast as an Integer
   */
  public Integer getInt(String token) throws DeserializationException {
    try {
      return (Integer)get(token);
    } catch(ClassCastException e) {
      throw new DeserializationException(e, "malformed argument (int: %1$s)", token);
    }
  }

  /**
   * Retrieves the Boolean value associated with the provided paramter.
   *
   * @param token the path to the requested value
   * @return the value or {@code null} if the value was nonexistent but optional
   * @throws DeserializationException if the value was nonexistent but required,
   *         or if the value could not be cast as a Boolean
   */
  public Boolean getBool(String token) throws DeserializationException {
    try {
      return (Boolean)get(token);
    } catch(ClassCastException e) {
      throw new DeserializationException(e, "malformed argument (bool: %1$s)", token);
    }
  }

  /**
   * Retrieves the UUID value associated with the provided parameter.
   *
   * @param token the path to the requested value
   * @return the value or {@code null} if the value was nonexistent but optional
   * @throws DeserializationException if the value was nonexistent but required,
   *         or if the value could not be cast as a UUID
   */
  public UUID getUUID(String token) throws DeserializationException {
    try {
      var value = get(token);
      return null == value ? null : UUID.fromString(get(token).toString());
    } catch(IllegalArgumentException | NullPointerException e) {
      throw new DeserializationException(e, "malformed argument (uuid: %1$s)", token);
    }
  }

  /**
   * Retrieves the timestamp value associated with the provided parameter.
   *
   * @param token the path to the requested value
   * @return the value or {@code null} if the value was nonexistent but optional
   * @throws DeserializationException if the value was nonexistent but required,
   *         or if the value could not be parsed as a {@link Timestamp}
   */
  public Timestamp getTimestamp(String token) throws DeserializationException {
    var value = getString(token);
    final SimpleDateFormat[] sdfArr = {
        new SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS"),
        new SimpleDateFormat("yyyy-MM-dd HH:mm:ss"),
        new SimpleDateFormat("yyyy-MM-dd HH:mm"),
        new SimpleDateFormat("yyyy-MM-dd hh:mm:ss.SSS a"),
        new SimpleDateFormat("yyyy-MM-dd hh:mm:ss a"),
        new SimpleDateFormat("yyyy-MM-dd hh:mm a"),
        new SimpleDateFormat("yyyy-MM-dd")
    };
    for(int i = 0; i < sdfArr.length; i++) {
      try {
        return new Timestamp(sdfArr[i].parse(value).getTime());
      } catch(ParseException e) { }
    }

    try { // if standard formats fail, try UNIX timestamp format
      return new Timestamp(Long.parseLong(value));
    } catch(NumberFormatException e) { }
    
    throw new DeserializationException("malformed argument (timestamp: %1$s)", token);
  }

  /**
   * Retrieves the {@link JSONArray} associated with the provided parameter.
   *
   * @param token the path to the requested value
   * @return the value or {@code null} if the value was nonexistent but optional
   * @throws DeserializationException if the value was nonexistent but required,
   *         or if the value could not be cast to a {@link JSONArray}
   */
  public JSONArray getJSONArray(String token) throws DeserializationException {
    try {
      return (JSONArray)get(token);
    } catch(ClassCastException e) {
      throw new DeserializationException(e, "malformed argument (array: %1$s)", token);
    }
  }

  /**
   * Tokenizes objects in a {@link JSONArray}.
   *
   * @param token the path to the array
   * @param strict {@code true} iff a {@link DeserializationException} should be
   *        thrown if at least one of the elements of the array was not an object
   * @return a {@link List} of {@link JSONDeserializer} objects
   * @throws DeserializationException if an array element cannot be deserialized
   */
  public List<JSONDeserializer> tokenizeJSONArray(String token, boolean strict) throws DeserializationException {
    JSONArray array = getJSONArray(token);
    List<JSONDeserializer> deserializers = new ArrayList<>();
    for(var obj : array) {
      try {
        deserializers.add(
            new JSONDeserializer(
                (JSONObject)obj));
      } catch(ClassCastException e) {
        if(strict)
          throw new DeserializationException(e, "malformed object in array (%1$s)", token);
      }
    }
    return deserializers;
  }
  
  private void check(JSONObject json, Set<String[]> tokens) throws DeserializationException {
    for(String key : json.keySet()) {
      Set<String[]> matchingTokens = new HashSet<>();
      for(String[] tokenArr : tokens) {
        if(tokenArr[0].equalsIgnoreCase(key))
          matchingTokens.add(tokenArr);
      }
      if(matchingTokens.isEmpty()) throw new DeserializationException(
          String.format(
              "unexpected argument (%1$s)",
              key));
      Object obj = json.get(key);
      if(obj instanceof JSONObject) {
        Set<String[]> tails = new HashSet<>();
        for(String[] matchingTokenArr : matchingTokens) {
          if(matchingTokenArr.length == 1) continue;
          tails.add(
              Arrays.copyOfRange(matchingTokenArr, 1, matchingTokenArr.length));
        }
        check((JSONObject)obj, tails);
      }
    }
  }
  
  /**
   * Checks to ensure that all required arguments are present.
   *
   * @return this object
   * @throws DeserializationException if a required argument is missing
   */
  public JSONDeserializer check() throws DeserializationException {
    Set<String[]> tokens = new HashSet<>();
    for(var entry : requirements.entrySet())
      tokens.add(entry.getValue().getKey());
    check(data, tokens);
    return this;
  }

  /**
   * An exception to be thrown if a serialized {@link JSONObject} cannot be
   * properly deserialized.
   *
   * @author Caleb L. Power <cpower@crowdease.com>
   */
  public static class DeserializationException extends Exception {
    
    private DeserializationException(String format, Object... args) {
      super(String.format(format, args));
    }

    private DeserializationException(Throwable cause, String format, Object... args) {
      super(String.format(format, args), cause);
    }
    
  }
  
}
