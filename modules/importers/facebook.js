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

let COMPLETION_URI = "http://mozillalabs.com/contacts/__signincomplete";

var MozillaLabsContactsAPIKey = "873bb1ddcc201222004c053a25d07d12";
var MozillaLabsContactsApplicationSecret = "5a931183e640fa50ca93b0ab556eb949";
var MozillaLabsContactsApplicationID = "110879292285085";

var gLogger = Log4Moz.repository.getLogger("People.FacebookImporter");

var gAuthParams = {
	'scope': 'friends_birthday,friends_online_presence,friends_photos,friends_photo_video_tags,friends_website',
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
            if (splitName.length > 2) {
              person.name.middleName = splitName[1];
              person.name.familyName = splitName.slice(2).join(" ");
            } else {
              person.name.familyName = splitName.slice(1).join(" ");
            }
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
          this.startFacebookDiscovery(fbid, "root", completionCallback, progressCallback);
        }
      }
    }
    for each (let account in forPerson.getProperty("accounts")) {
      if (account.domain.indexOf("facebook") >= 0) {
        let fbid = account.userid ? account.userid : account.username;
        if (fbid) {
          this.startFacebookDiscovery(fbid, "root", completionCallback, progressCallback);
        }
      }
    }
  },
  
  startFacebookDiscovery : function startFacebookDiscovery(fbid, type, completionCallback, progressCallback) {
    try {
      progressCallback({initiate:"Facebook:"+ type + ":" + fbid, msg:"Resolving Facebook profile for " + fbid});
      let self = this;
      function facebookDiscovery(svc) {
        self.createFacebookDiscoveryHandler(svc, fbid, type, completionCallback, progressCallback);
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
  
  createFacebookDiscoveryHandler : function(svc, id, type, completionCallback, progressCallback) {
    let call = {
      action: "https://graph.facebook.com/" + id,
      method: "GET",
      parameters: {}
    }
    let self = this;
    OAuthConsumer.call(svc, call, function FacebookDiscovererCallHandler(req) {
      self.handleResponse(req, id, type, completionCallback, progressCallback);
    });
  },
  
  handleResponse: function(req, id, type, completionCallback, progressCallback) {
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
                
                let label = "URL";
                try {
                  let parsedURI = IO_SERVICE.newURI(site, null, null);
                  let host = parsedURI.host;
                  if (host.indexOf("www.") == 0) host = host.substring(4);
                  label = host;
                } catch (e) {
                }
                newPerson.urls.push({type:label, value:site})
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
          completionCallback(newPerson, "Facebook:root:" + id);
          break;
        }
      } else {
        this._log.info("Error while accessing Facebook friend profile: " + req.responseText);
        let response = JSON.parse(req.responseText);
        if (response.error.type == "OAuthException")
          this.oauthHandler.reauthorize(); // TODO There _may_ be a very subtle re-entrancy bug hiding in here, if two pages try to reauth simultaneously
        else
          completionCallback({error:"API Error", message:"Error while accessing Facebook friend list: " + req.status+": "+req.responseText});
    }
  }
}


function FacebookGraphLoader() {

}

FacebookGraphLoader.prototype = 
{
  startFacebookGraphLoad : function startFacebookGraphLoad(objectID, connectionLabel, callback) {
    try {
      let self = this;
      function facebookGraphLoad(svc) {
        self.createFacebookGraphHandler(svc, objectID, connectionLabel, callback);
      }
      this.oauthHandler = OAuthConsumer.authorize('facebook',
        MozillaLabsContactsApplicationID,
        MozillaLabsContactsApplicationSecret,
        COMPLETION_URI,
        facebookGraphLoad,
        gAuthParams,
        "contacts@labs.mozilla.com");
    } catch (e) {
    }
  },

  createFacebookGraphHandler: function(svc, objectID, connectionLabel, callback) {
    let call = {
      action: "https://graph.facebook.com/" + objectID + "/" + connectionLabel,
      method: "GET",
      parameters: {}
    }
    let self = this;
    OAuthConsumer.call(svc, call, function FacebookDiscovererCallHandler(req) {
      self.handleResponse(req, objectID, callback);
    });
  },
  
  handleResponse: function(req, objectID, callback) {
    if (req.readyState != 4) {
        this._log.debug("Request response not handled, state "+req.readyState);
        return;
    }
    dump("Got Facebook response - " + req.responseText.length + " bytes\n");
    if (req.status == 401) {
      this._log.info("Received 401 error while accessing Facebook; renewing access token");
      this.oauthHandler.reauthorize();
    } else if (req.status == 200) {
      let response = JSON.parse(req.responseText);
      callback(response.data);
    }
  }
};

// Note that we do not include the account ID with these service bundles.
// That means that we will explicitly only identify one facebook account
// per person.  If the person has more than one, the first one wins. 
// This is currently believed to be a better user experience than including
// two different facebook IDs which are actually the same person.

function constructFacebookPicturesOfService(account) {
  return {
    identifier: "facebook:picturesOf",
    methodName: "picturesOf",
    method: function(callback) {
      let fb = new FacebookGraphLoader();
      let id = (account.username ? account.username : account.userid);
      fb.startFacebookGraphLoad(id, "photos", function(result) {
        // normalize to standard photo API
        for each (let photo in result) {
          photo.photoThumbnailURL = photo.picture;
          photo.name = photo.title;
          photo.homeURL = photo.link;          
        }
        callback(result);
      });
    }
  };
}

function constructFacebookPicturesByService(account) {
  return {
    identifier: "facebook:pictureCollectionsBy", 
    methodName: "pictureCollectionsBy",
    method: function(callback) {
      let fb = new FacebookGraphLoader();
      let id = (account.username ? account.username : account.userid);
      fb.startFacebookGraphLoad(id, "albums", function(result) {
        // Decorate result set with getPhotos method
        for each (let coll in result) {
          let theID = coll.id;
          coll.getPhotos = function(getPhotoCallback) {
            new FacebookGraphLoader().startFacebookGraphLoad(theID, "photos", getPhotoCallback);
          };
          coll.primaryPhotoURL = coll.link;

          // no easy way to get the primary photo thumbnail, unfortunately
          // coll.primaryPhotoThumbnailURL = 
          coll.homeURL = coll.link;
          
        }
        callback(result);
      });
    }
  };
}

function constructFacebookUpdatesService(account) {
  return {
    identifier: "facebook:updates",
    methodName: "updates",
    method: function(callback) {
      let fb = new FacebookGraphLoader();
      let id = (account.username ? account.username : account.userid);
      fb.startFacebookGraphLoad(id, "feed", function(result) {
        // normalize to standard updates API
        let output = [];
        for each (let update in result) {
          if (update.from.id == id) {
            output.push(update);
            if (update.message) {
              update.text = update.message;
            } else if (update.caption) {
              update.text = update.caption;            
            } else if (update.name) {
              update.text = update.name;
            }
            update.source = "Facebook";
            update.sourceLink = "http://www.facebook.com/" + (account.username ? account.username : ("profile.php?id=" + account.userid));
            update.time = new Date(update.created_time.replace("+0000", "Z"));
          }
        }
        callback(output);
      });
    }
  };
}


PeopleImporter.registerDiscoverer(FacebookDiscoverer);
PeopleImporter.registerBackend(FacebookImporter);
PersonServiceFactory.registerAccountService("facebook.com", constructFacebookPicturesOfService);
PersonServiceFactory.registerAccountService("facebook.com", constructFacebookPicturesByService);
PersonServiceFactory.registerAccountService("facebook.com", constructFacebookUpdatesService);
