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

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://people/modules/utils.js");
Cu.import("resource://people/modules/ext/log4moz.js");
Cu.import("resource://people/modules/ext/Preferences.js");
Cu.import("resource://people/modules/ext/resource.js");
Cu.import("resource://people/modules/people.js");
Cu.import("resource://people/modules/import.js");
let IO_SERVICE = Cc["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);

let Prefs = new Preferences("extensions.mozillalabs.contacts.importers.facebook.");

let COMPLETION_URI = "http://mozillalabs.com/contacts/__signincomplete";

var MozillaLabsContactsAPIKey = "873bb1ddcc201222004c053a25d07d12";
var MozillaLabsContactsApplicationSecret = "5a931183e640fa50ca93b0ab556eb949";
var MozillaLabsContactsApplicationID = "110879292285085";

var gLogger = Log4Moz.repository.getLogger("People.FacebookImporter");

function FacebookImporter() {
  this._log = gLogger;
  this._log.debug("Initializing importer backend for " + this.displayName);
};

function parseQueryString(str)
{
  var vars = str.split("&");
  var ret ={};
  for (var i = 0; i < vars.length; i++) {
    var pair = vars[i].split("=");
    ret[pair[0]] = pair[1];
  }
  return ret;
}

var gOAuthCompletionListener = {
  QueryInterface: function(aIID) {
     if (aIID.equals(Components.interfaces.nsIWebProgressListener) ||
         aIID.equals(Components.interfaces.nsISupportsWeakReference) ||
         aIID.equals(Components.interfaces.nsISupports))
       return this;
     throw Components.results.NS_NOINTERFACE;
  },

  onLocationChange: function(aProgress, aRequest, aURI) {
    if (aURI) {
      let spec = aURI.spec;
      if (spec.indexOf(COMPLETION_URI) == 0) {
        var query = parseQueryString(aURI.spec.split("?")[1]);
        if (query.code) {
          Prefs.set("oauth_code", query.code);
          aProgress.DOMWindow.stop();
          aProgress.DOMWindow.location = "chrome://people/content/facebook_progress.xhtml";
          
          let oldCallback = gCompletionCallback;
          gCompletionCallback = function() {try{oldCallback();}catch(e){};aProgress.DOMWindow.location = "chrome://people/content/manager.xhtml";}
          getAccessToken(doFacebookImport);
        } 
      }
    }
  },

  /*
          // Stop listening for completions
        var mainWindow = gWindow.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                             .getInterface(Components.interfaces.nsIWebNavigation)
                             .QueryInterface(Components.interfaces.nsIDocShellTreeItem)
                             .rootTreeItem
                             .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                             .getInterface(Components.interfaces.nsIDOMWindow);
        mainWindow.gBrowser.removeProgressListener(gOAuthCompletionListener);
        
*/
  
  onStateChange: function() {},
  onProgressChange: function() {},
  onStatusChange: function() {},
  onSecurityChange: function() {},
  onLinkIconAvailable: function() {}

};

function getAccessToken(resumptionFunction)
{
  var code = Prefs.get("oauth_code");

  var accessTokenURL = "https://graph.facebook.com/oauth/access_token?" +
      "callback=" + COMPLETION_URI +
      "&code=" + code +
      "&client_id=" + MozillaLabsContactsApplicationID +
      "&client_secret=" + MozillaLabsContactsApplicationSecret;

  let call = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);  
  let url = accessTokenURL;
  call.open('GET', url, true);
  call.onreadystatechange = function (aEvt) {
    if (call.readyState == 4) {
      if (call.status == 200) {
        let response = parseQueryString(call.responseText);
        Prefs.set("oauth_access_token", response.access_token);
        resumptionFunction();
      } else {
        gLogger.info("Unable to access Facebook: error " + call.status + " while getting access token.");
        dump(call.responseText);
        
        // nuke the prefs and start over.
        Prefs.reset("oauth_access_token");
        Prefs.reset("oauth_code");
        resumptionFunction();
      }
    }
  }
  call.send(null);
}

var gProgressCallback, gCompletionCallback, gWindow, gEngine;

FacebookImporter.prototype = {
  __proto__: ImporterBackend.prototype,
  get name() "Facebook",
  get displayName() "Facebook",
	get iconURL() "chrome://people/content/images/facebook.png",

  import: function FacebookImporter_import(completionCallback, progressFunction, window) {
    gEngine = this; // kind of gross.  lots of asynchronous callbacks and we lose track of our instance, sigh
    gWindow = window;
    gProgressCallback = function(arg) {try{progressFunction(arg)}catch(e){}};
    gCompletionCallback = function(arg) {try{completionCallback(arg)}catch(e){}};
  
    if (Prefs.get("oauth_access_token")) {
      // We've already got one!  Let's use it.
      doFacebookImport();
    }
    else
    {
      // Need to ask the user to authenticate:
      let targetURL = "https://graph.facebook.com/oauth/authorize?client_id=" + MozillaLabsContactsApplicationID + 
          "&redirect_uri=" + COMPLETION_URI + 
          "&scope=friends_birthday,friends_online_presence,friends_photos,friends_website";
      var mainWindow = window.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                           .getInterface(Components.interfaces.nsIWebNavigation)
                           .QueryInterface(Components.interfaces.nsIDocShellTreeItem)
                           .rootTreeItem
                           .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                           .getInterface(Components.interfaces.nsIDOMWindow);
      // Start listening for completions
      mainWindow.gBrowser.addProgressListener(gOAuthCompletionListener, Ci.nsIWebProgress.NOTIFY_STATE_DOCUMENT);
      window.location = targetURL;

      // when we're done, we'll do:
      // gBrowser.removeProgressListener(this);
    }
  },
}

