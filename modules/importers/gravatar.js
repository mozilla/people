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

let EXPORTED_SYMBOLS = [];


const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://people/modules/utils.js");
Cu.import("resource://people/modules/ext/log4moz.js");
Cu.import("resource://people/modules/ext/md5.js");
Cu.import("resource://people/modules/people.js");
Cu.import("resource://people/modules/import.js");

function GravatarImageDiscoverer() {
  this._log = Log4Moz.repository.getLogger("People.GravatarImageImporter");
  this._log.debug("Initializing importer backend for " + this.displayName);
};

GravatarImageDiscoverer.prototype = {
  __proto__: DiscovererBackend.prototype,
  get name() "Gravatar",
  get displayName() "Gravatar Avatar Images",
	get iconURL() "chrome://people/content/images/gravatar.png",
  get description() "Checks whether any of the e-mail addresses of a contact have an avatar picture at Gravatar.",

  discover: function NativeAddressBookImporter_import(forPerson, completionCallback, progressFunction) {
    var discoveryToken;
    for each (let email in forPerson.getProperty("emails")) {
      try {
        progressFunction({initiate:"Gravatar:" + email.value, msg:"Checking address " + email.value + " with Gravatar"});
        this._log.debug("Checking address " + email.value + " with Gravatar");
 
               let md5 = hex_md5(email.value);
        let gravLoad = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);
        gravLoad.open('GET', "http://www.gravatar.com/avatar/" + md5 + "?d=404&s=1", true);

        let discoveryToken = "Gravatar:" + email.value;
        let checkedEmailValue = email.value;
        
        gravLoad.onreadystatechange = function (aEvt) {
          try {
            if (gravLoad.readyState == 4) {
              let newPerson = {"_refreshDate":new Date().getTime()}; 
              if (gravLoad.status == 200) {
                newPerson= {};
                newPerson.photos = [{type:"thumbnail", value:"http://www.gravatar.com/avatar/" + md5}];
  
                // and register a link for their profile page, which the HCard importer will pick up...
                newPerson.urls = [{type:"profile", title:"Gravatar profile for " + checkedEmailValue, value:"http://www.gravatar.com/" + md5}];
                People._log.info("Checked " + checkedEmailValue + ": found a Gravatar");
              } else {
                People._log.info("Checked " + checkedEmailValue + ": no Gravatar");
              }
              completionCallback(newPerson, discoveryToken);
            }
          } catch (e) {
            People._log.info("Error checking with Gravatar: " + e);
          }
        }
        gravLoad.send(null);
      } catch (e) {
        if (e != "DuplicatedDiscovery") {
          this._log.info("Gravatar import error: " + e);
        }
      }
    }
  }
}


PeopleImporter.registerDiscoverer(GravatarImageDiscoverer);
