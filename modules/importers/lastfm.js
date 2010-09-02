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
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *  Ruven Chu <rchu@mozilla.com>
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
Cu.import("resource://people/modules/ext/sha1.js");
Cu.import("resource://people/modules/people.js");
Cu.import("resource://people/modules/import.js");
let IO_SERVICE = Cc["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);

let completion_uri = "http://mozillalabs.com/contacts/__signincomplete";
let lastfmKey = "c9e4c518c8e4745d9ad4cad64250f504";
let lastfmSecret = "bd0d14e30be1f69bebdfe219bb57ac44";

let LastfmConsumer = {
		EXT_ID :"lastfm@mozillamessaging.com",
		_log:Log4Moz.repository.getLogger("People.LastfmAccountHandler"),
	  getPrefs: function(){
	  	let prefService = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
	  	return prefService.getBranch("extensions."+this.EXT_ID+".");
	  },

	  _makePrefKey: function(providerName, key, secret) {
	  	dump("others:" + providerName+ ":" + key+ ":" + secret + "\n");
	    return hex_sha1(providerName+":"+key+":"+secret);
	  },
	  
	  resetAccess: function(providerName, key, secret) {
	    let pref = this._makePrefKey(providerName, key, secret);
	    this.getPrefs().setCharPref(pref, "");
	  },
	  _setAccess: function(svc) {
	    let key = this._makePrefKey(svc.name, svc.consumerKey, svc.consumerSecret);
	    this.getPrefs().setCharPref(key, JSON.stringify(svc.accessParams));
	  },
	  getAccess: function(svc) {
	    let key = this._makePrefKey(svc.name, svc.consumerKey, svc.consumerSecret);
	    var params = null;
	    try {
	        params = this.getPrefs().getCharPref(key, null);
	    } catch(e) {
	        return false;
	    }
	    if (!params)
	        return false;
	    svc.accessParams = JSON.parse(params);
	    svc.token = svc.accessParams["access_token"];
	    svc.user = svc.accessParams["user"];
	    return svc.token && svc.user ? true : false;
		},
	  authorize: function(providerName, key, secret, completionURI, callback, params, extensionID) {
	    var svc = this.makeProvider(key, secret, completionURI);
	    svc.extensionID = extensionID;
	    var handler = new LastfmHandler(svc, callback);
	    
	    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
	                       .getService(Components.interfaces.nsIWindowMediator);
	    var win = wm.getMostRecentWindow(null);
	    win.setTimeout(function () {
	        handler.startAuthentication();
	    }, 1);
	    return handler;
		},
		makeProvider: function(key, secret, completionURI) {
	    return {
	      name: 'lastfm',
	      displayName: 'Last.fm',
	      version: "1.0",
	      consumerKey   : key, 
	      consumerSecret: secret,
	      token: null,       // oauth_token
	      user: null,
	      tokenSecret: null, // oauth_token_secret
	      accessParams: {},  // results from request access
	      requestParams: {}, // results from request token
	      requestMethod: "GET",
	      oauthBase: null,
	      completionURI: completionURI,
	      tokenRx: /token=([^&]*)/i,
	      serviceProvider: {
	        signatureMethod     : "md5",
	        userAuthorizationURL: "http://www.last.fm/api/auth/",
	        accessTokenURL      : "http://ws.audioscrobbler.com/2.0/"
	      }
	    };
		},
	  
	  openDialog : function(loginUrl, requestData, svc, afterAuthCallback) {
	    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
	                       .getService(Components.interfaces.nsIWindowMediator);
	    var win = wm.getMostRecentWindow(null);
	    var callbackFunc = function(token)
	    {
	        win.setTimeout(afterAuthCallback, 0, null, token);
	    };

	    win.openDialog("chrome://oauthorizer/content/loginPanel.xul",
		  "oauth_authorization_dialog",
		  "chrome,centerscreen,modal,dialog=no",
		  loginUrl, callbackFunc, svc);
	  },
	  makeCall: function(params, type, signed, svc, aCallback){
	  	let self = this;
	    let req = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);
	    req.onreadystatechange = function Lastfm_call_onreadystatechange(aEvt) {
	      if (req.readyState == 4) {
	        self._log.debug("call finished, calling callback");
	        aCallback(req);
	      }
	    }
	    
	    params.api_key = svc.consumerKey;
	    if(signed) params.sk = svc.token;
    	
	    if(type == "GET"){
	    	let targetURL = svc.serviceProvider.accessTokenURL + "?" + this.getQueryArguments(params, svc.consumerSecret, signed);
	    	this._log.debug("GET REQUEST: "+targetURL);
	    	req.open("GET", targetURL, true); 
	    	req.send(null);
	    } else {
	    	let targetURL = svc.serviceProvider.accessTokenURL;
	    	this._log.debug("POST REQUEST: "+targetURL);
	    	req.open("POST", targetURL, true); 
	    	req.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
	    	//req.setRequestHeader("Content-length", params.length);
	    	req.setRequestHeader("Connection", "close");
	    	req.send(this.getQueryArguments(params, svc.consumerSecret, signed));
	    }
	  },
	  getQueryArguments: function(params, secret, signed){
			let query = [i for (i in Iterator(params))].map(function(i){return i.join("=")}).join("&");
			if(!signed) return query;
	  	let flattened = [i for (i in Iterator(params))].sort(function(a, b) {return a[0] > b[0]}).map(function(i){return i.join("")}).join("");
	  	flattened += secret;
	  	return query + "&api_sig=" + hex_md5(flattened);
	  }
}


