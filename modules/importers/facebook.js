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

/* Note that Facebook is both an Importer and a Discoverer. */

let EXPORTED_SYMBOLS = [];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://oauthorizer/modules/oauthconsumer.js");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://people/modules/utils.js");
Cu.import("resource://people/modules/ext/log4moz.js");
Cu.import("resource://people/modules/ext/Preferences.js");
Cu.import("resource://people/modules/ext/resource.js");
Cu.import("resource://people/modules/people.js");
Cu.import("resource://people/modules/import.js");
Cu.import("resource://people/modules/oauthbase.js");
let IO_SERVICE = Cc["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);

let Prefs = new Preferences("extensions.mozillalabs.contacts.importers.facebook.");

let COMPLETION_URI = "http://mozillalabs.com/contacts/__signincomplete";

var MozillaLabsContactsAPIKey = "873bb1ddcc201222004c053a25d07d12";
var MozillaLabsContactsApplicationSecret = "5a931183e640fa50ca93b0ab556eb949";
var MozillaLabsContactsApplicationID = "110879292285085";

var gLogger = Log4Moz.repository.getLogger("People.FacebookImporter");

var gAuthParams = {
	'scope': 'friends_birthday,friends_online_presence,friends_photos,friends_website',
	'type': "user_agent",
	'display': "popup"
	};

function FacebookImporter() {
  this._log = gLogger;
  this._log.debug("Initializing importer backend for " + this.displayName);
};
FacebookImporter.prototype = {
  __proto__: OAuthBaseImporter.prototype,
  get name() "facebook",
  get displayName() "Facebook",
  get iconURL() "chrome://people/content/images/facebook.png",

  completionCallback: null,
  progressCallback: null,
  oauthHandler: null,
  authParams: gAuthParams,
  consumerToken: MozillaLabsContactsApplicationID,
  consumerSecret: MozillaLabsContactsApplicationSecret,
  redirectURL: COMPLETION_URI,
  get message() {
    return {
      action: "https://graph.facebook.com/me/friends",
      method: "GET",
      parameters: {}
    }
  },

  handleResponse: function FacebookImporter_handleResponse(req, svc) {
    if (req.readyState == 4) {
      if (req.status == 200) {
        let response = JSON.parse(req.responseText);
        let people = [];
        for each (let fbPerson in response.data)
        {
          let person = {};
          person.tags = ["Facebook"];
          person.accounts = [{domain:"facebook.com", userid:fbPerson.id}];
          person.displayName = fbPerson.name;
          var splitName = person.displayName.split(" ");
          if (splitName.length > 1) {
            person.name = {};
            person.name.givenName = splitName[0];
            person.name.familyName = splitName.slice(1).join(" ");
          }
          person.photos = [
            {type:"thumbnail", value:"https://graph.facebook.com/" + fbPerson.id + "/picture?type=square"},
            {type:"profile", value:"https://graph.facebook.com/" + fbPerson.id + "/picture?type=large"}
          ];
          
          people.push(person);
        }
        People.add(people, this, this.progressCallback);
        this.completionCallback(null);
      } else if (req.status == 401) {
        // expired, go refresh it
        this.oauthHandler.reauthorize();
      } else {
        gLogger.info("Error while accessing Facebook friend list: " + req.responseText);
        let response = JSON.parse(req.responseText);
        if (response.error.type == "OAuthException")
          this.oauthHandler.reauthorize();
        else
          this.completionCallback({error:"API Error", message:"Error while accessing Facebook friend list: " + req.status+": "+req.responseText});
      }
    }
  }

}


//*********************************************************************************************************
//*********************************************************************************************************
//*********************************************************************************************************
//*********************************************************************************************************


function FacebookDiscoverer() {
  this._log = Log4Moz.repository.getLogger("People.FacebookDiscoverer");
  this._log.debug("Initializing discovery backend for " + this.displayName);
};

FacebookDiscoverer.prototype = {
  __proto__: DiscovererBackend.prototype,
  get name() "Facebook",
  get displayName() "Facebook Profile Discovery",
  get iconURL() "chrome://people/content/images/facebook.png",
  get description() "Finds data on Facebook.com for a contact if their Facebook user ID is known, combining public data with private data that your account is allowed to read.",

  completionCallback: null,
  progressCallback: null,
  oauthHandler: null,
  call: {
    action: null,
    method: "GET",
    parameters: {}
  },

  discover: function FacebookDiscoverer_discover(forPerson, completionCallback, progressCallback) {
    this.progressCallback = progressCallback;
    this.completionCallback = completionCallback;

    // Look for urls and accounts that reference a Facebook ID
    for each (let link in forPerson.getProperty("urls")) {
      if (link.type.indexOf("facebook") >= 0 || link.value.indexOf("facebook") >= 0) {
        // Deal with the various sorts of Facebook URLs that are out in the wild.
        // These include:
        //  http://[www.]facebook.com/<username>
        //  http://[www.]facebook.com/people/<displayname>/<userid>
        //  http://[www.]facebook.com/profile.php?id=<userid>
        
        // TODO work on this, profile isn't working right
        let re = RegExp("http://(www\\.)?facebook.com/(people/([^/]+)/(.*)|profile\\.php\\?id=(.*)|([^/]*))", "gi"); 
        let result = re.exec(link.value);
        if (result) {
          let fbid;
          if (result[6]) {
            fbid = result[6];
          }
          else if (result[5]) {
            fbid = result[5];
          }
          else if (result[4]) {
            fbid = result[4];
          }
          else {
            this._log.info("Couldn't figure out how to parse Facebook URL: " + link.value);
            continue;
          }
          this.startFacebookDiscovery(fbid, "root");
        }
      }
    }
    for each (let account in forPerson.getProperty("accounts")) {
      if (account.domain.indexOf("facebook") >= 0) {
        let fbid = account.userid ? account.userid : account.username;
        if (fbid) {
          this.startFacebookDiscovery(fbid, "root");
        }
      }
    }
  },
  
  startFacebookDiscovery : function startFacebookDiscovery(fbid, type) {
    try {
      this.progressCallback({initiate:"Facebook:"+ type + ":" + fbid, msg:"Resolving Facebook profile for " + fbid});
      let self = this;
      function facebookDiscovery(svc) {
	self.createFacebookDiscoveryHandler(svc, fbid, type);
      }
      this.oauthHandler = OAuthConsumer.authorize('facebook',
			    MozillaLabsContactsApplicationID,
			    MozillaLabsContactsApplicationSecret,
			    COMPLETION_URI,
			    facebookDiscovery,
			    gAuthParams,
			    "contacts@labs.mozilla.com");
    } catch (e) {
      if (e != "DuplicatedDiscovery") {
        this._log.info("Error while looking up Facebook profile: " + e);
      }
    }
  },
  
  createFacebookDiscoveryHandler : function(svc, id, type) {
    this.call.action = "https://graph.facebook.com/" + id;
    let self = this;
    OAuthConsumer.call(svc, this.call, function FacebookDiscovererCallHandler(req) {
      self.handleResponse(req, id, type);
    });
  },
  
  handleResponse: function(req, id, type) {
      if (req.readyState != 4) {
          this._log.debug("Request response not handled, state "+req.readyState);
	  return;
      }
      if (req.status == 401) {
	this._log.info("Received 401 error while accessing Facebook; renewing access token");
	this.oauthHandler.reauthorize();
      } else if (req.status == 200) {
	let response = JSON.parse(req.responseText);
	
	switch (type) {
	  case "root":
	    let newPerson = {};
	    if (response.name) newPerson.displayName = response.name;
	    if (response["first_name"]) {
	      if (!newPerson.name ) newPerson.name={};
	      newPerson.name.givenName = response["first_name"];
	    }
	    if (response["last_name"]) {
	      if (!newPerson.name) newPerson.name={};
	      newPerson.name.familyName = response["last_name"];
	    }
	    if (response.birthday) {
	      newPerson.birthday = response.birthday;
	    }
	    if (response.about) {
	      newPerson.notes = [{type:"About", value:response.about}];
	    }
	    if (response.website) {
	      var websites = response.website.split("\n");
	      for each (var site in websites) {
		if (!newPerson.urls) newPerson.urls = [];
		
		if (site.length > 0) {
		  if (site.indexOf("http://") != 0) {
		    site = "http://" + site;
		  }
		  newPerson.urls.push({type:"URL", value:site})
		}
	      }
	    }
	    
	    var username=null;
	    if (response.link) {
	      if (!newPerson.urls) newPerson.urls = [];
	      newPerson.urls.push({type:"facebook.com", value:response.link});

	      var lastIdx = response.link.lastIndexOf("/");
	      username = response.link.slice(lastIdx+1);
	      if (username.indexOf("profile.php?id=") == 0) username = username.slice(15);

	      newPerson.accounts = [{domain:"facebook.com", username:username}];
	    }
	    newPerson.photos = [
	      {type:"thumbnail", value:"https://graph.facebook.com/" + (username ? username : id) + "/picture?type=square"},
	      {type:"profile", value:"https://graph.facebook.com/" + (username ? username : id) + "/picture?type=large"}
	    ];
	    this.completionCallback(newPerson, "Facebook:root:" + id);
	    break;
	}
      } else {
	this._log.info("Error while accessing Facebook friend profile: " + req.responseText);
	let response = JSON.parse(req.responseText);
	if (response.error.type == "OAuthException")
	  this.oauthHandler.reauthorize();
	else
	  this.completionCallback({error:"API Error", message:"Error while accessing Facebook friend list: " + req.status+": "+req.responseText});
      }
  }
}

PeopleImporter.registerDiscoverer(FacebookDiscoverer);
PeopleImporter.registerBackend(FacebookImporter);
