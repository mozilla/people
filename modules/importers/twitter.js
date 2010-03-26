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


function TwitterAddressBookImporter() {
  this._log = Log4Moz.repository.getLogger("People.TwitterAddressBookImporter");
  this._log.debug("Initializing importer backend for " + this.displayName);
};

TwitterAddressBookImporter.prototype = {
  __proto__: ImporterBackend.prototype,
  get name() "twitter",
  get displayName() "Twitter Address Book",
	get iconURL() "chrome://people/content/images/twitter.png",

  import: function NativeAddressBookImporter_import(completionCallback, progressFunction) {
    this._log.debug("Importing Twitter address book contacts into People store");

		// Look up saved twitter password; if we don't have one, log and bail out
		login = Cc["@mozilla.org/login-manager;1"].getService(Ci.nsILoginManager);
		let potentialURLs = ["https://twitter.com", "https://www.twitter.com", "http://twitter.com", "http://www.twitter.com"];

		let logins = null;
		for each (var u in potentialURLs) {
			logins = login.findLogins({}, u, "https://twitter.com", null);
      this._log.error("Checking for saved password at " + u +": found " + logins + " (length " + logins.length + ")");
			if (logins && logins.length > 0) break;
		}
		if (!logins || logins.length == 0) {
			this._log.error("No saved twitter.com login information: can't import Twitter address book");
			throw {error:"Unable to get contacts from Twitter", 
						 message:"Could not download contacts from Twitter: please visit <a target='_blank' href='https://twitter.com'>Twitter.com</a> and save your password."};
		}

		// Okay, if there's more than one... which username should we use?
		let aLogin = logins[0];
		if (logins.length>1) {
			this._log.info("More than one saved twitter.com login!  Using the first one.");
		}

    let twitLoad = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
      .createInstance(Components.interfaces.nsIXMLHttpRequest);
    // The XHR object only sends username/password if it sees a 401.  That's a problem in our case, because
    // twitter performs IP-level quota tracking for unauthenticated requests.  So we have to hard-code an
    // authentication header.
		twitLoad.open('GET', "http://twitter.com/statuses/friends.json", true, aLogin.username, aLogin.password);
    twitLoad.setRequestHeader('Authorization',  'Basic ' + btoa(aLogin.username + ':' + aLogin.password));

		let that = this;
		twitLoad.onreadystatechange = function (aEvt) {  
			if (twitLoad.readyState == 4) {  
				that._log.info("Twitter readystate change " + twitLoad.status + "\n");

				if (twitLoad.status == 401) {
					that._log.error("Twitter login failed.");
					completionCallback({error:"login failed", message:"Unable to log into Twitter with saved username/password"});

				} else if (twitLoad.status != 200) {
					that._log.error("Error " + twitLoad.status + " while accessing Twitter: " + twitLoad.responseText);
					completionCallback({error:"login failed", message:"Unable to log into Twitter with saved username/password (error " + twitLoad.status + ")"});
				} else {
					let result = JSON.parse(twitLoad.responseText);
					that._log.info("Twitter discovery got " + result.length + " persons");

					let people = [];
					for (var i=0; i< result.length;i++) 
					{
            progressFunction(Math.floor( i * 100.0 / result.length ));
            
						var p = result[i];
						if (typeof p.screen_name != 'undefined')
						{
							that._log.info(" Constructing person for " + p.screen_name + "; display " + p.name);
							try {
								person = {}
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
								if (p.url) 
									person.urls = [{type:"URL", value:p.url}]
								
								people.push(person);
								
							} catch (e) {
								that._log.error("Twitter import error " + e + "\n");
							}
						}
					}
					that._log.info("Adding " + people.length + " Twitter address book contacts to People store");
					People.add(people, that, progressFunction);
					completionCallback(null);
				}
			}
		}
		twitLoad.send(null);
	}
}

PeopleImporter.registerBackend(TwitterAddressBookImporter);
