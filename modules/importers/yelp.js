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
Cu.import("resource://people/modules/ext/resource.js");


function YelpAccountDiscoverer() {
  this._log = Log4Moz.repository.getLogger("People.YelpAccountDiscoverer");
  this._log.debug("Initializing importer backend for " + this.displayName);
};

YelpAccountDiscoverer.prototype = {
  __proto__: DiscovererBackend.prototype,
  get name() "Yelp",
  get displayName() "Yelp Account Discoverer",
	get iconURL() "",
  get description() "If you are logged in to Yelp, checks whether any of the e-mail addresses of a contact have a public profile.",  

  discover: function YelpAccountDiscoverer_person(forPerson, completionCallback, progressFunction) {
    for each (let email in forPerson.getProperty("emails")) {
      let newPerson;
      let discoveryToken = "Yelp:" + email.value;
      try {
        progressFunction({initiate:discoveryToken, msg:"Checking address " + email.value + " with Yelp."});
        this._log.debug("Checking address " + email.value + " with Yelp");

        try {
          let yelpResource = new Resource("http://www.yelp.com/member_search?action_search=Search&query=" + encodeURIComponent(email.value));
          let dom = yelpResource.get().dom;
          let resultIterator = Utils.xpath(dom, "//div[@class='result-text']//a");
          if (resultIterator) {
            let elem = resultIterator.iterateNext();
            if (elem) {
              var attrs = elem.attributes, href;
              for(i=attrs.length-1; i>=0; i--) {
                if (attrs[i].name == "href") {
                  href = attrs[i].value;
                  break;
                }
              }
              if (href) {
                if (!newPerson) newPerson = {};

                // href is of the form "/user_details?userid=Dk2IkchUjADbrC05sdsAVQ"
                if (/^\/user_details\?userid=(.+)$/i.test(href)) {
                  let userid = RegExp.$1;
                  if (!newPerson.accounts) newPerson.accounts = [];
                  newPerson.accounts.push({domain:"yelp.com", type:"Yelp", userid:userid});
                }
                if (!newPerson.urls) newPerson.urls = [];
                newPerson.urls.push({type:"Yelp", value:"http://www.yelp.com" + href});
              }
            }
          } else {
            this._log.warn("Account check with Yelp returned status code " + load.status + "\n" + load.responseText);
          }
        } catch (e) {
          this._log.debug("Address " + email.value + " got error from Yelp: " + e);
        }
        completionCallback(newPerson, discoveryToken);
      } catch (e) {
        if (e != "DuplicatedDiscovery") {
          this._log.debug("Yelp error: " + e);
        }
      }
    }
  }
}

PeopleImporter.registerDiscoverer(YelpAccountDiscoverer);
