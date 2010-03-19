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


function FlickrAccountDiscoverer() {
  this._log = Log4Moz.repository.getLogger("People.FlickrAccountDiscoverer");
  this._log.debug("Initializing importer backend for " + this.displayName);
};

FlickrAccountDiscoverer.prototype = {
  __proto__: ImporterBackend.prototype,
  get name() "Flickr",
  get displayName() "Flickr Account",
	get iconURL() "",

  discover: function FlickrAccountDiscoverer_person(forPerson, completionCallback, progressFunction) {
    let flickrKey = "c0727ed63fc7eef37d8b46c57eec4b2e";
    
    this._log.debug("Discovering Flickr account for " + forPerson.displayName);
    for each (let email in forPerson.emails) {
      progressFunction("Checking address with Flickr.");
      let load = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);
      load.open('GET', "http://api.flickr.com/services/rest/?method=flickr.people.findByEmail&api_key=" + flickrKey + "&find_email=" + encodeURIComponent(email.value), false);
      load.send(null);
      if (load.status == 200) {
        let dom = load.responseXML;
        
        /* success is <rsp stat="ok"><user id="76283545@N00" nsid="76283545@N00"><username>foo</username></user></rsp>
        failure is <rsp stat="fail"><err code="1" msg="User not found" /></rsp> */
        if (dom.documentElement.attributes.stat.value == "ok")
        {
          let user = dom.documentElement.getElementsByTagName("user")[0];
          let nsID = user.attributes.nsid.value;

          progressFunction("Resolving details with Flickr.");
          load.open('GET', "http://api.flickr.com/services/rest/?method=flickr.people.getInfo&api_key=" + flickrKey + "&user_id=" + encodeURIComponent(nsID), false);
          load.send(null);
          let detail = load.responseXML;
          if (detail.documentElement.attributes.stat.value == "ok") 
          {
            let personDOM = detail.documentElement.getElementsByTagName("person")[0];
            let username = personDOM.getElementsByTagName("username")[0];
            let location = personDOM.getElementsByTagName("location")[0];
            let photosurl = personDOM.getElementsByTagName("photosurl")[0];
            let realname = personDOM.getElementsByTagName("realname")[0];
            // let profileurl = personDOM.getElementsByTagName("profileurl")[0];

            newPerson = {};
            if (username) newPerson.accounts = [{type:"Flickr", value:username.textContent}]
            if (location) newPerson.location = [{type:"Location", value:location.textContent}]
            if (photosurl) newPerson.links = [{type:"Flickr", value:photosurl.textContent}]
            if (realname) {
              var n = realname.textContent;
              newPerson.displayName = n;
									
              // For now, let's assume European-style givenName familyName+
              let split = n.split(" ");
              newPerson.name = {};
              newPerson.name.givenName = split[0];
              newPerson.name.familyName = split.splice(1, 1).join(" ");
            }
          
            this._log.debug("Found Flickr account for " + email.value);
            var pocoPerson = new PoCoPerson(newPerson);
            pocoPerson.obj.guid = forPerson.guid;
            People.add(pocoPerson.obj, this, progressFunction);
          }
        }
      } else {
        this._log.warn("Address check with flickr returned status code " + load.status + "\n" + load.responseText);
      }
    }
    completionCallback(null);
  }
}

PeopleImporter.registerDiscoverer(FlickrAccountDiscoverer);
