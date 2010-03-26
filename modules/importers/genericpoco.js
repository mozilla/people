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
Cu.import("resource://people/modules/ext/resource.js");


function GenericPoCoImporter() {
  this._log = Log4Moz.repository.getLogger("People.GenericPoCoImporter");
  this._log.debug("Initializing importer backend for " + this.displayName);
}
GenericPoCoImporter.prototype = {
  __proto__: ImporterBackend.prototype,
  get name() "GenericPoCo",
  get displayName() "Generic Portable Contacts Provider",
  get iconURL() "chrome://people/content/images/poco.png",

  discoverPocoEndpoint: function discoverPocoEndpoint() 
  {
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
    let xrdsResourceLoader = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);
		xrdsResourceLoader.open('GET', content, false);
    xrdsResourceLoader.send(null);
    if (xrdsResourceLoader.status != 200) {
      this._log.warn("Portable Contacts provider XRDS retrieval error (status " + xrdsResourceLoader.status + ")");
      throw {error:"Portable Contacts provider XRDS retrieval error",  
             message:"Communication error with Portable Contacts provider (XRDS retrieval error " + xrdsResourceLoader.status + ")"};
    }
    let xrdsResourceDOM = xrdsResourceLoader.responseXML;
    let pocoEndpointIter = Utils.xpath(xrdsResourceDOM, "//*[local-name()='Service']/*[local-name()='Type' and text()='http://portablecontacts.net/spec/1.0']/../*[local-name()='URI']");
    let pocoEndpointElem = pocoEndpointIter.iterateNext();
    if (pocoEndpointElem == null) {
      this._log.warn("Portable Contacts provider's XRD document has no service element with a type of 'http://portablecontacts.net/spec/1.0'");
      throw {error:"Portable Contacts provider's XRD missing PoCo 1.0",  message:"Communication error with Portable Contacts provider (no Portable Contacts service in resource document)"};
    }
    return pocoEndpointElem.textContent;
  },
  
  getDirectCredential: function getDirectCredential(pocoEndpoint)
  {
    // Discover direct credentials from the login manager
    let aURI = Utils.makeURI(pocoEndpoint);
    var aHost = aURI.host;
		login = Cc["@mozilla.org/login-manager;1"].getService(Ci.nsILoginManager);
		let potentialURLs = ["https://" + aHost, "http://" + aHost];
		let logins = null;
		for each (var u in potentialURLs) {
			logins = login.findLogins({}, u, u, null);
      this._log.error("Checking for saved password at " + u +": found " + logins + " (length " + logins.length + ")");
			if (logins && logins.length > 0) break;
		}
		if (!logins || logins.length == 0) {
			this._log.error("No saved " + aHost + " login information: can't import " + aHost + " address book");
			throw {error:"Unable to get contacts from " + aHost, 
						 message:"Could not download contacts from " + aHost + ": please visit <a target='_blank' href='http://" + aHost + "'>" + aHost + "</a> and save your password."};
		}
		let aLogin = logins[0];
		if (logins.length>1) {
			this._log.info("More than one saved " + aHost + " login!  Using the first one.");
		}
    return aLogin;
  },
  

  import: function LinkedInImporter_import(completionCallback, progressFunction) {
    this._log.debug("Importing Generic Portable Contacts provider contacts into People store");

    if (!this.provider) {
      throw {error:"No PoCo provider given.", message:"Error: No provider was set for this Portable Contacts importer."};
    }
    var pocoEndpoint = this.discoverPocoEndpoint();
    this._log.debug("Retrieved Portable Contacts endpoint for " + this.provider + ": " + pocoEndpoint);
    var credential = this.getDirectCredential(pocoEndpoint);

    // Do the actual retrieval: for now we perform a no-argument retrieval.  Would /@me/@all make more sense?
    let pocoLoad = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);
		pocoLoad.open('GET', pocoEndpoint + "/@me/@all?count=10000&fields=@all", false, credential.username, credential.password);
    pocoLoad.send(null);
    if (pocoLoad.status != 200) {
      this._log.warn("Portable Contacts provider retrieval error (status " + pocoLoad.status + ")");
      throw {error:"Portable Contacts provider retrieval error",  
             message:"Communication error with Portable Contacts provider (contacts retrieval error " + pocoLoad.status + ")"};
    }
    var contacts = JSON.parse(pocoLoad.responseText);
    
    // TODO implement paging
    if (contacts.entry) {
      // Let's assume they implemented PoCo right.  Here we go!!!
      People.add(contacts.entry, this, progressFunction);
    }
		completionCallback(null);
  }
};

