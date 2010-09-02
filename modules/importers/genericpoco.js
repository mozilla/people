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

let EXPORTED_SYMBOLS = ["GenericPoCoImporter"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://people/modules/utils.js");
Cu.import("resource://people/modules/ext/log4moz.js");
Cu.import("resource://people/modules/people.js");
Cu.import("resource://people/modules/import.js");
Cu.import("resource://people/modules/oauthbase.js");
Cu.import("resource://people/modules/ext/resource.js");
Cu.import("resource://oauthorizer/modules/oauth.js");
Cu.import("resource://oauthorizer/modules/oauthconsumer.js");


function GenericPoCoImporter() {
  this._log = Log4Moz.repository.getLogger("People.GenericPoCoImporter");
  this._log.debug("Initializing importer backend for " + this.displayName);
}
GenericPoCoImporter.prototype = {
  __proto__: OAuthBaseImporter.prototype,
  get name() "GenericPoCo",
  get displayName() "Generic Portable Contacts Provider",
  get iconURL() "chrome://people/content/images/poco.png",
	getPrimaryKey: function (person){
		return person.emails[0].value;
	},

  discoverPocoEndpoint: function discoverPocoEndpoint() 
  {
    this._log.debug("discoverPocoEndpoint for "+this.name);
    let providerResource = new Resource(this.provider).get().dom;
    let metaIterator = Utils.xpath(providerResource, "//meta[@http-equiv='x-xrds-location']");
    let theMeta = metaIterator.iterateNext();
    if (theMeta == null) {
      this._log.warn("Portable Contacts provider has no meta element with an http-equiv of 'x-xrds-location'");
      throw {error:"Portable Contacts provider missing x-xrds-location",  message:"Communication error with Portable Contacts provider (missing x-xrds-location header)"};
    }
    var content, attrs = theMeta.attributes; // workaround for strange failure of attributes in xpathresult element
    for(i=attrs.length-1; i>=0; i--) {
      if (attrs[i].name == "content") {
        content = attrs[i].value;
        break;
      }
    }
    this._log.debug("requesting Portable Contacts XRD from "+content);
    let xrdsResourceLoader = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);
    xrdsResourceLoader.open('GET', content, false);
    xrdsResourceLoader.send(null);
    if (xrdsResourceLoader.status != 200) {
      this._log.warn("Portable Contacts provider XRDS retrieval error (status " + xrdsResourceLoader.status + ")");
      throw {error:"Portable Contacts provider XRDS retrieval error",  
             message:"Communication error with Portable Contacts provider (XRDS retrieval error " + xrdsResourceLoader.status + ")"};
    }
    let xrdsResourceDOM = xrdsResourceLoader.responseXML;
    
    let self = this;
    function getURIFromResource(dom, type) {
      let iter = Utils.xpath(xrdsResourceDOM, "//*[local-name()='Service']/*[local-name()='Type' and text()='"+type+"']/../*[local-name()='URI']");
      let elem = iter.iterateNext();
      if (elem == null) {
        self._log.warn("Portable Contacts provider's XRD document has no service element with a type of '"+type+"'");
        throw {error:"Portable Contacts provider's XRD missing PoCo 1.0",  message:"Communication error with Portable Contacts provider (no Portable Contacts service in resource document)"};
      }
      return elem.textContent;
    }
    let pocoEndpoint = getURIFromResource(xrdsResourceDOM, 'http://portablecontacts.net/spec/1.0');

    let oauthXRDS = getURIFromResource(xrdsResourceDOM, 'http://oauth.net/discovery/1.0');
    // discover oauth endpoints
    this.oauthProvider = OAuthConsumer.discoverProvider(oauthXRDS,
							this.name,
							this.displayName,
							this.consumerToken,
							this.consumerSecret,
							this.redirectURL);
    this.oauthProvider.serviceProvider.endpoint = pocoEndpoint;
    this.oauthProvider.displayName = this.displayName;

    return this.oauthProvider;
  },
  
  authorize: function(callback, params) {
    // much the same as OAuthConsumer.authorize, but use our own service object
    var svc = this.discoverPocoEndpoint();

    if (params)
        svc.requestParams = params;
    svc.extensionID = "contacts@labs.mozilla.com";
    var handler = OAuthConsumer.getAuthorizer(svc, callback);

    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                        .getService(Components.interfaces.nsIWindowMediator);
    var win = wm.getMostRecentWindow(null);
    win.setTimeout(function () {
        handler.startAuthentication();
    }, 1);
    return handler;
  },

  import: function PocoImporter_import(completionCallback, progressCallback) {
    this._log.debug("Importing "+this.name+" address book contacts into People store");
    this.completionCallback = completionCallback;
    this.progressCallback = progressCallback;

    if (!this.provider) {
      throw {error:"No PoCo provider given.", message:"Error: No provider was set for this Portable Contacts importer."};
    }

    let self = this;
    this.oauthHandler = this.authorize(function doImport(svc) { self.doImport(svc); }, null);
  },

  doImport: function PocoImporter_doImport(svc) {
    this._log.debug("Importing Generic Portable Contacts provider '"+this.name+"' contacts into People store");
    this.message.action = svc.serviceProvider.endpoint + "/@me/@all";
    this.message.parameters = {
      'count': '10000',
      'fields': '@all'
    }
    let self = this;
    OAuthConsumer.call(svc, this.message, function OAuthBaseImporterCallHandler(req) {
      self.handleResponse(req);
    });
  },

  handleResponse: function PocoImporter_handleResponse(req) {
    this._log.info(this.displayName + " readystate change " + req.status + "\n");
    if (req.status == 401) {
      this._log.error(this.displayName + " login failed.");
      this.completionCallback({error:"login failed", message:"Unable to log into "+this.displayName+" with saved OAuth key"});

    } else if (req.status != 200) {
      this._log.error("Error " + req.status + " while accessing "+this.displayName+": " + req.responseText);
      this.completionCallback({error:"login failed", message:"Unable to log into "+this.displayName+" with saved OAuth key (error " + req.status + ")"});
    } else {
      let contacts = JSON.parse(req.responseText);
      this._log.info(this.displayName + " discovery got " + contacts.entry.length + " persons");
      if (contacts) {
	People.add(contacts.entry, this, this.progressCallback);	    
      }

      this.completionCallback(null);
    }
  }
};