function LastfmHandler(provider, afterAuthorizeCallback) {
	this._log = Log4Moz.repository.getLogger("People.LastfmAccountHandler");
  this.service = provider;
  this.afterAuthorizeCallback = afterAuthorizeCallback;
}
LastfmHandler.prototype = {
  //starts the authentication process	
  startAuthentication: function()
  {
      if (LastfmConsumer.getAccess(this.service))
          this.afterAuthorizeCallback(this.service);
      else
      	this.getUserAuthorization();
  },
  getUserAuthorization: function(results, token) {
  	this._log.debug("Getting "+this.service.name+" user authorization");
    let self = this;
    let targetURL = this.service.serviceProvider.userAuthorizationURL + "?api_key=" + this.service.consumerKey + "&cb=" + this.service.completionURI;
    LastfmConsumer.openDialog(targetURL,
                   null,
                   self.service,
                   function(results, accessToken) {
                        self.getSessionKey(results, accessToken);
                   });
  },
  
  getSessionKey: function(results, token) {
  	this._log.debug("Getting "+this.service.name+" request token");
  	let self = this;
  	var call = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);
  	call.onreadystatechange = function receiveRequestToken() {
      if (call.readyState == 4) {
      	if(call.status == 200){
          var out = call.status+" "+call.statusText
                +"\n\n"+call.getAllResponseHeaders()
                +"\n"+call.responseText + "\n\n";
          self._log.debug("Successful call: " + out);
          var response = call.responseText;
          response = response.replace(/^<\?xml\s+version\s*=\s*(["'])[^\1]+\1[^?]*\?>/, ""); 
          let xml = new XML(response);

          self.service.accessParams["access_token"] = xml.session.key.toString();
          self.service.accessParams["user"] = xml.session.name.toString();
          self.service.token = self.service.accessParams["access_token"];
          self.service.user = self.service.accessParams["user"];

          LastfmConsumer._setAccess(self.service);
          
          self.afterAuthorizeCallback(self.service);
          
	      } else {
	      	self._log.error("Unable to access "+self.service.name+": error " + call.status + " while getting access token:" + call.responseText);
	        self.afterAuthorizeCallback({error:"API Error", message:"Error while accessing lastfm: " + call.status+": "+call.responseText});
      	}
      }
	  };
	  call.onerror = function(event) {
	      var request = event.target.channel.QueryInterface(Components.interfaces.nsIRequest);
	      self._log.debug("got an error!");
	  }
	  
	  let targetURL = this.service.serviceProvider.accessTokenURL + "?" + 
	  							LastfmConsumer.getQueryArguments({method: "auth.getSession", api_key: this.service.consumerKey, token: token}, this.service.consumerSecret, true);
    this._log.debug("REQUEST: "+targetURL);
    call.open("GET", targetURL, true); 
    call.send(null);
  }

};

function LastfmLoader() {

}
LastfmLoader.prototype = 
{
  startLastfmLoad : function startLastfmLoad(parameters, type, signed, callback) {
    try {
      let self = this;
      function lastfmLoad(svc) {
        People._log.debug("Lastfm handler invoked LastfmLoad");
        self.createLastfmHandler(svc, parameters, type, signed, callback);
      }

      People._log.debug("startLastfmLoad about to call LastfmConsumer.authorize");
      this.handler = LastfmConsumer.authorize('lastfm',
      	lastfmKey,
        lastfmSecret,
        completion_uri,
        lastfmLoad,
        null,
        "contacts@labs.mozilla.com");
    } catch (e) {
      People._log.error("Lastfm error " + e);
    }
  },

  createLastfmHandler: function(svc, parameters, type, signed, callback) {
    if (parameters == null) parameters = {};
    let self = this;

    People._log.debug("createLastfmHandler about to call LastfmConsumer.makeCall");
    try {
      LastfmConsumer.makeCall(parameters, type, signed, svc, function LastfmCallHandler(req) {
        People._log.debug("LastfmConsumer.makeCall invoked callback; got response");
        self.handleResponse(req, callback);
      });
    } catch (e) {
      People._log.debug("createLastfmHandler error: " + e);
      People._log.debug("createLastfmHandler error stack: " + e.stack);
    }
  },
  
  handleResponse: function(req, callback) {
    if (req.readyState != 4) {
        this._log.debug("Request response not handled, state "+req.readyState);
        return;
    }
    dump("Got Lastfm response - " + req.responseText.length + " bytes\n");
    dump("Got Lastfm response - " + req.responseText + "\n");
    if (req.status == 401) {
      this._log.info("Received 401 error while accessing Lastfm; renewing access token");
      //this.oauthHandler.reauthorize();
    } else if (req.status == 200) {
      People._log.debug("Lastfm got response " + req.responseText + "\n");
      callback(req.responseText);
    }
  }
};

function LastfmAccountBackend() {
  this._log = Log4Moz.repository.getLogger("People.LastfmAccountDiscoverer");
  this._log.debug("Initializing importer backend for " + this.displayName);
};

LastfmAccountBackend.prototype = {
	__proto__: ImporterBackend.prototype,
  get name() "lastfm",
  get displayName() "Last.fm",
	get iconURL() "chrome://people/content/images/last.fm.png",
  get description() "Searches Last.fm for a public profile that belongs to each of the e-mail addresses associated with a contact.",
	getPrimaryKey: function (person){
		return person.accounts[0].username;
	},
  getLinkFromKey: function (key){
    return "http://www.last.fm/user/" + key;
  },
  
  consumerToken: lastfmKey,
  consumerSecret: lastfmSecret,
  redirectURL: completion_uri,
  completionCallback: null,
  progressCallback: null,
  handler: null,
  
  import: function LastfmImporter_import(completionCallback, progressCallback) {
    this._log.debug("Importing "+this.name+" contacts into People store");
    this.completionCallback = completionCallback;
    this.progressCallback = progressCallback;

    let self = this;
    this.handler = LastfmConsumer.authorize(
        this.name,
        this.consumerToken,
        this.consumerSecret,
        this.redirectURL,
        function doImport(svc) { self.doImport(svc); },
        null,
        "contacts@labs.mozilla.com");
	},
	doImport: function(svc) {
    let self = this;
    LastfmConsumer.makeCall({method:"user.getFriends",user:svc.user}, "GET", false, svc, function LastfmImporterCallHandler(req) {
      self.handleResponse(req, svc);
    });
  },
  
  handleResponse: function LastfmImporterCallHandler(req, svc) {
  	this._log.debug("Received Response from Last.fm: " + req.responseText);
  	var response = req.responseText;
    response = response.replace(/^<\?xml\s+version\s*=\s*(["'])[^\1]+\1[^?]*\?>/, ""); 
    let xml = new XML(response);
		let page = parseInt(xml.friends.@page.toString());
		let totalPages = parseInt(xml.friends.@totalPages.toString());
    let users = xml.friends.*;
    let people = [];
    for each (let user in users){
    	this._log.debug("Processing User: " + user.name.toString());
    	let person = {};
      person.tags = ["Last.fm"];
      person.accounts = [{domain:"last.fm", username:user.name.toString()}];
      if(user.realname.toString() != ""){
      	person.displayName = user.realname.toString();
      	let splitName = person.displayName.split(" ");
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
      }
      
      person.photos = [];
      if(user.image.(@size == "medium").toString() != "") 
        person.photos.push({type:"thumbnail", value:user.image.(@size == "medium").toString()});
      if(user.image.(@size == "extralarge").toString() != "") 
        person.photos.push({type:"profile", value:user.image.(@size == "extralarge").toString()});
      if(user.image.(@size == "small").toString() != "") 
        person.photos.push({type:"small", value:user.image.(@size == "small").toString()});
      if(user.image.(@size == "large").toString() != "") 
        person.photos.push({type:"large", value:user.image.(@size == "large").toString()});
      
      person.urls = [{value:user.url.toString(), type:"other"}];
      people.push(person);
      
    }
    People.add(people, this, this.progressCallback);
		if(page < totalPages){
			let newpage = page + 1;
			LastfmConsumer.makeCall({method:"user.getFriends",user:svc.user, page:newpage}, "GET", false, svc, function LastfmImporterCallHandler(req) {
				self.handleResponse(req, svc);
			});
		}	else {
			this.completionCallback(null);
    }
  },
  
  disconnect : function LastfmImporter_disconect(){
  	LastfmConsumer.resetAccess(this.name,
                              this.consumerToken,
                              this.consumerSecret);
  },
  
  getContacts: function(svc, aCallback){
  	let self = this;
    let req = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);
    req.onreadystatechange = function Lastfm_call_onreadystatechange(aEvt) {
      if (req.readyState == 4) {
        self._log.debug("call finished, calling callback");
        aCallback(req);
      }
    }
    let targetURL = svc.serviceProvider.accessTokenURL + "?method=user.getfriends&user=" + svc.user + "&api_key=" + svc.consumerKey;
    this._log.debug("GET REQUEST: "+targetURL);
    req.open("GET", targetURL, true); 
    req.send(null);
  }
  
};

function constructLastfmUpdatesService(account) {
  return {
    identifier: "lastfm:updates:" + account.username,
    methodName: "updates",
    method: function(callback) {
    
      People._log.debug("Invoking lastfm updates");
      let loader = new LastfmLoader();

      loader.startLastfmLoad({method:"user.getrecenttracks", user:account.username, limit:"10"}, "GET", false, function(result) {
      	var response = result;
        response = response.replace(/^<\?xml\s+version\s*=\s*(["'])[^\1]+\1[^?]*\?>/, ""); 
        let xml = new XML(response);
        let tracks = xml.recenttracks.*;
        let updates = [];
        for each (let track in tracks){
        	if(track.date.toString() != ""){
	        	let update = {};
	        	update.type = "music";
	        	update.text = track.artist.toString() + " - " + track.name.toString();
	        	update.link = track.url.toString();
	        	update.source = "Last.fm";
	        	update.sourceLink = "http://www.last.fm/user/" + account.username;
	        	if(track.image.(@size == "medium").toString() != "") update.picture = track.image.(@size == "medium").toString();
	        	update.time = new Date(track.date.toString());
	        	update.other = {};
	        	update.other.album = track.album.toString();
	        	update.other.artist = track.artist.toString();
	        	update.other.track = track.name.toString();
	        	updates.push(update);
	        	dump("Update: " + JSON.stringify(update) + "\n");
        	}
        }
      	callback(updates);
      });
    }
  };
}

function constructLastfmPublicMessageToService(account) {
  return {
    identifier: "lastfm:sendPublicMessageTo:" + account.username,
    methodName: "sendPublicMessageTo",
    method: function(text, callback) {
  		People._log.debug("Invoking lastfm sendPublicMessageTo");
  		let loader = new LastfmLoader();

  		loader.startLastfmLoad({method:"user.shout", user:account.username, message:text},"POST", true, function(result) {
	       dump("Got sendPublicMessage callback\n");
	       callback({status:"ok"});
	    });
    }
  };
}

PeopleImporter.registerBackend(LastfmAccountBackend);
PersonServiceFactory.registerAccountService("last.fm", constructLastfmUpdatesService);
PersonServiceFactory.registerAccountService("last.fm", constructLastfmPublicMessageToService);