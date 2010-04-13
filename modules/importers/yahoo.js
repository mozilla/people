/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is People.
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *  Michael Hanson <mhanson@mozilla.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

let EXPORTED_SYMBOLS = ["YahooImportContinue"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://people/modules/utils.js");
Cu.import("resource://people/modules/ext/log4moz.js");
Cu.import("resource://people/modules/ext/Preferences.js");
Cu.import("resource://people/modules/people.js");
Cu.import("resource://people/modules/import.js");
Cu.import("resource://people/modules/ext/sha1.js");
Cu.import("resource://people/modules/ext/oauth.js");

let Prefs = new Preferences("extensions.mozillalabs.contacts.importers.yahoo.");

var MozillaLabsContactsConsumerKey = "dj0yJmk9OXRIeE1Bbk9qeUF5JmQ9WVdrOU9YRkhNWGxMTjJzbWNHbzlPVFF6TURRNE5EWTEmcz1jb25zdW1lcnNlY3JldCZ4PWI3";
var MozillaLabsContactsConsumerSecret = "49a19e581d1920b49fd4977e744f1bd16a22ad2c"; // shh, don't tell anybody.


function YahooContactsImporter() {
  this._log = Log4Moz.repository.getLogger("People.YahooContactsImporter");
  this._log.debug("Initializing importer backend for " + this.displayName);
};


/*<input type="button" value="term.ie"    onclick="getTokens('termie')"/>
<input type="button" value="madgex"     onclick="getTokens('madgex')"/>
<input type="button" value="mediamatic" onclick="getTokens('mediamatic')"/>
*/


var YahooOAuth = {
      consumerKey   : MozillaLabsContactsConsumerKey, 
      consumerSecret: MozillaLabsContactsConsumerSecret, 
      serviceProvider:
      { signatureMethod     : "PLAINTEXT"
        , requestTokenURL     : "https://api.login.yahoo.com/oauth/v2/get_request_token"
        , userAuthorizationURL: "https://api.login.yahoo.com/oauth/v2/request_auth"
        , accessTokenURL      : "https://api.login.yahoo.com/oauth/v2/get_token"
        , echoURL             : ""
        }
};

function getRequestToken(onComplete) {

    People._log.debug("Getting Yahoo request token");

    var message = {
        method: "POST", 
        action: "https://api.login.yahoo.com/oauth/v2/get_request_token",
        parameters: {
          oauth_signature_method: "PLAINTEXT",
          oauth_callback: "oob"
          // TODO xoauth_lang_pref
        }
    };
    var requestBody = OAuth.formEncode(message.parameters);
    OAuth.completeRequest(message, YahooOAuth);

    var authorizationHeader = OAuth.getAuthorizationHeader("", message.parameters);
    var requestToken = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);

    requestToken.onreadystatechange = function receiveRequestToken() {
        if (requestToken.readyState == 4) {
            var dump = requestToken.status+" "+requestToken.statusText
                  +"\n"+requestToken.getAllResponseHeaders()
                  +"\n"+requestToken.responseText + "\n";

            People._log.debug("Successful Yahoo requestToken: " + dump);
            var results = OAuth.decodeForm(requestToken.responseText);
            onComplete(results);
        }
    };
    requestToken.open(message.method, message.action, true); 
    requestToken.setRequestHeader("Authorization", authorizationHeader);
    requestToken.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    requestToken.send(requestBody);
}

