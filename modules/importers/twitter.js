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
 *  Jono DiCarlo <jdicarlo@mozilla.com>
 *  Dan Mills <thunder@mozilla.com>
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
Cu.import("resource://people/modules/people.js");
Cu.import("resource://people/modules/import.js");
Cu.import("resource://people/modules/oauthbase.js");
Cu.import("resource://oauthorizer/modules/oauthconsumer.js");
let IO_SERVICE = Cc["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);

function TwitterAddressBookImporter() {
  this._log = Log4Moz.repository.getLogger("People.TwitterAddressBookImporter");
  this._log.debug("Initializing importer backend for " + this.displayName);
};

let TwitterApplicationID = "cc3uj6jfjd1ZzzOojgBQ3Q"; // Lanakai is "lppkBgcpuhe2TKZIRVoQg";
let TwitterApplicationSecret = "GQOGSaEYqXnmX3QWjWZM4Ays0fSJ9WJmAIozfzxTY"; // Lanakai is "M6hwPkgEyqxkDz583LFYAv5dTVg1AsKIXHFPiIFhsM";
let CompletionURI= "http://oauthcallback.local/access.xhtml";


TwitterAddressBookImporter.prototype = {
  __proto__: OAuthBaseImporter.prototype,
  get name() "twitter",
  get displayName() "Twitter Address Book",
  get iconURL() "chrome://people/content/images/twitter.png",

  completionCallback: null,
  progressCallback: null,
  oauthHandler: null,
  authParams: null,
  consumerToken: TwitterApplicationID,
  consumerSecret: TwitterApplicationSecret,
  redirectURL: CompletionURI,
  cursor: -1,
  get message() {
    return {
      action: "https://twitter.com/statuses/friends.json",
      method: "GET",
      parameters: {'cursor': this.cursor}
    }
  },
  getPrimaryKey: function (person){
    return person.accounts[0].username;
  },
  getLinkFromKey: function (key){
    return "http://twitter.com/" + key;
  },
  handleResponse: function TwitterAddressBookImporter_handleResponse(req, svc) {
    if (req.status == 401) {
      this._log.error("Twitter login failed.");
      this.completionCallback({error:"login failed", message:"Unable to log into Twitter with saved username/password"});
    } else if (req.status != 200) {
      this._log.error("Error " + req.status + " while accessing Twitter: " + req.responseText);
      this.completionCallback({error:"login failed", message:"Unable to log into Twitter with saved username/password (error " + req.status + ")"});
    } else {
      let result = JSON.parse(req.responseText);
      this._log.info("Twitter discovery got " + result.users.length + " persons");

      let people = [];
      for (var i=0; i< result.users.length;i++) 
      {
        this.progressCallback(Math.floor( i * 100.0 / result.length ));
        
        var p = result.users[i];
        if (typeof p.screen_name != 'undefined')
        {
          this._log.info(" Constructing person for " + p.screen_name + "; display " + p.name);
          try {
            let person = {}
            person.tags = ["Twitter"];
            person.accounts = [{type:"twitter", username:p.screen_name, domain:"twitter.com"}]

            if (p.name) {
              person.displayName = p.name;
              
              // For now, let's assume European-style givenName familyName+
              let split = p.name.split(" ");
              
              if (split.length == 2 && split[0].length > 0 && split[1].length > 0)
              {
                person.name = {};
                person.name.givenName = split[0];
                person.name.familyName = split.splice(1, 1).join(" ");
              }
            }
            if (p.profile_image_url) 
              person.photos = [{type:"thumbnail", value:p.profile_image_url}];
            if (p.location && p.location.length > 0) 
              person.location = [{type:"Location", value:p.location}] //???

            if (p.url) {
              try {
                let parsedURI = IO_SERVICE.newURI(p.url, null, null);
                let host = parsedURI.host;
                if (host.indexOf("www.") == 0) host = host.substring(4);
                person.urls = [{type:host, value:p.url}]
              } catch (e) {
                person.urls = [{type:"URL", value:p.url}]
              }
            }
            if (!person.urls) person.urls = [];
            person.urls.push({type:"twitter.com", value:"http://twitter.com/" + p.screen_name});
            
            people.push(person);
            
          } catch (e) {
            this._log.error("Twitter import error " + e + "\n");
          }
        }
      }
      this._log.info("Adding " + people.length + " Twitter address book contacts to People store");
      People.add(people, this, this.progressCallback);
      
      if (result.next_cursor != 0) {
        this.cursor = result.next_cursor;
        this.doImport(svc);
      } else {
        this.completionCallback(null);
      }
    }
  }
}


function TwitterOAuthLoader() {

}

TwitterOAuthLoader.prototype = 
{
  startTwitterLoad : function startTwitterLoad(uri, method, parameters, callback) {
    try {
      let self = this;
      function twitterLoad(svc) {
        People._log.debug("Twitter OAuth handler invoked twitterLoad");
        self.createTwitterHandler(svc, uri, method, parameters, callback);
      }

      People._log.debug("startTwitterLoad about to call OAuthConsumer.authorize");
      this.oauthHandler = OAuthConsumer.authorize('twitter',
        TwitterApplicationID,
        TwitterApplicationSecret,
        CompletionURI,
        twitterLoad,
        null,
        "contacts@labs.mozilla");
    } catch (e) {
      People._log.error("Twitter error " + e);
    }
  },

  createTwitterHandler: function(svc, uri, method, parameters, callback) {
    if (parameters == null) parameters = {};
    let call = {
      action: uri,
      method: method,
      parameters: parameters
    }
    let self = this;

    People._log.debug("createTwitterHandler about to call OAuthConsumer.call");
    try {
      OAuthConsumer.call(svc, call, function TwitterOAuthCallHandler(req) {
        People._log.debug("OAuthConsumer.call invoked callback; got response");
        self.handleResponse(req, callback);
      });
    } catch (e) {
      People._log.debug("createTwitterHandler error: " + e);
      People._log.debug("createTwitterHandler error stack: " + e.stack);
    }
  },
  
  handleResponse: function(req, callback) {
    if (req.readyState != 4) {
        this._log.debug("Request response not handled, state "+req.readyState);
        return;
    }
    //dump("Got Twitter OAuth response - " + req.responseText.length + " bytes\n");
    //dump("Got Twitter OAuth response - " + req.responseText + "\n");
    if (req.status == 401) {
      this._log.info("Received 401 error while accessing Twitter; renewing access token");
      this.oauthHandler.reauthorize();
    } else if (req.status == 200) {
      People._log.debug("Twitter got response " + req.responseText + "\n");
      callback(req.responseText);
    }
  }
};



function constructTwitterUpdatesService(account) {
  return {
    identifier: "twitter:updates:" + account.username,
    methodName: "updates",
    method: function(callback) {
    
      People._log.debug("Invoking twitter updates");
      let twitOauth = new TwitterOAuthLoader();
      let uri = "https://twitter.com/statuses/user_timeline/" + account.username + ".rss";

      twitOauth.startTwitterLoad(uri, "GET", null, function(result) {
        let parser = Components.classes["@mozilla.org/feed-processor;1"].createInstance(Components.interfaces.nsIFeedProcessor);
        try {
          parser.listener = {

            handleResult: function(result) {
              var feed = result.doc;
              feed.QueryInterface(Components.interfaces.nsIFeed);
              let updates = [];
              for (i=0; i<feed.items.length; i++) {
                try {
                  let update = {};
                  var theEntry = feed.items.queryElementAt(i, Components.interfaces.nsIFeedEntry);
                  var date = theEntry.updated ? theEntry.updated : (theEntry.published ? theEntry.published : null);
                  if (date) {
                    update.time = new Date(date);
                  }
                  update.text = theEntry.title.plainText();
                  update.source = "Twitter";
                  update.sourceLink = "https://twitter.com/" + account.username;
                  updates.push(update);
                } catch (e) {
                  People._log.error("twitter error: " + e);
                }
              }
              callback(updates);
            }
          };
          parser.parseFromString(result, IO_SERVICE.newURI(uri, null, null));
        } catch (e) {
          People._log.error("twitter error: " + e);
        }
    });
    }
  };
}


/* A twitter URL will work, barely, with normal feed discovery logic.  But this
* means that a) we can't send to the user, and b) we can't do authenticated
* requests, which means we get throttled.
*
* So we look at every URL to see if it's a twitter URL, and if it is,
* we pull the username out of it.
*/
function TwitterAccountDiscoverer() {
  this._log = Log4Moz.repository.getLogger("People.TwitterAccountDiscoverer");
  this._log.debug("Initializing importer backend for " + this.displayName);
};

TwitterAccountDiscoverer.prototype = {
  __proto__: DiscovererBackend.prototype,
  get name() "Twitter",
  get displayName() "Twitter Account",
  get iconURL() "",
  get description() "Extracts twitter account names from twitter.com URLs.",

  discover: function TwitterAccountDiscoverer(forPerson, completionCallback, progressFunction) {
    for each (let url in forPerson.getProperty("urls")) {
      let discoveryToken = "Twitter:" + url.value;
      let re = RegExp("http(s)?://(www\\.)?twitter.com/(.*)", "gi"); 
      let result = re.exec(url.value);
      if (result) {
        try {
          progressFunction({initiate:discoveryToken, msg:"Analyzing twitter URL"});
          let username = result[3];
          if (username) {
            let newPerson = {accounts:[{domain:"twitter.com", username:username}]};
            completionCallback(newPerson, discoveryToken);
          } else {
            completionCallback(null, discoveryToken);
          }
        } catch (e) {
          // consume all exceptions silently; this includes duplicates
          if (e != "DuplicatedDiscovery") {
            completionCallback(null, discoveryToken);
          }
        }
      }
    }
  }
};

function constructTwitterPrivateMessageToService(account) {
  return {
    identifier: "twitter:sendPrivateMessageTo:" + account.username,
    methodName: "sendPrivateMessageTo",
    method: function(text, callback) {
    
      People._log.debug("Invoking twitter sendPrivateMessageTo");
      let twitOauth = new TwitterOAuthLoader();
      let uri = "https://api.twitter.com/1/direct_messages/new.json";

      People._log.debug("Starting Twitter OAuth for sendPrivateMessage");
      twitOauth.startTwitterLoad(uri, "POST", {user:account.username, text:text/*escape(text)*/}, function(result) {
        //dump("Got sendMessage callback\n");
        callback({status:"ok"});
      });
    }
  };
}

function constructTwitterPublicMessageToService(account) {
  return {
    identifier: "twitter:sendPublicMessageTo:" + account.username,
    methodName: "sendPublicMessageTo",
    method: function(text, callback) {
    
      People._log.debug("Invoking twitter sendPublicMessageTo");
      let twitOauth = new TwitterOAuthLoader();
      let uri = "http://api.twitter.com/1/statuses/update.json";
      let posttext = "@" + account.username + " " + text;
      dump("length" + posttext.length + "\n");
      if(posttext.length > 140) {
        callback({status:"error", reason:"Message too long."});
      } else { 
        People._log.debug("Starting Twitter OAuth for sendPublicMessage");
        twitOauth.startTwitterLoad(uri, "POST", {status:posttext/*escape(text)*/}, function(result) {
          dump("Got sendPublicMessage callback\n");
          callback({status:"ok"});
        });
      }
    }
  };
}

PeopleImporter.registerBackend(TwitterAddressBookImporter);
PeopleImporter.registerDiscoverer(TwitterAccountDiscoverer);
PersonServiceFactory.registerAccountService("twitter.com", constructTwitterUpdatesService);
PersonServiceFactory.registerAccountService("twitter.com", constructTwitterPrivateMessageToService);
PersonServiceFactory.registerAccountService("twitter.com", constructTwitterPublicMessageToService);

