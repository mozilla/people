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
Cu.import("resource://people/modules/ext/Preferences.js");
Cu.import("resource://people/modules/people.js");
Cu.import("resource://people/modules/import.js");
Cu.import("resource://people/modules/oauthbase.js");

var MozillaLabsContactsConsumerKey = "dj0yJmk9OXRIeE1Bbk9qeUF5JmQ9WVdrOU9YRkhNWGxMTjJzbWNHbzlPVFF6TURRNE5EWTEmcz1jb25zdW1lcnNlY3JldCZ4PWI3";
var MozillaLabsContactsConsumerSecret = "49a19e581d1920b49fd4977e744f1bd16a22ad2c"; // shh, don't tell anybody.
var COMPLETION_URI = "http://contacts.oauth.local/";

function YahooContactsImporter() {
  this._log = Log4Moz.repository.getLogger("People.YahooContactsImporter");
  this._log.debug("Initializing importer backend for " + this.displayName);
};

YahooContactsImporter.prototype = {
  __proto__: OAuthBaseImporter.prototype,
  get name() "yahoo",
  get displayName() "Yahoo! Addresses",
  get iconURL() "chrome://people/content/images/yahoo.png",
	getPrimaryKey: function (person){
		return person.accounts[0].username;
	},

  completionCallback: null,
  progressCallback: null,
  oauthHandler: null,
  authParams: null,
  consumerToken: MozillaLabsContactsConsumerKey,
  consumerSecret: MozillaLabsContactsConsumerSecret,
  redirectURL: COMPLETION_URI,
  
  action: null,
  get message() {
    return {
      action: this.action,
      method: "GET",
      parameters: {'format': 'json', 'count': 'max'}
    }
  },

  doImport: function YahooContactsImporter_doImport(svc) {
    var userGUID = svc.accessParams["xoauth_yahoo_guid"];
    this.action = "http://social.yahooapis.com/v1/user/" + userGUID + "/contacts";
    OAuthBaseImporter.prototype.doImport.apply(this, [svc]);
  },

  handleResponse: function YahooContactsImporter_handleResponse(req)
  {
    if (req.status == 401) {
      var headers = req.getAllResponseHeaders();
      if (headers.indexOf("oauth_problem=\"token_expired\"") > 0)
      {
	this.oauthHandler.reauthorize();
	return;
      }
      this.completionCallback({error:"API Error", message:"Error while accessing Yahoo! Contacts: " + req.status+": "+req.responseText});
      return;
    }

    let people = [];
    let contactsReturn = JSON.parse(req.responseText);
    let anonCount = 1;
    
    this._log.info("Parsing Yahoo Contacts result: "+req.responseText);
    for each (let aContact in contactsReturn.contacts.contact)
    {
      try
      {
        let person = {};
        person.tags = ["Yahoo!"];
        
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
        this._log.info("Error importing Yahoo contact: " + e);
      }
    }
    this._log.info("Adding " + people.length + " Yahoo address book contacts to People store");
    People.add(people, this, this.progressCallback);
    this.completionCallback(null);  
  }
  
}

PeopleImporter.registerBackend(YahooContactsImporter);
