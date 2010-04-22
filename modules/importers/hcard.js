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
let IO_SERVICE = Cc["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);


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


let KNOWN_HCARDS = {"digg.com":1, "twitter.com":1,"status.net":1,"blogger.com":1,"linkedin.com":1};

function isKnownHCardSite(parsedURI)
{
  try {
    var hostName = parsedURI.host;
    var tld = hostName.lastIndexOf(".");
    if (tld > 0) {
      var rootDomainIdx = hostName.lastIndexOf(".", tld-1);
      hostName = hostName.slice(rootDomainIdx+1);
    }
    if (KNOWN_HCARDS[hostName]) return true;
  } catch (e) {
  }
  return false;
}

HCardDiscoverer.prototype = {
  __proto__: DiscovererBackend.prototype,
  get name() "HCardProfile",
  get displayName() "HCard Profile Discovery",
	get iconURL() "",

  discover: function HCardDiscoverer_discover(forPerson, completionCallback, progressFunction) {
    for each (let link in forPerson.getProperty("urls")) {
      let newPerson;
      try {
        var parsedURI = IO_SERVICE.newURI(link.value, null, null);
      
        if (link.rel == 'http://microformats.org/profile/hcard' || isKnownHCardSite(parsedURI))
        {
        
          let discoveryToken = "hcard:" + link.value;
          try 
          {
            progressFunction({initiate:discoveryToken, msg:"Resolving HCard at " + link.value});
            this._log.debug("Resolving HCard at " + link.value);
            try {
              let hcardResource = new Resource(link.value);
              let dom = hcardResource.get().dom;// Synchronous and slow. :(
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
                  if (anElement.tagName.toLowerCase() == 'a' || anElement.tagName.toLowerCase() == 'link')
                  {
                    var href = getAttribute(anElement, "href");
                    var text = anElement.textContent;
                    
                    try {
                      var targetURI = IO_SERVICE.newURI(href, null, parsedURI);
                      this._log.debug("Resolved " + href + " to " + targetURI.spec + " (on " + parsedURI.spec+ ")");

                      // A couple special cases.
                      if (targetURI.host == "twitter.com" && (href.indexOf("/following")>0 ||
                          href.indexOf("/followers")>0 || href.indexOf("/memberships")>0)) continue;
                      if (targetURI.host == "digg.com" && (href.indexOf("/friends/")>0)) continue;


                      // TODO: perform lookup from href domain, or text, to canonical rels
                      var aLink = {
                        type: text, rel: text, value: targetURI.spec
                      };
                      if (newPerson.urls == undefined) newPerson.urls = [];
                      newPerson.urls.push(aLink);
                      urlCheckMap[href] = 1;
                    } catch (e) {
                      this._log.debug("Error while processing hcard link: " + e);
                    }
                  } 
                } else {
                  this._log.debug("Got a rel=me on a non-link: " + anElement);
                }
              }
              
              // And then look for other hcard fields...
              var uFcount = Microformats.count('hCard', dom, {recurseExternalFrames: false});
              if (uFcount > 0) {
                var uFlist = Microformats.get('hCard', dom, {recurseExternalFrames: false});
                var aPerson = uFlist[0];
                processPerson(aPerson, newPerson);
              }
            } catch (e) {
              this._log.warn("Error while loading HCard: " + e);            
            }
            completionCallback(newPerson, discoveryToken);
          } catch (e) {
            if (e != "DuplicatedDiscovery") {
              this._log.warn("Error while loading HCard: " + e);
              progressFunction("Error while handling HCardDiscoverer lookup: " + e);
            }
          }
        }
      } catch (e) {
        this._log.warn("Error while handling HCardDiscoverer lookup on " + link.value +": " + e);
        progressFunction("Error while handling HCardDiscoverer lookup: " + e);
      }
    }
  }
}

function processPerson(aPerson, newPerson)
{
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
      if (anAdr['country-name']) addr.country = anAdr['country-name'];
      if (anAdr['post-office-box']) addr.postOfficeBox = anAdr['post-office-box'];
      if (anAdr['locality']) addr.locality = anAdr['locality'];
      newPerson.addresses.push(addr);
    }
  }
  if (aPerson.bio) {
    newPerson.note = [{type:"bio", value:aPerson.bio}];
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


PeopleImporter.registerDiscoverer(HCardDiscoverer);
