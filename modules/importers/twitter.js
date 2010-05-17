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

function TwitterAddressBookImporter() {
  this._log = Log4Moz.repository.getLogger("People.TwitterAddressBookImporter");
  this._log.debug("Initializing importer backend for " + this.displayName);
};

TwitterAddressBookImporter.prototype = {
  __proto__: OAuthBaseImporter.prototype,
  get name() "twitter",
  get displayName() "Twitter Address Book",
	get iconURL() "chrome://people/content/images/twitter.png",

  completionCallback: null,
  progressCallback: null,
  oauthHandler: null,
  authParams: null,
  consumerToken: "lppkBgcpuhe2TKZIRVoQg",
  consumerSecret: "M6hwPkgEyqxkDz583LFYAv5dTVg1AsKIXHFPiIFhsM",
  redirectURL: "http://oauthcallback.local/access.xhtml",
	cursor: -1,
  get message() {
		return {
			action: "http://twitter.com/statuses/friends.json",
			method: "GET",
			parameters: {'cursor': this.cursor}
		}
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

PeopleImporter.registerBackend(TwitterAddressBookImporter);
