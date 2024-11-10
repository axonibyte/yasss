/*
 * Copyright (c) 2019-2022 Axonibyte Innovations, LLC. All rights reserved.
 *
 *   Licensed under the Apache License, Version 2.0 (the "License");
 *   you may not use this file except in compliance with the License.
 *   You may obtain a copy of the License at
 *
 *   https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.crowdease.yasss.model;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import com.crowdease.yasss.YasssCore;

/**
 * Represents a resource read from the disk.
 * 
 * @author Caleb L. Power
 */
public class DiskResource {
  
  private AtomicReference<String> data = new AtomicReference<>();
  private String resource = null;
  
  /**
   * Instantiates a model of a resource on the disk.
   * 
   * @param resource the path to the resource
   */
  public DiskResource(String resource) {
    this.resource = resource;
  }
  
  /**
   * Reads a resource, preferably plaintext. The resource can be in the
   * classpath, in the JAR (if compiled as such), or on the disk. <em>Reads the
   * entire file at once--so it's probably not wise to read huge files at one
   * time.</em> Eliminates line breaks in the process, so best for source files
   * i.e. HTML or SQL.
   * 
   * @return this disk resource object 
   */
  public DiskResource read() {
    String data = null;
    
    InputStream inputStream = null;
    
    if(resource != null) try {
      File file = new File(resource);
      
      if(file.canRead())
        inputStream = new FileInputStream(file);
      else
        inputStream = YasssCore.class.getResourceAsStream(resource);
      
      if(inputStream != null)
        try(BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream, StandardCharsets.UTF_8))) {
          StringBuilder stringBuilder = new StringBuilder();
          for(String line; (line = reader.readLine()) != null;)
            stringBuilder.append(line.trim()).append('\n');
          data = stringBuilder.toString();
        }
    } catch(IOException e) { } finally {
      if(inputStream != null) try {
        inputStream.close();
      } catch(IOException e) { }
    }
    
    this.data.set(data);
    return this;
  }
  
  /**
   * {@inheritDoc}
   */
  @Override public String toString() {
    return this.data.get();
  }
  
}
