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


let REL_DICTIONARY = {
  'http://portablecontacts.net/spec/1.0':'Portable Contacts API',
  'http://webfinger.net/rel/profile-page':'profile',
  'http://microformats.org/profile/hcard':'profile',
  'http://gmpg.org/xfn/11':'profile', // Hrm.. really?
  'http://specs.openid.net/auth/2.0/provider':'OpenID Provider',
  'describedby':'profile',
  // describedby/@type=application/rdf+xml ... how to handle this one?
  'http://schemas.google.com/g/2010#updates-from':'updates' // type='application/atom+xml'
};

function WebfingerDiscoverer() {
  this._log = Log4Moz.repository.getLogger("People.WebfingerDiscoverer");
  this._log.debug("Initializing importer backend for " + this.displayName);
};

function extractLRDDTemplateFromHostMetaText(text, progressFn)
{
  var parser = Components.classes["@mozilla.org/xmlextras/domparser;1"].createInstance(Components.interfaces.nsIDOMParser);
  var parsedDoc = parser.parseFromString(text, "text/xml");
  if (parsedDoc.documentElement.nodeName == "parsererror") {
    throw {error:"Unable to parse host-meta file for " + domain};
  }
  var host = parsedDoc.documentElement.getElementsByTagNameNS("http://host-meta.net/xrd/1.0", "Host");
  if (!host || host.length == 0) {
    host = parsedDoc.documentElement.getElementsByTagName("Host"); // hm, well, try it without a namespace
    if (!host || host.length == 0) {
      throw {error:"Unable to find a Host element in the host-meta file for " + domain};
    }
  }

// Experimental support for domain aliasing
// if (host[0].textContent != domain) {
// 	return "Error: Host-meta contained a Host specification that did not match the host of the account.  Domain aliasing is not supported.";
//	}
  var links = parsedDoc.documentElement.getElementsByTagName("Link")
  var userXRDURL = null;
  for (var i in links) {
    var link = links[i];
    var rel = link.getAttribute("rel");
    if (rel) {
      if (rel.toLowerCase() == "lrdd") {
        var template = link.getAttribute("template");
        return template;
      }
    }  
  }	
  return null;
}


WebfingerDiscoverer.prototype = {
  __proto__: DiscovererBackend.prototype,
  get name() "Webfinger",
  get displayName() "Webfinger Service Discovery",
	get iconURL() "",
  get description() "Checks whether any of the e-mail addresses of a contact have public links available through the Webfinger protocol.",  

  discover: function WebfingerDiscoverer_discover(forPerson, completionCallback, progressFunction) {
    let that = this;
    for each (let email in forPerson.getProperty("emails")) {
      try {
        let discoveryToken = "Webfinger:" + email.value;
        progressFunction({initiate:discoveryToken, msg:"Checking for webfinger for address " + email.value});
        People._log.debug("Checking for webfinger for address " + email.value);
        let split = email.value.split("@");
        if (split.length != 2) {
          People._log.debug("Cannot parse " + email.value);
          continue;
        }
        let id = split[0];
        let domain = split[1];

        // Check for the host-meta
        let hostmetaURL = "http://" + domain + "/.well-known/host-meta";
        let hostmeta = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);  
        hostmeta.open('GET', hostmetaURL, true);
        People._log.debug("Making hostmeta request to " + hostmetaURL);
        hostmeta.email = email.value;
        hostmeta.onreadystatechange = function (aEvt) {
          let hmToken = discoveryToken;
          if (hostmeta.readyState == 4) {
            try {
              if (hostmeta.status != 200) {
                dump("Status " + hostmeta.status + " accessing " + hostmetaURL);
                throw {error:""+domain + " does not support webfinger."};
              }
              var template = extractLRDDTemplateFromHostMetaText(hostmeta.responseText);
              var userXRDURL = null;
              if (template) userXRDURL = template.replace("{uri}", encodeURI(hostmeta.email));

              if (userXRDURL == null) {
                throw {error:"" + domain + " does not support webfinger (no Link with an lrdd rel and template attribute)"};
              }
              let xrdLoader = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);
              People._log.debug(userXRDURL);
              xrdLoader.open('GET', userXRDURL, true);

              xrdLoader.onreadystatechange = function (aEvt) {
                let xrdToken = hmToken;
                if (xrdLoader.readyState == 4) {
                  let newPerson;
                  if (xrdLoader.status == 200) {
                    let dom = xrdLoader.responseXML;
                    let linkList = dom.documentElement.getElementsByTagName("Link");
                    if (newPerson == undefined) newPerson = {};
                    
                    // not sure how useful this is.
                    // var aliasList = dom.documentElement.getElementsByTagName("Alias");                  
                    /*for (var alias in aliasList) {
                      if (newPerson.links == undefined) newPerson.links =[];
                      newPerson.links.push( {type:"Alias", alias.textContent} );
                    }*/
                  
                    // Many XRDs include duplicated links that map to the same user concept.
                    for (var i=0;i<linkList.length;i++)
                    {
                      let link = linkList[i];
                      if (newPerson.urls == undefined) newPerson.urls =[];
                      let rel = link.attributes.rel;
                      if (rel.value in REL_DICTIONARY) {

                        let obj = {
                          type:REL_DICTIONARY[rel.value], 
                          rel:rel.value, 
                          value:link.attributes.href.value
                        };
                        if (link.attributes['type'] != undefined) {
                          obj['content-type'] = link.attributes.type.value;
                        }
                        People._log.debug("Pushing " + obj.type + ":" + obj.value);
                        newPerson.urls.push(obj);
                      } else {
                        People._log.debug("Unknown rel " + rel.value);
                        // push it anyway
                        let obj = {
                          type:"Data",
                          rel:rel.value, 
                          value:link.attributes.href.value
                        };
                        if (link.attributes['type'] != undefined) {
                          obj['content-type'] = link.attributes.type.value;
                        }
                        People._log.debug("Pushing unknown rel:" + obj.value);
                        newPerson.urls.push(obj);
                      }
                    }
                  }
                  completionCallback(newPerson, xrdToken);
                }
              }
              xrdLoader.send(null);
            } catch (e) {
              People._log.debug("Webfinger: "+ e + "; " + e.error);
              completionCallback(null, hmToken);
            }
          }
        }
        hostmeta.send(null);
      } catch (e) {
        if (e != "DuplicatedDiscovery") {
          People._log.warn("Error while handling Webfinger lookup: " + e);
          try {
            if (discoveryToken) completionCallback(null, discoveryToken);
          } catch (e) {}
        }
      }
    }
  }
}

PeopleImporter.registerDiscoverer(WebfingerDiscoverer);
