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
  let attrs = element.attributes;
  let i;
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
  return true;
  try {
    let hostName = parsedURI.host;
    let tld = hostName.lastIndexOf(".");
    if (tld > 0) {
      let rootDomainIdx = hostName.lastIndexOf(".", tld-1);
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
  get description() "Checks whether any of the web pages of a contact have contact data in the HCard microformat.",

  discover: function HCardDiscoverer_discover(forPerson, completionCallback, progressFunction) {
    let that = this;
    let urlList = forPerson.getProperty("urls");
    for each (let link in urlList) {
      try {
        let parsedURI = IO_SERVICE.newURI(link.value, null, null);
        if (link.rel == 'http://microformats.org/profile/hcard' || isKnownHCardSite(parsedURI))
        {
          // suppress recursive discovery down into a site we've already flagged...
          let isPrefix = false;
          for each (let prefixCheck in urlList) {
            if (link.value.length > prefixCheck.value.length && link.value.indexOf(prefixCheck.value) == 0) {
              isPrefix = true;
              break;
            }
          }
          if (isPrefix) continue;
        
          let discoveryToken = "hcard:" + link.value;
          try 
          {
            progressFunction({initiate:discoveryToken, msg:"Resolving HCard at " + link.value});
            this._log.debug("Resolving HCard at " + link.value);
            try {
              let hcardResource = new Resource(link.value);
              let targetValue = link.value;
              // experiment:
              let hcardXHR = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);  
              hcardXHR.open('GET', link.value, true);
              hcardXHR.onreadystatechange = function(aEvt) {
                if (hcardXHR.readyState == 4) {
                  let newPerson = {"_refreshDate":new Date().getTime()}; 
                  if (hcardXHR.status == 200) {
                    // that._log.info("Got 200 for " + targetValue);

                    // While we're here, we're going to check for a feed.
                    let feed = checkPageForFeed(targetValue, hcardXHR.responseText);
                    // TODO: this should really become an attribute of the given link.
                    // But that would require writing back into a different document, which we don't
                    // really have a way to do.
                    if (feed) {
                      let url = { value: targetValue, feed: feed };
                      newPerson.urls = [url];
                    }

                    let dom = hcardResource._parse(hcardResource._uri, hcardXHR.responseText);

                    // First grab all the links with rel="me" -- 
                    let relMeIterator = Utils.xpath(dom, "//*[contains(@rel, 'me')]"); 

                    let anElement;

                    let i;
                    let urlCheckMap = {};
                    while (true) {
                      anElement = relMeIterator.iterateNext();
                      if (anElement == null) break;

                      // can't get XPath tokenize to work on this, so we'll post-process the rel value
                      let rel = getAttribute(anElement, "rel");
                      if (rel.split(" ").indexOf("me") < 0) continue;
                      
                      // For some reason I can't fathom, attributes.href isn't working here.
                      // We'll use a helper function instead.
                      if (anElement.nodeType == Ci.nsIDOMNode.ELEMENT_NODE)
                      {
                        if (anElement.tagName.toLowerCase() == 'a' || anElement.tagName.toLowerCase() == 'link')
                        {
                          let href = getAttribute(anElement, "href");
                          let text = anElement.textContent;
                          try {
                            let targetURI = IO_SERVICE.newURI(href, null, parsedURI);
                            that._log.debug("Resolved " + href + " to " + targetURI.spec + " (on " + parsedURI.spec+ ")");

                            // A couple special cases.
                            if (targetURI.host == "twitter.com" && (href.indexOf("/following")>0 ||
                                href.indexOf("/followers")>0 || href.indexOf("/memberships")>0)) continue;
                            if (targetURI.host == "digg.com" && (href.indexOf("/friends/")>0)) continue;

                            // TODO: perform lookup from href domain, or text, to canonical rels
                            if (text.indexOf("http://") == 0) text = text.substring(7);
                            
                            let aLink = {
                              type: text, rel: text, value: targetURI.spec
                            };
                            if (newPerson == null) newPerson = {};
                            if (newPerson.urls == undefined) newPerson.urls = [];
                            newPerson.urls.push(aLink);
                            urlCheckMap[href] = 1;
                          } catch (e) {
                            that._log.debug("Error while processing hcard link: " + e);
                          }
                        } 
                      } else {
                        that._log.debug("Got a rel=me on a non-link: " + anElement);
                      }
                    }
                    
                    // And then look for other hcard fields...
                    let uFcount = Microformats.count('hCard', dom, {recurseExternalFrames: false});
                    //dump("hCard microformat found " + uFcount + " hcards\n");
                    if (uFcount > 0) {
                      let uFlist = Microformats.get('hCard', dom, {recurseExternalFrames: false});
                      for (var j=0;j<uFcount;j++) {
                        let aPerson = uFlist[j];
                        if (newPerson == null) newPerson = {};
                        processPerson(aPerson, newPerson);
                      }
                    }
                  } else {
                    that._log.info("Error " + hcardXHR.status + " while loading " + link.value);
                  }
                  that._log.info("Completion of " + discoveryToken + ": " + JSON.stringify(newPerson));
                  completionCallback(newPerson, discoveryToken);
                }
              }
              hcardXHR.send(null);
            } catch (e) {
              this._log.warn("Error while loading HCard: " + e);
              progressFunction("Error while handling HCardDiscoverer lookup: " + e);
            }
           } catch (e) {
            if (e != "DuplicatedDiscovery") {
              that._log.warn("Error while loading HCard: " + e);
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

function checkPageForFeed(baseURL, page)
{
  // Look for "a" and "link" elements
  var re = RegExp("<(a|link)[^>]*(</link|/|)>", "gi"); 
  while ((result = re.exec(page)) != null)
  {
    // Inspect each of them for a "type"
    var typeRE = RegExp("type[ \n\t]*=[ \n\t]*('([^']*)'|\"([^\"]*)\")", "gi");
    var typeMatch = typeRE.exec(result);
    if (typeMatch) {
      var type = typeMatch[2] ? typeMatch[2] : typeMatch[3];
      //Activities._log.warn(" type is " + type);

      // If the type is "rss" or "atom" go ahead
      // TODO: Handle fetcher-specific types that we discover through this mechanism
      if (type == "application/rss+xml" || type == "application/atom+xml") {

        //Activities._log.warn("inspecting since type matched; result is " + result);
        // Parse out the href attribute
        var hrefRE = RegExp("href[ \n\t]*=[ \n\t]*('([^']*)'|\"([^\"]*)\")", "gi");
        var hrefMatch = hrefRE.exec(result);
        if (hrefMatch) {
          var href = hrefMatch[2] ? hrefMatch[2] : hrefMatch[3];

          //Activities._log.warn("Got href " + href);
          // Normalize the URL
          var theURI = IO_SERVICE.newURI(href, null, IO_SERVICE.newURI(baseURL, null, null));
          People._log.debug("Found a link with type " + type + "; href is " + href + "; normalized to " + theURI.spec);
          
          return theURI.spec;
        }
      // TODO what if there is more than one???
      }
    }
  }
  return null;
}


function processPerson(aPerson, newPerson)
{
  if (true) {
    //dump("Got aPerson\n");
    for (let k in aPerson) {
      if ("" + aPerson[k] == "[object Object]") {
        //dump(k + ":\n");
        for (let k2 in aPerson[k]) {
          if ("" + aPerson[k][k2] == "[object Object]") {
            //dump("\t" + k2 + ":\n");
            for (let k3 in aPerson[k][k2]) {
              //dump("\t\t" + k3 + ": "+ aPerson[k][k2][k3] + "\n");
            }
          }
          else
          {
            //dump("\t" + k2 + ": "+ aPerson[k][k2] + "\n");
          }
        }
      } else {  
        //dump(k + ": " + aPerson[k] + "\n");
      }
    }
  }
  
  // Twitter, unfortunately, codes all the followers with vcards.
  if (newPerson.displayName && aPerson.fn && aPerson.fn != newPerson.displayName) return;

  if (aPerson.adr) {
    if (newPerson.addresses == undefined) newPerson.addresses = [];
    for each (let anAdr in aPerson.adr) {
      let addr = {};
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
    newPerson.notes = [{type:"bio", value:aPerson.bio}];
  }
  if (aPerson.bday) {
    newPerson.bday = aPerson.bday;
  }
  if (aPerson.category) {
    newPerson.category = aPerson.category;
  }
  if (aPerson.email) {
    if (newPerson.emails == undefined) newPerson.emails = [];
    for each (let anEmail in aPerson.email) {
      let email = {};
      if (anEmail.type) email.type = anEmail.type[0];// TODO handle other values
      else email.type = "email";
      
      if (anEmail.values) email.values = anEmail.values[0];// TODO handle other values
      else if (anEmail.value) email.value = anEmail.value;
      newPerson.emails.push(email);
    }
  }
  if (aPerson.fn) {
    // Bah, linkedin sets this on organizations for some crazy reason
    // skip it until we doublecheck inside the 'n' handler
    // newPerson.displayName = aPerson.fn;
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

    if (aPerson.fn) {
      newPerson.displayName = aPerson.fn;
    }
  }
  if (aPerson.org) {
    // TODO this doesn't match the docs...
    for each (anOrg in aPerson.org) {
      if (anOrg['organization-name']) {
        if (newPerson.organizations == undefined) newPerson.organizations = [];

        let org = {name:anOrg['organization-name']};
        if (aPerson.title) org.title = aPerson.title;
        newPerson.organizations.push(org);
        
      }
    }
    // TODO pull role in here?  or title?
  }
  /*
  else if (aPerson.title) {
    let titleSplit = aPerson.title.split(" at ");
    if (newPerson.organizations == undefined) newPerson.organizations = [];
    if (titleSplit.length == 2) {
      newPerson.organizations.push({name:titleSplit[1], title:titleSplit[0]});
    }
  }*/
  
  if (aPerson.photo) {
    if (newPerson.photos == undefined) newPerson.photos = [];
    for each (let aPhoto in aPerson.photo) {
      newPerson.photos.push( {type:"profile", value:aPhoto} );
    }
  }
  if (aPerson.tel) {
    for each (let aTel in aPerson.tel) {
      let tel = {};
      if (aTel.type) tel.type = aTel.type;
      else tel.type = "phone";

      if (aTel.tel) tel.value = aTel.tel;
      else if (aTel.value) tel.value = aTel.value;

      if (newPerson.phoneNumbers == undefined) newPerson.phoneNumbers = [];
      newPerson.phoneNumbers.push(tel);
    }
  }
  
  // Sadly, the Firefox microformat fails to parse the "bio" class, as used by twitter.
  // Since it frequently has good stuff, we'll parse it manually.
  People._log.info("Checking bio lookup");
  if (aPerson.resolvedNode) {
    People._log.info("Handling bio lookup");
    var bios = Microformats.getElementsByClassName(aPerson.node, "bio");
    People._log.info("Got " + bios.length + "bios");
    for (let i=0;i<bios.length;i++) {
      anElement = bios[i];
      People._log.info("Element " + i + " is " + anElement);
      if (anElement.nodeType == Ci.nsIDOMNode.ELEMENT_NODE)
      {
        let text = anElement.textContent;
        People._log.info("Text is " + text);
        if (!newPerson.notes) newPerson.notes = [];
        newPerson.notes.push({type:"bio", value:text});
      }
    }
  }
  
  /*
  Dropping these for now.  If they're not rel=me, we frequently don't want them.

  if (aPerson.url) {
    for each (let aURL in aPerson.url) {
      if (newPerson.urls == undefined) newPerson.urls = [];
      // need to make sure we haven't already caught these with the rel=me check.
      if (urlCheckMap[aURL]) continue;
      urlCheckMap[aURL] = 1;
      newPerson.urls.push( { type:"URL", value:aURL } );
    }
  }*/            
}


PeopleImporter.registerDiscoverer(HCardDiscoverer);
