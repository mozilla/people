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
Cu.import("resource://people/modules/ext/resource.js");
Cu.import("resource://people/modules/people.js");
Cu.import("resource://people/modules/import.js");
Cu.import("resource://gre/modules/Microformats.js");

function HCardDiscoverer() {
  this._log = Log4Moz.repository.getLogger("People.HCardDiscoverer");
  this._log.debug("Initializing importer backend for " + this.displayName);
};


function getAttribute(element, name)
{
  var attrs = element.attributes;
  var i;
  for(i=attrs.length-1; i>=0; i--) {
    if (attrs[i].name == name) {
      return attrs[i].value;
    }
  }
  return null;
}



HCardDiscoverer.prototype = {
  __proto__: DiscovererBackend.prototype,
  get name() "HCardProfile",
  get displayName() "HCard Profile Discovery",
	get iconURL() "",

  discover: function HCardDiscoverer_discover(forPerson, completionCallback, progressFunction) {
    this._log.debug("Discovering HCard profiles for " + forPerson.displayName);

    let newPerson;
    for each (let link in forPerson.getProperty("urls")) {
      try {
        this._log.debug("Checking link " + link.type + ": " + JSON.stringify(link));
      
        if (link.rel == 'http://microformats.org/profile/hcard')
        {
          progressFunction("Resolving HCard at " + link.value);
          let hcardResource = new Resource(link.value);
          let dom = hcardResource.get().dom;

          if (newPerson == null) newPerson = {};

          // First grab all the links with rel="me" -- 
          let relMeIterator = Utils.xpath(dom, "//*[@rel='me']");
          let anElement;

          var i;
          var urlCheckMap = {};
          while (true) {
            anElement = relMeIterator.iterateNext();
            if (anElement == null) break;
            
            // For some reason I can't fathom, attributes.href isn't working here.
            // We'll use a helper function instead.
            if (anElement.nodeType == Ci.nsIDOMNode.ELEMENT_NODE)
            {
              if (anElement.tagName.toLowerCase() == 'a')
              {
                var href = getAttribute(anElement, "href");
                var text = anElement.textContent;
                
                // TODO: perform lookup from href domain, or text, to canonical rels
                var aLink = {
                  type: text, rel: text, value: href
                };
                if (newPerson.urls == undefined) newPerson.urls = [];
                newPerson.urls.push(aLink);
                urlCheckMap[href] = 1;
              } else {
                this._log.debug("Found a link with rel=me but it had no href: " + anElement);
              }
            } else {
              this._log.debug("Got a rel=me on a non-link: " + anElement);
            }
          }
          
          // And then look for other hcard fields...
          var uFcount = 
            Microformats.count('hCard', dom, {recurseExternalFrames: false});
          if (uFcount > 0) {
            var uFlist = 
                Microformats.get('hCard', dom, {recurseExternalFrames: false});
            var aPerson = uFlist[0];
            
            if (aPerson.adr) {
              if (newPerson.addresses == undefined) newPerson.addresses = [];
              for each (var anAdr in aPerson.adr) {
                var addr = {};
                if (anAdr.type) {
                  // TODO traverse all types
                  addr.type = anAdr.type[0]; 
                }
                if (anAdr['street-address']) addr.streetAddress = anAdr['street-address'];
                if (anAdr['extended-address']) addr.extendedAddress = anAdr['extended-address'];
                if (anAdr['region']) addr.region = anAdr['region'];
                if (anAdr['postal-code']) addr.postalCode = anAdr['postal-code'];
                if (anAdr['country-name']) addr.countryName = anAdr['country-name'];
                if (anAdr['post-office-box']) addr.postOfficeBox = anAdr['post-office-box'];
                if (anAdr['locality']) addr.locality = anAdr['locality'];
                newPerson.addresses.push(addr);
              }
            }
            if (aPerson.bday) {
              newPerson.bday = aPerson.bday;
            }
            if (aPerson.category) {
              newPerson.category = aPerson.category;
            }
            if (aPerson.email) {
              if (newPerson.emails == undefined) newPerson.emails = [];
              for each (var anEmail in aPerson.email) {
                var email = {};
                if (anEmail.type) email.type = anEmail.type[0];// TODO handle other values
                if (anEmail.values) email.values = anEmail.values[0];// TODO handle other values
                newPerson.emails.push(email);
              }
            }
            if (aPerson.fn) {
              newPerson.displayName = aPerson.fn;
            }
            if (aPerson.geo) {
              // TODO
            }
            if (aPerson.key) {
              if (newPerson.publicKeys == undefined) newPerson.publicKeys = [];
              for each (aKey in aPerson.key) {
                newPerson.publicKeys.push(aKey);
              }
            }
            if (aPerson.n) {
              if (newPerson.name == undefined) newPerson.name = {};
              if (aPerson.n['given-name']) newPerson.name.givenName = aPerson.n['given-name'][0];
              if (aPerson.n['additional-name']) newPerson.name.additional = aPerson.n['additional-name'][0];
              if (aPerson.n['family-name']) newPerson.name.familyName = aPerson.n['family-name'][0];
            }
            if (aPerson.org) {
              // TODO this doesn't match the docs...
              for each (anOrg in aPerson.org) {
                if (anOrg['organization-name']) {
                  if (newPerson.organizations == undefined) newPerson.organizations = [];
                  newPerson.organizations.push({name:anOrg['organization-name']});
                }
              }
              // TODO pull role in here?  or title?
            }
            if (aPerson.photo) {
              if (newPerson.photos == undefined) newPerson.photos = [];
              for each (var aPhoto in aPerson.photo) {
                newPerson.photos.push( {type:"profile", value:aPhoto} );
              }
            }
            if (aPerson.tel) {
              for each (var aTel in aPerson.tel) {
                var tel = {};
                if (aTel.type) tel.type = aTel.type;
                if (aTel.tel) tel.value = aTel.tel;
              if (newPerson.phoneNumbers == undefined) newPerson.phoneNumbers = [];
                newPerson.phoneNumbers.push(tel);
              }
            }
            /*
            Dropping these for now.  If they're not rel=me, we frequently don't want them.
            
            if (aPerson.url) {
              for each (var aURL in aPerson.url) {
                if (newPerson.urls == undefined) newPerson.urls = [];
                // need to make sure we haven't already caught these with the rel=me check.
                if (urlCheckMap[aURL]) continue;
                urlCheckMap[aURL] = 1;
                newPerson.urls.push( { type:"URL", value:aURL } );
              }
            }*/
          }
        }
      } catch (e) {
        this._log.warn("Error while handling HCardDiscoverer lookup: " + e);
        progressFunction("Error while handling HCardDiscoverer lookup: " + e);
      }
    }
    completionCallback({success: newPerson ? "Loading a profile link found some link data." : ""});
    return newPerson;
  }
}

PeopleImporter.registerDiscoverer(HCardDiscoverer);
