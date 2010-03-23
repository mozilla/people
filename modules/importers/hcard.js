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
Cu.import("resource://people/modules/ext/resource.js");
Cu.import("resource://people/modules/people.js");
Cu.import("resource://people/modules/import.js");

function HCardDiscoverer() {
  this._log = Log4Moz.repository.getLogger("People.HCardDiscoverer");
  this._log.debug("Initializing importer backend for " + this.displayName);
};

HCardDiscoverer.prototype = {
  __proto__: ImporterBackend.prototype,
  get name() "HCardProfile",
  get displayName() "HCard Profile Discovery",
	get iconURL() "",

  discover: function HCardDiscoverer_discover(forPerson, completionCallback, progressFunction) {
    this._log.debug("Discovering HCard profiles for " + forPerson.displayName);

    for each (let link in forPerson.documents.default.links) {
      try {
        this._log.debug("Checking link " + link.type + ": " + JSON.stringify(link));
      
        if (link.rel == 'http://microformats.org/profile/hcard')
        {
          progressFunction("Resolving HCard at " + link.value);
          let hcardResource = new Resource(link.value);
          let dom = hcardResource.get().dom;

          let relMeIterator = Utils.xpath(dom, "//*[@rel='me']");
          newPerson = {};
          let anElement;
          this._log.debug("relMeIterator.resultType " + relMeIterator.resultType);

          var i;
          while (true) {
            anElement = relMeIterator.iterateNext();
            if (anElement == null) break;
            var href, text;
            
            // For some reason I can't fathom, attributes.href isn't working here.
            // Iterate the attributes and find it the old-fashioned way...
            if (anElement.nodeType == Ci.nsIDOMNode.ELEMENT_NODE)
            {
              anElement = anElement.QueryInterface(Ci.nsIDOMElement);
              if (anElement.tagName.toLowerCase() == 'a')
              {
                var attrs = anElement.attributes;
                for(i=attrs.length-1; i>=0; i--) {
                  if (attrs[i].name == "href") {
                    href = attrs[i].value;
                    break;
                  }
                }
                var text = anElement.textContent;
                
                // TODO: perform lookup from href domain, or text, to canonical rels
                var aLink = {
                  type: text,
                  rel: text,
                  value: href
                };
                
                if (newPerson.links == undefined) newPerson.links = [];
                newPerson.links.push(aLink);
              } else {
                this._log.debug("Found a link with rel=me but it had no href: " + anElement);
              }
            } else {
              this._log.debug("Got a rel=me on a non-link: " + anElement);
            }
          }
          
          var pocoPerson = new PoCoPerson(newPerson);
          pocoPerson.obj.guid = forPerson.guid;
          this._log.debug("New person going in: " + JSON.stringify(pocoPerson.obj));
          People.add(pocoPerson.obj, this, progressFunction);
        }
      } catch (e) {
        this._log.warn("Error while handling HCardDiscoverer lookup: " + e);
        progressFunction("Error while handling HCardDiscoverer lookup: " + e);
      }
    }
    completionCallback(null);
  }
}

PeopleImporter.registerDiscoverer(HCardDiscoverer);
