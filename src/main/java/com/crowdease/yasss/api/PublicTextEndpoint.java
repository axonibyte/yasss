/*
 * Copyright (c) 2024 CrowdEase, LLC.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at https://mozilla.org/MPL/2.0/.
 */
package com.crowdease.yasss.api;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import com.axonibyte.lib.http.APIVersion;
import com.axonibyte.lib.http.rest.AuthStatus;
import com.axonibyte.lib.http.rest.Endpoint;
import com.axonibyte.lib.http.rest.EndpointException;
import com.axonibyte.lib.http.rest.HTTPMethod;
import com.crowdease.yasss.config.ParamEnum;
import com.crowdease.yasss.model.DiskResource;

import spark.Request;
import spark.Response;

/**
 * Endpoint that handles the retrieval of certain texts that are safe for viewing
 * by anyone that hits the API.
 *
 * @author Caleb L. Power <cpower@crowdease.com>
 */
public final class PublicTextEndpoint extends Endpoint {

  /**
   * Embodies a text file that can be retrieved.
   *
   * @author Caleb L. Power <cpower@crowdease.com>
   */
  public static enum TextFile {
    CALL_TO_ACTION(ParamEnum.TEXTS_CALL_TO_ACTION, "coa"),
    TERMS_OF_SERVICE(ParamEnum.TEXTS_TERMS_OF_SERVICE, "terms"),
    PRIVACY_POLICY(ParamEnum.TEXTS_PRIVACY_POLICY, "privacy");

    private String id;
    private ParamEnum param;

    private TextFile(ParamEnum param, String id) {
      this.id = id;
      this.param = param;
    }

    /**
     * {@inheritDoc}
     */
    @Override public String toString() {
      return param.toString();
    }

    /**
     * Retrieves the {@link TextFile} associated with the provided ID, if one
     * exists. A returned object does not necessarily indicate that the file was
     * loaded.
     *
     * @param the id associated with the text file
     * @return the {@link TextFile}, if found; otherwise, {@code null}
     */
    public static TextFile fromID(String id) {
      if(null != id)
        for(var tf : values())
          if(tf.id.equalsIgnoreCase(id.strip()))
            return tf;
      return null;
    }
  }

  private static Map<TextFile, DiskResource> resources = new ConcurrentHashMap<>();

  /**
   * Loads content and associates it with a {@link TextFile} identifier.
   *
   * @param textFile the {@link TextFile} with which to associated the content
   * @param path the path to the file on disk with the content
   */
  public static void loadResource(TextFile textFile, String path) {
    DiskResource resource = new DiskResource(path).read();
    if(null != resource.toString())
      resources.put(textFile, resource);
  }

  /**
   * Instantiates the endpoint.
   */
  public PublicTextEndpoint() {
    super("/texts/:text", APIVersion.VERSION_1, HTTPMethod.GET);
  }

  /**
   * {@inheritDoc}
   */
  @Override public String answer(Request req, Response res, AuthStatus as) throws EndpointException {
    TextFile textFile = TextFile.fromID(req.params("text"));
    if(null == textFile)
      throw new EndpointException(req, "invalid argument", 400);

    if(!resources.containsKey(textFile))
      throw new EndpointException(req, "file not found", 404);

    res.type("text/markdown");
    return resources.get(textFile).toString();
  }
  
}
