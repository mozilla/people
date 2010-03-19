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

WebfingerDiscoverer.prototype = {
  __proto__: ImporterBackend.prototype,
  get name() "Webfinger",
  get displayName() "Webfinger Service Discovery",
	get iconURL() "",

  discover: function WebfingerDiscoverer_discover(forPerson, completionCallback, progressFunction) {
    this._log.debug("Discovering Webfinger services for " + forPerson.displayName);

    for each (let email in forPerson.emails) {
      try {
        progressFunction("Checking for webfinger for address " + email.value);
        this._log.debug("Checking for webfinger for address " + email.value);
        var split = email.value.split("@");
        if (split.length != 2) {
          this._log.debug("Cannot parse " + email.value);
          progressFunction("Cannot parse " + email.value);
          continue;
        }
        var id = split[0];
        var domain = split[1];

        // Check for the host-meta
        var hostmetaURL = "http://" + domain + "/.well-known/host-meta";
        var hostmeta = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);  
        hostmeta.open('GET', hostmetaURL, false);
        hostmeta.send(null)
        if (hostmeta.status != 200) {
          this._log.debug("Host " + domain + " doesn't have a host-meta file, and therefore does not support webfinger.");
          progressFunction("" + domain + " does not support webfinger.");
          continue;
        }

        var parser = Components.classes["@mozilla.org/xmlextras/domparser;1"].createInstance(Components.interfaces.nsIDOMParser);
        var hostmeta = parser.parseFromString(hostmeta.responseText, "text/xml");
        if (hostmeta.documentElement.nodeName == "parsererror") {
          this._log.debug("Unable to parse host-meta file for " + domain);
          progressFunction("Unable to parse host-meta file for " + domain);
          continue;
        }
        var host = hostmeta.documentElement.getElementsByTagNameNS("http://host-meta.net/xrd/1.0", "Host");
        if (!host || host.length == 0) {
          host = hostmeta.documentElement.getElementsByTagName("Host"); // hm, well, try it without a namespace
          if (!host || host.length == 0) {
            this._log.debug("Unable to find a Host element in the host-meta file for " + domain);
            progressFunction("Unable to find a Host element in the host-meta file for " + domain);
            continue;
          }
        }

      // Experimental support for domain aliasing
      // if (host[0].textContent != domain) {
      // 	return "Error: Host-meta contained a Host specification that did not match the host of the account.  Domain aliasing is not supported.";
      //	}
        var links = hostmeta.documentElement.getElementsByTagName("Link")
        var userXRDURL = null;
        for (var i in links) {
          var link = links[i];
          var rel = link.getAttribute("rel");
          if (rel) {
            if (rel.toLowerCase() == "lrdd") {
              var template = link.getAttribute("template");
              var userXRDURL = template.replace("{uri}", encodeURI(email.value));
              break;
            }
          }  
        }	
        if (userXRDURL == null) {
          this._log.debug("Unable to find a Link with a rel of lrdd and a valid template in host-meta for " + domain);
          progressFunction("Unable to find a Link with a rel of lrdd and a valid template in host-meta for " + domain);
          continue;
        }

        let xrdLoader = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);
        xrdLoader.open('GET', userXRDURL, false);
        xrdLoader.send(null);
        if (xrdLoader.status == 200) {
          // Happy days, let's parse it
          progressFunction("Found XRD document; reading it");
          this._log.debug("Found XRD document; reading it");
          this._log.debug(xrdLoader.responseText);
          let dom = xrdLoader.responseXML;

  /*
  <XRD xmlns='http://docs.oasis-open.org/ns/xri/xrd-1.0'>
    <Subject>acct:bradfitz@gmail.com</Subject>
    <Alias>http://www.google.com/profiles/bradfitz</Alias>
    <Link rel='http://portablecontacts.net/spec/1.0' href='http://www-opensocial.googleusercontent.com/api/people/'/>
    <Link rel='http://webfinger.net/rel/profile-page' href='http://www.google.com/profiles/bradfitz' type='text/html'/>
    <Link rel='http://microformats.org/profile/hcard' href='http://www.google.com/profiles/bradfitz' type='text/html'/>
    <Link rel='http://gmpg.org/xfn/11' href='http://www.google.com/profiles/bradfitz' type='text/html'/>
    <Link rel='http://specs.openid.net/auth/2.0/provider' href='http://www.google.com/profiles/bradfitz'/>
    <Link rel='describedby' href='http://www.google.com/profiles/bradfitz' type='text/html'/>
    <Link rel='describedby' href='http://s2.googleusercontent.com/webfinger/?q=bradfitz%40gmail.com&amp;fmt=foaf' type='application/rdf+xml'/>
    <Link rel='http://schemas.google.com/g/2010#updates-from' href='http://buzz.googleapis.com/feeds/115863474911002159675/public/posted' type='application/atom+xml'/>
  </XRD>
  */    
          var aliasList = dom.documentElement.getElementsByTagName("Alias");
          var linkList = dom.documentElement.getElementsByTagName("Link");

          newPerson = {};
          
          // not sure how useful this is.
          /*for (var alias in aliasList)
          {
            if (newPerson.links == undefined) newPerson.links =[];
            newPerson.links.push( {type:"Alias", alias.textContent} );
          }*/
          
          
          // Many XRDs included duplicated links that map to the same user concept.
          for (var i=0;i<linkList.length;i++)
          {
            var link = linkList[i];
            if (newPerson.links == undefined) newPerson.links =[];
            var rel = link.attributes.rel;
            if (rel.value in REL_DICTIONARY) {

              var obj = {
                type:REL_DICTIONARY[rel.value], 
                rel:rel.value, 
                value:link.attributes.href.value
              };
              if (link.attributes['type'] != undefined) {
                obj['content-type'] = link.attributes.type.value;
              }

              this._log.debug("Pushing " + obj);
              newPerson.links.push(obj);
            } else {
              this._log.debug("Unknown rel " + rel.value);
            }
          }
          var pocoPerson = new PoCoPerson(newPerson);
          pocoPerson.obj.guid = forPerson.guid;
          this._log.debug("New person going in: " + JSON.stringify(pocoPerson.obj));
          People.add(pocoPerson.obj, this, progressFunction);
        } else {
          this._log.debug("Received error (" + xrdLoader.status + " while loading service page for " + email.value);
          progressFunction("Received error (" + xrdLoader.status + " while loading service page for " + email.value);
        }
      } catch (e) {
        this._log.warn("Error while handling Webfinger lookup: " + e);
        progressFunction("Error while handling Webfinger lookup: " + e);
      }
    }
    completionCallback(null);
  }
}

PeopleImporter.registerDiscoverer(WebfingerDiscoverer);
