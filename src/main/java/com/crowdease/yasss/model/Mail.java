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

import java.util.Map;
import java.util.Map.Entry;

import com.crowdease.yasss.model.Mail.MailInstantiationException.InstantiationFailure;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.simplejavamail.api.email.Recipient;
import org.simplejavamail.api.mailer.Mailer;
import org.simplejavamail.api.mailer.config.TransportStrategy;
import org.simplejavamail.email.EmailBuilder;
import org.simplejavamail.mailer.MailerBuilder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import jakarta.mail.Message.RecipientType;

/**
 * Represents an email to be sent to some recipient.
 * 
 * @author Caleb L. Power
 */
public class Mail {
  
  private static final String BASE_TEMPLATE = "/mail/base.html";
  private static final String BLOCK_TEMPLATE = "/mail/blocks/%1$s.html";
  private static final String CONTENT_TEMPLATE = "/mail/content/%1$s.json";
  private static final Logger logger = LoggerFactory.getLogger(Mail.class);
  
  private static Mailer mailer = null;
  private static Recipient sender = null;

  public static void instantiate(String smtpHost, int smtpPort, String smtpUser, String smtpPass, String senderAddr, String senderName) {
    Mail.mailer = MailerBuilder
      .withSMTPServer(smtpHost, smtpPort, smtpUser, smtpPass)
      .withTransportStrategy(TransportStrategy.SMTP_TLS)
      .withDebugLogging(true)
      .withThreadPoolSize(20)
      .buildMailer();
    Mail.sender = new Recipient(senderName, senderAddr, null);
  }
  
  private String recipient = null;
  private String subject = null;
  private String body = null;
  private String replyTo = null;
  
  /**
   * Instantiates a piece of mail from a hard-coded template.
   * 
   * @param recipient the individual that the mail is being sent to
   * @param template the email template to be used
   * @param args a map of arguments to replace parameters in the body
   */
  public Mail(String recipient, String template, Map<String, String> args) {
    this(recipient, template, args, null);
  }
  
  /**
   * Instantiates a piece of mail from a hard-coded template.
   * 
   * @param recipient the individual that the mail is being sent to
   * @param template the email template to be used
   * @param args a map of arguments to replace parameters in the body
   * @param replyTo the email address that responses should be sent to i.e. in
   *        the event that this email originates from a contact form
   */
  public Mail(String recipient, String template, Map<String, String> args, String replyTo) {
    this.replyTo = replyTo;
    
    this.body = new DiskResource(BASE_TEMPLATE).read().toString();
    if(this.body == null) throw new MailInstantiationException(
        InstantiationFailure.TEMPLATE_NOT_FOUND,
        "Missing base template %1$s.",
        BASE_TEMPLATE);
    
    String contentTemplate = String.format(CONTENT_TEMPLATE, template);
    String contentResource = new DiskResource(contentTemplate).read().toString();
    if(contentResource == null) throw new MailInstantiationException(
        InstantiationFailure.TEMPLATE_NOT_FOUND,
        "Missing content template %1$s.",
        contentTemplate);
    
    try {
      StringBuilder contentBuilder = new StringBuilder();
      JSONObject contentObj = new JSONObject(contentResource);
      this.subject = contentObj.getString("subject");
      this.recipient = recipient;
      
      // Step 1: Build the blocks from hard-coded resources.
      JSONArray blockArr = contentObj.getJSONArray("blocks");
      for(int i = 0; i < blockArr.length(); i++) { // iterate through each block
        JSONObject blockObj = blockArr.getJSONObject(i);
        String blockTemplate = String.format(BLOCK_TEMPLATE, blockObj.getString("type"));
        String blockResource = new DiskResource(blockTemplate).read().toString();
        
        if(blockResource == null) throw new MailInstantiationException(
            InstantiationFailure.TEMPLATE_NOT_FOUND,
            "Missing block template %1$s.",
            BLOCK_TEMPLATE);
        
        for(String key : blockObj.keySet()) { // go through each key (skip the type-- we already used it)
          if(key.equalsIgnoreCase("type")) continue;
          
          StringBuilder blockContent = new StringBuilder();
          Object blockLine = blockObj.get(key);
          
          if(blockLine instanceof JSONArray) { // this has several paragraphs or something
            JSONArray blockLineArr = (JSONArray)blockLine;
            
            for(int j = 0; j < blockLineArr.length(); j++) { // go through each paragraph
              if(j > 0) blockContent.append("<br /><br />");
  
              Object blockLineItem = blockLineArr.get(j);
              if(blockLineItem instanceof JSONArray) { // this is a phrase in a paragraph
                JSONArray blockPhraseArr = (JSONArray)blockLineItem;
                for(int k = 0; k < blockPhraseArr.length(); k++) { // concatenate phrases, delimit by a space
                  if(k > 0) blockContent.append(' ');
                  blockContent.append(blockPhraseArr.getString(k));
                }
              } else blockContent.append((String)blockLineItem); // this is a single-line paragraph
              
            }
          } else blockContent.append((String)blockLine); // this is a single line
          
          blockResource = blockResource.replace( // add the keyed content to the block template
              String.format("[[%1$s]]", key.toUpperCase()),
              blockContent.toString());
        }
        
        contentBuilder.append(blockResource); // add the block to the base template
      }
      
      this.body = this.body.replace("[[BLOCKS]]", contentBuilder.toString());
    } catch(ClassCastException | JSONException e) {
      throw new MailInstantiationException(InstantiationFailure.TEMPLATE_MALFORMED, e, "A template could not be parsed.");
    }
    
    // Step 2: Replace template parameters with user-specified arguments.
    for(Entry<String, String> arg : args.entrySet()) {
      String var = String.format("[[%1$s]]", arg.getKey().toUpperCase());
      this.subject = this.subject.replace(var, arg.getValue());
      this.body = this.body.replace(var, arg.getValue());
    }
    
    // Step 3: Make sure that any substitutions of the subject in the body are made.
    this.body = this.body.replace("[[SUBJECT]]", this.subject);
  }
  
