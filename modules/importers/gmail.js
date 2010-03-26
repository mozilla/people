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


function GmailImporter() {
  this._log = Log4Moz.repository.getLogger("People.GmailImporter");
  this._log.debug("Initializing importer backend for " + this.displayName);
}
GmailImporter.prototype = {
  __proto__: ImporterBackend.prototype,
  get name() "gmail",
  get displayName() "Gmail Contacts",
	get iconURL() "chrome://people/content/images/gmail.png",

  beginTest: function t0(l) { return /^begin:vcard$/i.test(l); },
  tests: [
    function t1(l) { return /^end:vcard$/i.test(l); },
    function t2(l) { return /^version:/i.test(l); },
    function t3(l, o) {
      if (/^fn:(.*)$/i.test(l)) {
        o.displayName = RegExp.$1;
        return true;
      }
      return false;
    },
    function t4(l, o) {
      if (/^n:([^;]*);([^;]*);([^;]*);([^;]*);(.*)$/i.test(l)) {

        let family = RegExp.$1, given = RegExp.$2, additional = RegExp.$3,
            honorific = RegExp.$4, honorificSuf = RegExp.$5;

        if (!o.displayName) {
          o.displayName = given;
          if (additional)
            o.displayName += " " + additional;
          if (family)
            o.displayName += " " + family;
          if (honorific)
            o.displayName = honorific + " " + disp;
          if (honorificSuf)
            o.displayName += ", " + honorificSuf;
        }

        o.name = { givenName: given };
        if (additional)
          o.name.middleName = additional;
        if (family)
          o.name.familyName = family;
        if (honorific)
          o.name.honorificPrefix = honorific;
        if (honorificSuf)
          o.name.honorificSuffix = honorificSuf;

        return true;
      }
      return false;
    },
    function t5(l, o) {
      if (/^email;type=([^;]+);type=([^:]+):(.*)$/i.test(l) ||
          /^email;type=([^;]+):(.*)$/i.test(l)) {

        let type = RegExp.$1, value = RegExp.$2;
        if (RegExp.$3) {
          type = RegExp.$2;
          value = RegExp.$3;
        }

        if (!o.emails)
          o.emails = [];
        o.emails.push({value: value, type: type.toLowerCase()});

        return true;
      }
      return false;
    },
    function t6(l, o) {
      if (/^tel;type=([^:]+):(.*)$/i.test(l)) {

        let type = RegExp.$1.toLowerCase(),
            value = RegExp.$2;
        if ("cell" == type)
          type = "mobile";

        if (!o.phoneNumbers)
          o.phoneNumbers = [];
        o.phoneNumbers.push({value: value, type: type});

        return true;
      }
      return false;
    },
    // fixme: loses work/home type information
    function t7(l, o) {
      if (/^x-(aim|msn|yahoo);type=([^:]+):(.*)$/i.test(l)) {
        if (!o.ims)
          o.ims = [];
        o.ims.push({value: RegExp.$2, type: RegExp.$1.toLowerCase()});
        return true;
      }
      return false;
    },
    function t7(l, o) {
      if (/^bday:(.*)$/i.test(l)) {
        o.birthday = RegExp.$1;
        return true;
      }
      return false;
    },
    function t8(l, o) {
      if (/^org:(.*)/i.test(l)) {

        if (!o.organizations)
          o.organizations = [{}];
        o.organizations[0].name = RegExp.$1;

        return true;
      }
      return false;
    },
    function t9(l, o) {
      if (/^title:(.*)/i.test(l)) {

        if (!o.organizations)
          o.organizations = [{}];
        o.organizations[0].title = RegExp.$1;

        return true;
      }
      return false;
    },
    // FIXME: how to map these?
    function t10(l, o) {
      if (/adr;type=([^:;]*):([^;]*);([^;]*);([^;]*);([^;]*);([^;]*);([^;]*);([^;]*)/i.test(l)) {
        let type = RegExp.$1,
            pobox = RegExp.$2, extendedAddr = RegExp.$3, street = RegExp.$4,
            locality = RegExp.$5, region = RegExp.$6, code = RegExp.$7,
            country = RegExp.$8;
        if (!o.addresses)
          o.addresses = [];
        o.addresses.push({type: type, formatted: extendedAddr,
                          streetAddress: street,
                          locality: locality, region: region,
                          postalCode: code, country: country});
        return true;
      }
      return false;
    },
    function t11(l, o) {
      if (/url;type=([^:]*):(.*)$/i.test(l)) {
        if (!o.urls)
          o.urls = [];
        o.urls.push({type: RegExp.$1, value: RegExp.$2});
        return true;
      }
      return false;
    }
  ],

  import: function GmailImporter_import(completionCallback, progressFunction) {
    this._log.debug("Importing Gmail contacts into People store");

    let req = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
      .createInstance(Components.interfaces.nsIXMLHttpRequest);
    req.open('GET', 'https://mail.google.com/mail/contacts/data/export?' +
             'exportType=GROUP&groupToExport=^Mine&out=VCARD', false);
    req.send(null);

    if (req.status != 200) {
      this._log.warn("Could not download contacts from Google " +
                     "(status " + req.status + ")");
      throw {error:"Unable to get contacts from Google", 
						 message:"Could not download contacts from Google: please make sure you are <a target='_blank' href='https://mail.google.com'>logged in to Gmail</a>"};
    }

    this._log.debug("Contact list downloaded, parsing");
    progressFunction(0.25);

    let people = [], cur = {}, fencepost = true;
    for each (let line in req.responseText.split('\r\n')) {
      progressFunction(0.50);
      if (this.beginTest(line)) {
        if (fencepost) {
          fencepost = !fencepost;
          continue;
        } else {
          people.push(cur);
          cur = {};
          continue;
        }
      }
      let parsed = false;
      for each (let t in this.tests) {
        if (t(line, cur)) {
          parsed = true;
          continue;
        }
      }
      if (!parsed)
        this._log.debug("Could not parse line: " + line);
    }

    this._log.info("Adding " + people.length + " Gmail contacts to People store");
    People.add(people, this, progressFunction);
    progressFunction(0.75);
		completionCallback(null);
  }
};


PeopleImporter.registerBackend(GmailImporter);
