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
 *  Shane Caraveo <shane@caraveo.com>, <mixedpuppy@gmail.com>
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


function ThunderbirdAddressBookImporter() {
  this._log = Log4Moz.repository.getLogger("People.ThunderbirdAddressBookImporter");
  this._log.debug("Initializing importer backend for " + this.displayName);
};

ThunderbirdAddressBookImporter.prototype = {
  __proto__: ImporterBackend.prototype,
  get name() "Thunderbird",
  get displayName() "Thunderbird Address Book (on your computer)",
	get iconURL() "chrome://people/content/images/macaddrbook.png",

	abNumberProperties: {
	  "HomePhone": "home",
    "WorkPhone": "work",
    "FaxNumber": "fax",
    "PagerNumber": "pager",
    "CellularNumber": "mobile"
	},

  import: function ThunderbirdAddressBookImporter_import(completionCallback, progressFunction) {
    this._log.debug("Importing Thunderbird address book contacts into People store");

		try
		{
			this.importAB("moz-abmdbdirectory://abook.mab", completionCallback, progressFunction);
			this.importAB("moz-abmdbdirectory://history.mab", completionCallback, progressFunction);
			completionCallback(null);
		} catch (e) {
			this._log.info("Unable to access Thunderbird address book importer: " + e);
			completionCallback({error:"Access Error",message:"Unable to access Thunderbird address book importer: " + e});
		}
	},
	
	importAB: function (bookurl, completionCallback, progressFunction) {
			let abm = Cc["@mozilla.org/abmanager;1"].getService(Ci.nsIAbManager);
			let book = abm.getDirectory(bookurl);
	    let cards = book.childCards;
			let people = [];
			let allCards = [];
			while (cards.hasMoreElements()) {
				allCards.push(cards.getNext()
											.QueryInterface(Ci.nsIAbCard));
			}
			
			for (i=0;i<allCards.length;i++) {
				let card = allCards[i];
        progressFunction(Math.floor( i * 100.0 / allCards.length ));
        
				person = {}
				let fname = card.getProperty("FirstName", "");
				let lname = card.getProperty("LastName", "");
        let org = card.getProperty("Company", "");
        let dept = card.getProperty("Department", "");
        let jobTitle = card.getProperty("JobTitle", "");
				let primaryEmail = card.getProperty("PrimaryEmail", "");
				let secondEmail = card.getProperty("SecondEmail", "");
				person.displayName = card.getProperty("DisplayName", "")

				// skip anonymous cards for now
				if (!person.displayName &&
						!fname &&
						!lname &&
						!primaryEmail && 
						!secondEmail) continue; 
				
        this._log.info("Got lname " + lname);
        
				if (!person.displayName) {
					if (fname && lname) {
						person.displayName = fname + " " + lname;
					} else if (lname) {
						person.displayName = lname;			
					} else if (fname) {
						person.displayName = fname;
					} else if (primaryEmail) {
						person.displayName = primaryEmail;
					} else if (secondEmail) {
						person.displayName = secondEmail;
					}
				}
				person.name = {}
				person.name.givenName = fname;
				person.name.familyName = lname;

        if (org || jobTitle) {
          person.organizations = [];
          var orgRecord = {};
          if (orgRecord) orgRecord.name = org;
          if (jobTitle) orgRecord.title = jobTitle;
          if (dept) orgRecord.department = dept;
          person.organizations.push(orgRecord);
        }

				person.emails = []
				if (primaryEmail)
					person.emails.push({value:primaryEmail, type:'work', primary:true});
				if (secondEmail)
					person.emails.push({value:secondEmail, type:'home'});

				person.phoneNumbers = []
				for each(let property in this.abNumberProperties) {
					let value = card.getProperty(property, "");
					let type = this.abNumberProperties[property];
					if (value)
						person.phoneNumbers.push({value:value, type:type});
				}
				if (!person.tags) person.tags = [];
				person.tags.push(book.dirName);

				let photoUri = card.getProperty("PhotoURI", "");
				let photoType = card.getProperty("PhotoType", "");
				if (photoUri && photoUri.search(/chrome:/) < 0) {
					person.photos = [{value: photoUri, type: photoType, primary: true}];
				}

	/*			person.urls = []
				let urlLabels = card.getPropertyListLabels("urls", []);
				let urlValues = card.getPropertyListValues("urls", []);
				for (let j=0;j<urlLabels.length;j++) {
					person.urls.push({value:urlValues[j], type:urlLabels[j]});
				}
	*/

				people.push(person);
			}
			this._log.info("Adding " + people.length + " Thunderbird address book contacts to People store");
      People.add(people, this, progressFunction);		
	}
};

try {
	Cc["@mozilla.org/abmanager;1"].getService(Ci.nsIAbManager);
  PeopleImporter.registerBackend(ThunderbirdAddressBookImporter);
} catch(e) {}