  /**
   * Instantiates a piece of mail.
   * 
   * @param recipient the individual that the mail is being sent to
   * @param subject the subject of the letter
   * @param body the body of the letter
   * @param args a map of arguments to replace parameters in the body
   */
  public Mail(String recipient, String subject, String body, Map<String, String> args) {
    this.recipient = recipient;
    this.subject = subject;
    this.body = body;
    for(Entry<String, String> arg : args.entrySet()) {
      String var = String.format("\\[\\[%1$s\\]\\]", arg.getKey());
      this.subject = this.subject.replaceAll(var, arg.getValue());
      this.body = this.body.replaceAll(var, arg.getValue());
    }
  }
  
  /**
   * Retrieves the address of the individual that the mail is being sent to.
   * 
   * @return the recipient's email address
   */
  public String getRecipient() {
    return recipient;
  }
  
  /**
   * Retrieves the subject of the letter.
   * 
   * @return the email subject
   */
  public String getSubject() {
    return subject;
  }
  
  /**
   * Retrieves the body of the letter, with all parameters replaced with the
   * arguments provided at instantiation.
   * 
   * @return body;
   */
  public String getBody() {
    return body;
  }
  
  /**
   * Retrieves the reply-to email (the target of any response to this email),
   * to be used in the event that this email originates from i.e. a contact
   * form submission. If {@code null}, use the default reply-to address.
   * 
   * @return the reply-to email address if specified, or {@code null} if the
   *         default should be used
   */
  public String getReplyTo() {
    return replyTo;
  }

  public void send() {
    if(null == mailer) {
      logger.warn("mailer not instantiated (check config?)");
      return;
    }
    
    var email = EmailBuilder.startingBlank()
      .from(sender)
      .to(new Recipient(null, recipient, RecipientType.TO))
      .withSubject(subject)
      .withHTMLText(body)
      .withPlainText("Please consider reading this email in a modern mail client. Thank you!");
    if(null != replyTo)
      email.withReplyTo(replyTo);
    mailer.sendMail(email.buildEmail());
  }
  
  /**
   * Indicates that a piece of mail could not be instantiated.
   * 
   * @author Caleb L. Power
   */
  public static class MailInstantiationException extends RuntimeException {
    private static final long serialVersionUID = 3175182501289633765L;

    /**
     * The reason why a failure occurred.
     * 
     * @author Caleb L. Power
     */
    public static enum InstantiationFailure {
      /**
       * The failure was caused by a missing template file.
       */
      TEMPLATE_NOT_FOUND,
      
      /**
       * The failure was caused by a malformed template file.
       */
      TEMPLATE_MALFORMED;
      
      @Override public String toString() {
        return name().replace('_', ' ');
      }
    }
    
    private MailInstantiationException(InstantiationFailure culprit, String message, Object... args) {
      super(
          String.format(
              "%1$s: %2$s",
              culprit.toString(),
              String.format(
                  message,
                  (Object[])args)));
    }
    
    private MailInstantiationException(InstantiationFailure culprit, Throwable cause, String message, String... args) {
      super(
          String.format(
              "%1$s: %2$s",
              culprit.toString(),
              String.format(
                  message,
                  (Object[])args))
          + (cause.getMessage() == null
             ? ""
             : String.format(
                 " (%1$s)",
                 cause.getMessage())),
          cause);
    }
  }
  
}