function doFacebookImport()
{
  var accessToken = Prefs.get("oauth_access_token");

  gLogger.info("Accessing Facebook friend list with saved access token");
  
  let call = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);  
  let url = "https://graph.facebook.com/me/friends?access_token=" + accessToken;
  call.open('GET', url, true);
  let that = this;
  call.onreadystatechange = function (aEvt) {
    if (call.readyState == 4) {
      if (call.status == 200) {
        let response = JSON.parse(call.responseText);
        let people = [];
        for each (let fbPerson in response.data)
        {
          let person = {};
          person.accounts = [{domain:"facebook.com", userid:fbPerson.id}];
          person.displayName = fbPerson.name;
          people.push(person);
        }
        People.add(people, gEngine, gProgressCallback);
        gCompletionCallback(null);
      } else if (call.status == 401) {
        // expired, go refresh it
        getAccessToken(doFacebookImport);
      } else {
        gLogger.info("Error while accessing Facebook friend list: " + call.status);
      }
    }
  }
  call.send(null);
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
	get iconURL() "",

  discover: function FacebookDiscoverer_discover(forPerson, completionCallback, progressFunction) {
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
          this.startFacebookDiscovery(fbid, progressFunction, completionCallback, "root");
        }
      }
    }
    for each (let account in forPerson.getProperty("accounts")) {
      if (account.domain.indexOf("facebook") >= 0) {
        let fbid = account.userid ? account.userid : account.username;
        if (fbid) {
          this.startFacebookDiscovery(fbid, progressFunction, completionCallback, "root");
        }
      }
    }
  },
  
  startFacebookDiscovery : function startFacebookDiscovery(fbid, progressFunction, completionCallback, type) {
    try {
      progressFunction({initiate:"Facebook:"+ type + ":" + fbid, msg:"Resolving Facebook profile for " + fbid});
      this.createFacebookDiscoveryHandler(fbid, progressFunction, completionCallback, type).send(null);      
    } catch (e) {
      if (e != "DuplicatedDiscovery") {
        this._log.info("Error while looking up Facebook profile: " + e);
      }
    }
  },
  
  createFacebookDiscoveryHandler : function(id, progressFunction, completionCallback, type) {
    let call = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);  
    let url = "http://graph.facebook.com/" + id;

    let accessToken = Prefs.get("oauth_access_token");
    if (accessToken) url += "?access_token=" + accessToken;

    call.open('GET', url, true);
    let that = this;
    call.onreadystatechange = function (aEvt) {
      if (call.readyState == 4) {
        if (call.status == 401) {
          this._log.info("Received 401 error while accessing Facebook; renewing access token");
          getAccessToken(function(){createFacebookDiscoveryHandler(id, progressFunction, completionCallback, type)});
        } else if (call.status == 200) {
          let response = JSON.parse(call.responseText);
          
          switch (type) {
            case "root":
              let newPerson = {};
              if (response.name) newPerson.displayName = response.name;
              if (response.first_name) {
                if (!newPerson.name ) newPerson.name={};
                newPerson.name.givenName = response.first_name;
              }
              if (response.last_name) {
                if (!newPerson.name) newPerson.name={};
                newPerson.name.familyName = response.last_name;
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
              completionCallback(newPerson, "Facebook:root:" + id);
              break;
          }
        } else {
          that._log.debug("Got result code " + call.status + " while retrieving " + url);
        }
      }
    }
    return call;
  }
}

PeopleImporter.registerDiscoverer(FacebookDiscoverer);
PeopleImporter.registerBackend(FacebookImporter);




/*


        let call = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);  
        call.open('GET', accessTokenURL, true);
        let that = this;
        call.onreadystatechange = function (aEvt) {
          if (call.readyState == 4) {
            if (call.status == 200) {
              var accessToken = call.responseText;
              Prefs.set("oauth_access_token", accessToken);

              // And do the import...
              doFacebookImport();

              // Give the user something to look at...
              //redirect("chrome://people/content/facebook_progress.xhtml");
              redirect("chrome://people/content/manager.xul");
            } else {
              gCompletionCallback({error:"Error", message:"There was an error while requesting access from Facebook"});
            }
          }
        }
        call.send(null);*/