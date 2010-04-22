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

let EXPORTED_SYMBOLS = [];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://people/modules/utils.js");
Cu.import("resource://people/modules/ext/log4moz.js");
Cu.import("resource://people/modules/ext/md5.js");
Cu.import("resource://people/modules/people.js");
Cu.import("resource://people/modules/import.js");
let IO_SERVICE = Cc["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);

function GoogleSocialGraphDiscoverer() {
  this._log = Log4Moz.repository.getLogger("People.GoogleSocialGraphDiscoverer");
  this._log.debug("Initializing importer backend for " + this.displayName);
};

GoogleSocialGraphDiscoverer.prototype = {
  __proto__: DiscovererBackend.prototype,
  get name() "GoogleSocialGraph",
  get displayName() "Google Social Graph API",
	get iconURL() "",
  
 explainString : function explainString() {
    return "From searching for this contact with the <a href=\"http://code.google.com/apis/socialgraph/docs/\">Google Social Graph</a>";
  },

  discover: function GoogleSocialGraphDiscoverer_discover(forPerson, completionCallback, progressFunction) {
    var query = "";
    
    for each (let email in forPerson.getProperty("emails")) {
      if (query.length) query += ",";
      query += email.value;
    }
    for each (let url in forPerson.getProperty("urls")) {
      if (query.length) query += ",";
      query += url.value;
    }
    /* not clear how to use these yet.
    for each (let account in forPerson.getProperty("accounts")) {
      if (query.length) query += "&";
      query += account.value;
    }*/
    
    // TODO: Make more than one call if the list of emails and urls is too long

    if (query.length > 0) {
      try
      {
        progressFunction({initiate:"GoogleSocialGraph", msg:"Searching Google Social Graph for e-mail and URLs"});
        People._log.debug("Performing Google Social Graph API call with " + query);
        var apiCall = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);  
        apiCall.open('GET', "http://socialgraph.apis.google.com/otherme?q=" + query, true);
        apiCall.onreadystatechange = function (aEvt) {
          let newPerson = null;
          if (apiCall.readyState == 4) {
            if (apiCall.status != 200) {
              People._log.debug("Result code " + apiCall.status + " while contacting Google Social Graph API");
              progressFunction("Error while accessing Google Social Graph API");
            } else {
              var result = JSON.parse(apiCall.responseText);
              
              for (key in result) {
                if (!newPerson) newPerson = {};
                try {
                  if (newPerson.urls == undefined) newPerson.urls =[];
                  let val = result[key];
                  if (key.indexOf("mailto:") == 0) {
                    if (newPerson.emails == undefined) newPerson.emails = [];
                    newPerson.emails.push({value:key.slice(7), type:"internet"});
                  } 
                  else if (key.indexOf("tel:") == 0) {
                    if (newPerson.phoneNumbers == undefined) newPerson.phoneNumbers = [];
                    newPerson.phoneNumbers.push({value:key.slice(4), type:"phone"});
                  } 
                  else 
                  {
                    let obj = {};
                    
                    // Pull the URL's hostname, remove trailing 'www.', and make that the type
                    try {
                      let parsedURI = IO_SERVICE.newURI(key, null, null);
                      let hostName = parsedURI.host;
                      if (hostName.indexOf("www.") == 0) hostName = hostName.slice(4);
                      obj.type = hostName;
                    } catch (e) {}
                    if (!obj.type) obj.type = "URL";
                    obj.value = key;
                    // TODO rel?
                    
                    processAttributes(result[key], obj, newPerson);                  
                    newPerson.urls.push(obj);
                  }
                } catch (e) {
                  People._log.warn("Error while handling Google Social Graph lookup: " + e);
                  progressFunction("Error while handling Google Social Graph lookup: " + e);
                }
              }
            }
            completionCallback(newPerson, "GoogleSocialGraph");
          }
        }
        apiCall.send(null);
      } catch (e) {
        if (e != "DuplicatedDiscovery") {
          People._log.info("Error while starting Google Social Graph lookup: " + e);
          progressFunction("Error while starting Google Social Graph lookup: " + e);
        }
      }
    }
  }
};

function processAttributes(input, obj, newPerson)
{
  if (input.attributes) {
    for (let attr in input.attributes) {
      let val = input.attributes[attr];
      if (attr == "url") {
        obj.value = val;
      } else if (attr == "photo") {
        // Couple special cases.
        if (val.indexOf("facebook.com") >= 0) continue; // Google has lots of stale Facebook data.
        
        if (newPerson.photos == undefined) newPerson.photos = [];
        newPerson.photos.push({type:"profile", value:val});
      } else if (attr == "adr") {
        if (newPerson.addresses == undefined) newPerson.addresses = [];
        newPerson.addresses.push({value:val});
      } else if (attr == "fn") {
        if (newPerson.name == undefined) newPerson.name = {};
        var name = val;
        if (name.indexOf(" ") > 0) {
          var splitName = name.split(" ");
          if (!newPerson.name.givenName) newPerson.name.givenName = splitName[0];
          if (!newPerson.name.familyName) newPerson.name.familyName = splitName.slice(1).join(" ");
        } else {
          if (!newPerson.name.givenName) newPerson.name.givenName = val;
        }
      } else {
       obj[attr] = val;
      }
    }
  }
}


PeopleImporter.registerDiscoverer(GoogleSocialGraphDiscoverer);