function getAccessToken(onComplete, requestTokenResults, userToken)
{
  People._log.debug("Getting Yahoo access token: requestToken is " + JSON.stringify(requestTokenResults));

  YahooOAuth.serviceProvider.signatureMethod = "HMAC-SHA1";
  YahooOAuth.tokenSecret = OAuth.getParameter(requestTokenResults, "oauth_token_secret");
  
  message = {
    method: "POST", 
    action: YahooOAuth.serviceProvider.accessTokenURL,
    parameters: {
      oauth_signature_method: "HMAC-SHA1",
      oauth_verifier: userToken,
      oauth_token   : OAuth.getParameter(requestTokenResults, "oauth_token")
    }
  };
  OAuth.completeRequest(message, YahooOAuth);
  var requestBody = OAuth.formEncode(message.parameters);
  
  var requestAccess = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);

  requestAccess.onreadystatechange = function receiveAccessToken() {
      if (requestAccess.readyState == 4) {
        People._log.debug("Finished getting Yahoo! request token: " + requestAccess.status+" "+requestAccess.statusText
          +"\n"+requestAccess.getAllResponseHeaders());
          
        var results = OAuth.decodeForm(requestAccess.responseText);
        
        var oauth_token = OAuth.getParameter(results, "oauth_token");
        var oauth_token_secret = OAuth.getParameter(results, "oauth_token_secret");
        var oauth_session_handle = OAuth.getParameter(results, "oauth_session_handle");
        var xoauth_yahoo_guid = OAuth.getParameter(results, "xoauth_yahoo_guid");
        
        // Squirrel these away for later use...
        Prefs.set("oauth_token", oauth_token);
        Prefs.set("oauth_token_secret", oauth_token_secret);
        Prefs.set("oauth_session_handle", oauth_session_handle);
        Prefs.set("xoauth_yahoo_guid", xoauth_yahoo_guid);
          
      }
      onComplete();// with results..
  };
  requestAccess.open(message.method, message.action, true); 
  requestAccess.setRequestHeader("Authorization", OAuth.getAuthorizationHeader("", message.parameters));
  requestAccess.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
  requestAccess.send(requestBody);
}

var gSavedRequestTokenResults;
var gSavedProgressCallback;
var gSavedCompletionCallback;

