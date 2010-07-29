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

function NativeAddressBookImporter() {
  this._log = Log4Moz.repository.getLogger("People.NativeAddressBookImporter");
  this._log.debug("Initializing importer backend for " + this.displayName);
};

NativeAddressBookImporter.prototype = {
  __proto__: ImporterBackend.prototype,
  get name() "native",
  get displayName() "Native Address Book (on your computer)",
	get iconURL() "chrome://people/content/images/macaddrbook.png",


  import: function NativeAddressBookImporter_import(completionCallback, progressFunction) {
    this._log.debug("Importing Native address book contacts into People store");

		try
		{
			let nativeAddrBook = Components.classes["@labs.mozilla.com/NativeAddressBook;1"].getService(Components.interfaces["INativeAddressBook"]);
			let allCards = nativeAddrBook.getCards({});
			
			let people = [];
			for (i=0;i<allCards.length;i++) {
        progressFunction(Math.floor( i * 100.0 / allCards.length ));
        
				person = {}
        person.tags = [];
				let fname = allCards[i].getProperty("firstName");
				let lname = allCards[i].getProperty("lastName");
        let org = allCards[i].getProperty("organization");
        let dept = allCards[i].getProperty("department");
        let jobTitle = allCards[i].getProperty("jobTitle");
        let groups = allCards[i].getProperty("groups");
				
				if (!fname && !lname) continue; // skip anonymous cards for now
				
        this._log.info("Got lname " + lname);
        
				if (fname && lname) {
					person.displayName = fname + " " + lname;
				} else if (lname) {
					person.displayName = lname;			
				} else if (fname) {
					person.displayName = fname;
				}
				person.name = {}
				person.name.givenName = fname;
				person.name.familyName = lname;
        try {
          person.tags = JSON.parse(groups);
        } catch (e) {
          this._log.debug("Error while parsing groups: " + e);
        }
				person.tags.push("On My Computer");

        if (org || jobTitle) {
          person.organizations = [];
          var orgRecord = {};
          if (orgRecord) orgRecord.name = org;
          if (jobTitle) orgRecord.title = jobTitle;
          if (dept) orgRecord.department = dept;
          person.organizations.push(orgRecord);
        }

				let emailLabels = allCards[i].getPropertyListLabels("email", []);
				let emailValues = allCards[i].getPropertyListValues("email", []);
				for (let j=0;j<emailLabels.length;j++) {
          if (!person.emails) person.emails = [];
					person.emails.push({value:emailValues[j], type:emailLabels[j]});
				}
				let phoneLabels = allCards[i].getPropertyListLabels("phone", []);
				let phoneValues = allCards[i].getPropertyListValues("phone", []);
				for (let j=0;j<phoneLabels.length;j++) {
          if (!person.phoneNumbers) person.phoneNumbers = [];
					person.phoneNumbers.push({value:phoneValues[j], type:phoneLabels[j]});
				}

				let urlLabels = allCards[i].getPropertyListLabels("urls", []);
				let urlValues = allCards[i].getPropertyListValues("urls", []);
				for (let j=0;j<urlLabels.length;j++) {
          if (!person.urls) person.urls = [];
					person.urls.push({value:urlValues[j], type:urlLabels[j]});
				}

				let addressLabels = allCards[i].getPropertyListLabels("addresses", []);
				let addressValues = allCards[i].getPropertyListValues("addresses", []);
				for (let j=0;j<addressLabels.length;j++) {
          if (!person.addresses) person.addresses = [];
          var addr = JSON.parse(addressValues[j]);
          addr.type = addressLabels[j];
					person.addresses.push(addr);
				}

				people.push(person);
			}
			this._log.info("Adding " + people.length + " Native address book contacts to People store");
      People.add(people, this, progressFunction);
			completionCallback(null);
		} catch (e) {
      if ((""+e).indexOf("NativeAddressBook;1'] is undefined") >= 0) {
        completionCallback({error:"Access Error",message:"Sorry, native address book support isn't done for this platform yet."});
      } else {
        this._log.info("Unable to access native address book importer: " + e);
        completionCallback({error:"Access Error",message:"Unable to access native address book importer: " + e});
      }
		}
	}
};


PeopleImporter.registerBackend(NativeAddressBookImporter);
