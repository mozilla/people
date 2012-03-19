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


function AmazonAccountDiscoverer() {
  this._log = Log4Moz.repository.getLogger("People.AmazonAccountDiscoverer");
  this._log.debug("Initializing discovery backend for " + this.displayName);
};

AmazonAccountDiscoverer.prototype = {
  __proto__: DiscovererBackend.prototype,
  get name() "Amazon",
  get displayName() "Amazon Account Discoverer",
  get iconURL() "",
  get description() "Searches Amazon for a public profile page that belongs to each of the e-mail addresses associated with a contact.",

  discover: function AmazonAccountDiscoverer_person(forPerson, completionCallback, progressFunction) {
    for each (let email in forPerson.getProperty("emails")) {
      let newPerson;
      let discoveryToken = "Amazon:" + email.value;
      try {
        progressFunction({initiate:discoveryToken, msg:"Checking address " + email.value + " with Amazon"});
        try {
          this._log.debug("Checking address " + email.value + " with Amazon");

          let amazonResource = new Resource("http://www.amazon.com/gp/pdp/search?ie=UTF8&flatten=1&keywords=" + encodeURIComponent(email.value) + "&delta=0");
          let dom = amazonResource.get().dom;
          let canonicalLinkIterator = Utils.xpath(dom, "//link[@rel='canonical']");
          
          if (canonicalLinkIterator) {
            let elem = canonicalLinkIterator.iterateNext();
            if (elem) {
              var attrs = elem.attributes, href;
              for(i=attrs.length-1; i>=0; i--) {
                if (attrs[i].name == "href") {
                  href = attrs[i].value;
                  break;
                }
              }
              if (href) {
                // great, found one!  We could pull other information out of the page as well...
                newPerson = {urls:[{type:"Amazon", value:href}]};
              }
            }
          } else {
            this._log.warn("Account check with Amazon returned status code " + load.status + "\n" + load.responseText);
          }
        } catch (e) {
          this._log.debug("Address " + email.value + " got error from Amazon: " + e);
	  this._log.error(e);
	  this._log.error(e.stack);
        }
        completionCallback(newPerson, discoveryToken);
      } catch (e) {
        if (e != "DuplicatedDiscovery") {
          this._log.debug("Address " + email.value + " got error from Amazon: " + e);
        }
      }
    }
  }
}

PeopleImporter.registerDiscoverer(AmazonAccountDiscoverer);