YahooContactsImporter.prototype = {
  __proto__: ImporterBackend.prototype,
  get name() "Yahoo!",
  get displayName() "Yahoo! Addresses",
	get iconURL() "chrome://people/content/images/yahoo.png",

  import: function YahooImporter_import(completionCallback, progressFunction, window) {

    var that = this;
    this._log.debug("Importing Yahoo address book contacts into People store");

		// Look up saved Yahoo OAuth token password; if we don't have one, we'll need to ask the
    // user to go get one.
    if (Prefs.get("oauth_token")) {
      this.performImport(completionCallback, progressFunction, window);
    }
    else
    {
      getRequestToken(function(result) {
          var mainWindow = window.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                               .getInterface(Components.interfaces.nsIWebNavigation)
                               .QueryInterface(Components.interfaces.nsIDocShellTreeItem)
                               .rootTreeItem
                               .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                               .getInterface(Components.interfaces.nsIDOMWindow);
          gSavedRequestTokenResults = result;
          gSavedProgressCallback = progressFunction;
          gSavedCompletionCallback = completionCallback;
          mainWindow.gBrowser.addTab(OAuth.getParameter(result, "xoauth_request_auth_url"));
          
          // Create the completion UI:
          let div = window.document.createElementNS("http://www.w3.org/1999/xhtml", "div");
          div.appendChild(window.document.createTextNode("Please switch to the Yahoo! tab, log in, and enter the security code here: "));
          let input = window.document.createElementNS("http://www.w3.org/1999/xhtml", "input");
          input.setAttribute("type", "text");
          input.setAttribute("id", "yahooOAuthCode");
          let submit = window.document.createElementNS("http://www.w3.org/1999/xhtml", "input");
          submit.setAttribute("type", "submit");
          submit.setAttribute("value", "Continue");
          submit.theInput = input;
          submit.onClick = function() {YahooImportContinue(input)};
          submit.onclick = function() {YahooImportContinue(input)};
          div.appendChild(input);
          div.appendChild(submit);
          
          completionCallback({progressUI: div});
      });
    }
  },
  performImport: function YahooImporter_performImport(completionCallback, progressFunction, window)
  {
    var that = this;
    var token = Prefs.get("oauth_token");
    var userGUID = Prefs.get("xoauth_yahoo_guid");
    var tokenSecret = Prefs.get("oauth_token_secret");
    var targetURL = "http://social.yahooapis.com/v1/user/" + userGUID + "/contacts?format=json&count=max";

    YahooOAuth.serviceProvider.signatureMethod = "HMAC-SHA1";
    YahooOAuth.tokenSecret = tokenSecret;
    message = {
      method: "GET", 
      action: targetURL,
      parameters: {
        oauth_signature_method: "HMAC-SHA1",
        oauth_token   : token
      }
    };
    OAuth.completeRequest(message, YahooOAuth);

    People._log.debug("Requesting Yahoo! Contacts API");

    var contactRequest = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);
    contactRequest.onreadystatechange = function() {
      if (contactRequest.readyState == 4) {

        People._log.info("Yahoo Contacts API: " + contactRequest.status+" "+contactRequest.statusText
          +"\n"+contactRequest.getAllResponseHeaders());
        
        if (contactRequest.status == 401) {
          var headers = contactRequest.getAllResponseHeaders();
          if (headers.indexOf("oauth_problem=\"token_expired\"") > 0)
          {
            that.refreshToken(completionCallback, progressFunction);
          }
        }
        that.parseContactResult(contactRequest.responseText, completionCallback, progressFunction);
      }
    };
    contactRequest.open("GET", targetURL, true); 
    contactRequest.setRequestHeader("Authorization", OAuth.getAuthorizationHeader("yahooapis.com", message.parameters));
    contactRequest.send();
  },
  refreshToken: function refreshToken(completionCallback, progressFunction)
  {
    var that = this;
    var token = Prefs.get("oauth_token");
    var tokenSecret = Prefs.get("oauth_token_secret");
    var sessionHandle = Prefs.get("oauth_session_handle");

    People._log.info("Yahoo login: access token has expired; refreshing it");

    YahooOAuth.serviceProvider.signatureMethod = "HMAC-SHA1";
    YahooOAuth.tokenSecret = tokenSecret;
    let message = {
      method: "GET", 
      action: YahooOAuth.serviceProvider.accessTokenURL,
      parameters: {
        oauth_signature_method: "HMAC-SHA1",
        oauth_token   : token,
        oauth_session_handle : sessionHandle
      }
    };
    OAuth.completeRequest(message, YahooOAuth);

    var refreshRequest = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);
    refreshRequest.onreadystatechange = function() {
      if (refreshRequest.readyState == 4) {
        People._log.info("Yahoo access token refresh: " + refreshRequest.status+" "+refreshRequest.statusText
          +"\n"+refreshRequest.getAllResponseHeaders()+"\n"+refreshRequest.responseText);

        if (refreshRequest.status != 200) {
          People._log.info("Yahoo login: access token refresh attempt failed with " + refreshRequest.status);
					completionCallback({error:"login failed", message:"Unable to access Yahoo! using your saved information.  Try disconnecting and connecting again."});
        } else {
          People._log.info("Yahoo login: access token has been refreshed; requesting contacts");

          var results = OAuth.decodeForm(refreshRequest.responseText);
          var oauth_token = OAuth.getParameter(results, "oauth_token");
          var oauth_token_secret = OAuth.getParameter(results, "oauth_token_secret");
          var oauth_session_handle = OAuth.getParameter(results, "oauth_session_handle");
          var xoauth_yahoo_guid = OAuth.getParameter(results, "xoauth_yahoo_guid");
          Prefs.set("oauth_token", oauth_token);
          Prefs.set("oauth_token_secret", oauth_token_secret);
          Prefs.set("oauth_session_handle", oauth_session_handle);
          Prefs.set("xoauth_yahoo_guid", xoauth_yahoo_guid);
          that.performImport(completionCallback, progressFunction);
        }
      }
    };
    refreshRequest.open("GET", YahooOAuth.serviceProvider.accessTokenURL, true); 
    refreshRequest.setRequestHeader("Authorization", OAuth.getAuthorizationHeader("yahooapis.com", message.parameters));
    refreshRequest.send();
    
  },
  
  parseContactResult: function parseContactResult(resultText, completionCallback, progressFunction)
  {
    let people = [];
    let contactsReturn = JSON.parse(resultText);
    let anonCount = 1;
    
    People._log.info("Parsing Yahoo Contacts result");
    for each (let aContact in contactsReturn.contacts.contact)
    {
      try
      {
        let person = {};
        
        for each (let aField in aContact.fields)
        {
          if (aField.type == "name")
          {
            person.name = {};
            if (aField.value.givenName) person.name.givenName = aField.value.givenName;
            if (aField.value.familyName) person.name.familyName = aField.value.familyName;
            if (aField.value.middleName) person.name.middleName = aField.value.middleName;
            if (aField.value.prefix) person.name.prefix = aField.value.prefix;
            if (aField.value.suffix) person.name.suffix = aField.value.suffix;
          }
          else if (aField.type == "phone")
          {
            if (!person.phoneNumbers) person.phoneNumbers = [];
            let aPhone = {};
            aPhone.value = aField.value;
            if (aField.flags && aField.flags.length > 0) {
              aPhone.type = aField.flags[0].toLowerCase();
            } else {
              aPhone.type = "unlabeled";
            }
            person.phoneNumbers.push(aPhone);
          } 
          else if (aField.type == "address") 
          {
            if (!person.addresses) person.addresses = [];
            let anAddress = {};
            if (aField.value.street) anAddress.streetAddress = aField.value.street;
            if (aField.value.city) anAddress.locality = aField.value.city;
            if (aField.value.stateOrProvince) anAddress.region = aField.value.stateOrProvince;
            if (aField.value.postalCode) anAddress.postalCode = aField.value.postalCode;
            if (aField.value.country) anAddress.country = aField.value.country;
            if (aField.value.countryCode) anAddress.countryCode = aField.value.countryCode;
            if (aField.flags && aField.flags.length > 0) {
              anAddress.type = aField.flags[0].toLowerCase();
            } else {
              anAddress.type = "unlabeled";
            }
            person.addresses.push(anAddress);
          } 
          else if (aField.type == "email")
          {
            if (!person.emails) person.emails = [];
            let anEmail = {};
            anEmail.value = aField.value;
            if (aField.flags && aField.flags.length > 0) {
              anEmail.type = aField.flags[0].toLowerCase();
            } else {
              anEmail.type = "internet";
            }
            person.emails.push(anEmail);
          }
          else if (aField.type == "yahooid")
          {
            if (!person.accounts) person.accounts = [];
            person.accounts.push({type:"yahoo", username:aField.value, domain:"yahoo.com"});
          }
          else if (aField.type == "otherid")
          {
            if (aField.flags && aField.flags.length > 0) {
              var flag = aField.flags[0];
              var domain = null;
              var type = null;
              
              if (flag == "GOOGLE") {
                domain = "google.com";
                type = "google";
              } else if (flag == "ICQ") { 
                domain = "icq.com";
                type = "ICQ";
              } else if (flag == "JABBER") { 
                domain = "jabber";
                type = "Jabber";
              } else if (flag == "MSN") { 
                domain = "msn.com";
                type = "MSN";
              } else if (flag == "SKYPE") { 
                domain = "skype.com";
                type = "skype";
              } else {
                domain = flag.toLowerCase();
                type = flag.toLowerCase();
              }
              if (!person.accounts) person.accounts = [];
              person.accounts.push({type:type, username:aField.value, domain:domain});
            }
          }
          else if (aField.type == "link")
          {
            if (aField.flags && aField.flags.length > 0) {
              var flag = aField.flags[0];
              type = flag.toLowerCase();

              if (!person.urls) person.urls = [];
              person.urls.push({type:type, value:aField.value});
            }
          }
          else if (aField.type == "company")
          {
            if (!person.organizations) person.organizations = [{}];
            person.organizations[0].name = aField.value;
          }
          else if (aField.type == "jobTitle")
          {
            if (!person.organizations) person.organizations = [{}];
            person.organizations[0].title = aField.value;
          }
        }
      
        // Construct a display name:
        if (person.name) {
          if (person.name.givenName && person.name.familyName) {
            person.displayName = person.name.givenName + " " + person.name.familyName; // FIXME Eurocentric
          } else if (person.name.givenName) {
            person.displayName = person.name.givenName;
          } else if (person.name.familyName) {
            person.displayName = person.name.familyName;            
          }
        } else {
          person.name = {givenName:"", familyName:""};
        }
        
        if (!person.displayName && person.accounts) {
          for each (p in person.accounts) {
            if (p.domain == "yahoo.com") {
              person.displayName = p.username;
              break;
            }
          }
          if (!person.displayName) person.displayName = person.accounts[0].username;
        }
        if (!person.displayName && person.emails) {
          person.displayName = person.emails[0].value;
        }
        if (!person.displayName) {
          person.displayName = "Unnamed Yahoo Contact " + anonCount;
          anonCount += 1;
        }
        people.push(person);
      } catch (e) {
        People._log.info("Error importing Yahoo contact: " + e);
      }
    }
    this._log.info("Adding " + people.length + " Yahoo address book contacts to People store");
    People.add(people, this, progressFunction);
    completionCallback(null);  
  }
  
}
function YahooImportContinue(input)
{
  var token = input.value;
  getAccessToken(gSavedCompletionCallback, gSavedRequestTokenResults, token);
}

PeopleImporter.registerBackend(YahooContactsImporter);
