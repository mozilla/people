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
 *  Jono DiCarlo <jdicarlo@mozilla.com>
 *  Dan Mills <thunder@mozilla.com>
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
Cu.import("resource://people/modules/people.js");
Cu.import("resource://people/modules/import.js");
Cu.import("resource://people/modules/oauthbase.js");
Cu.import("resource://oauthorizer/modules/oauthconsumer.js");

// XXX portable contacts format is available, however it does not contain
// email addresses, whereas the oauth contacts api does.
// for portable contacts, scope = http://www-opensocial.googleusercontent.com/api/people/

function GmailImporter() {
  this._log = Log4Moz.repository.getLogger("People.GmailImporter");
  this._log.debug("Initializing importer backend for " + this.displayName);
}
GmailImporter.prototype = {
  __proto__: OAuthBaseImporter.prototype,
  get name() "google",
  get displayName() "Gmail Contacts",
  get iconURL() "chrome://people/content/images/gmail.png",
	getPrimaryKey: function (person){
		return person.emails[0].value;
	},

  completionCallback: null,
  progressCallback: null,
  oauthHandler: null,
  authParams: {
      'xoauth_displayname': "Firefox Contacts",
      'scope': 'http://www.google.com/m8/feeds/' // http://www-opensocial.googleusercontent.com/api/people/' // contacts
  },
  consumerToken: 'anonymous',
  consumerSecret: 'anonymous',
  redirectURL: 'http://google.contacts.local/',
  get message() {
    return {
      action: 'http://www.google.com/m8/feeds/contacts/default/full',
      method: "GET",
      parameters: {'v':'2', "max-results":"2000"}
    }
  },
  
  handleResponse: function GmailImporter_handleResponse(req) {

    People._log.info("Google Contacts API: " + req.status+" "+req.statusText
      +"\n"+req.getAllResponseHeaders());
    
    if (req.status == 401) {
      var headers = req.getAllResponseHeaders();
      if (headers.indexOf("oauth_problem=\"token_expired\"") > 0)
      {
        this.oauthHandler.reauthorize();
        return;
      }
      this.completionCallback({error:"API Error", message:"Error while accessing Google Contacts: " + req.status+": "+req.responseText});  
      return;
    }

    //dump(req.responseText + "\n");
    if (!req.responseXML) {
      this.completionCallback({error:"API Error", message:"Error while accessing Google Contacts: " + req.status+": "+req.responseText});  
      return;
    }
    let xmlDoc = req.responseXML;
    let root = xmlDoc.ownerDocument == null ?
      xmlDoc.documentElement : xmlDoc.ownerDocument.documentElement;
    let nsResolver = xmlDoc.createNSResolver(root);

    function evaluate(elem, xpathString) xmlDoc.evaluate(xpathString, elem, nsResolver,
							Ci.nsIDOMXPathResult.ANY_TYPE, null);
    
    let people = [];
    let iter = evaluate(xmlDoc, "//*[local-name()='entry']");
    let elem;
    let groupHrefMap = {}; // map from group hrefs to arrays of person records
    
    while ((elem = iter.iterateNext())) {
      //dump("Checking person:\n");
      try
      {
        let person = {};
	
        //<gd:email rel='http://schemas.google.com/g/2005#other' address='foobar@gmail.com' primary='true'/>
        let emailIter = evaluate(elem, "*[local-name()='email']");
        var email;
        while ((email = emailIter.iterateNext()))
        {
          if (!person.emails) person.emails = [];
          let anEmail = {};
          anEmail.value = email.getAttribute('address');
          anEmail.type = "internet";
          person.emails.push(anEmail);
        }

        let orgIter = evaluate(elem, "*[local-name()='organization']");
        let org = orgIter.iterateNext();
        if (org) {
          let orgNameIter = evaluate(org, "*[local-name()='orgName']");
          let orgTitleIter = evaluate(org, "*[local-name()='orgTitle']");
          let orgName = orgNameIter.iterateNext();
          let orgTitle = orgTitleIter.iterateNext();
          if (orgName || orgTitle) {
            let orgObj = {};
            if (orgName) orgObj.name = orgName;
            if (orgTitle) orgObj.title = orgTitle;
            person.organizations = [orgObj];
          }
        }

        let titleIter = evaluate(elem, "*[local-name()='title']");
        let title = titleIter.iterateNext();
        if (title && title.textContent) {
          let displayName = title.textContent;
          person.displayName = displayName;
          let space = displayName.indexOf(" ");
          if (space > 0) {
            person.name = {givenName:displayName.substring(0, space), familyName:displayName.substring(space+1)};
          } else {
            person.name = {familyName:displayName};
          }
        } else {
          person.displayName = person.emails[0].value;
        }
        
        // Process groups - need to fetch groupMembershipInfo links to get names
        // <gContact:groupMembershipInfo href="http://www.google.com/feeds/contacts/groups/jo%40gmail.com/base/1234a"/>
        let groupMembershipIter = evaluate(elem, "*[local-name()='groupMembershipInfo']");
        while ((group = groupMembershipIter.iterateNext()))
        {
          href = group.getAttribute("href");
          if (!groupHrefMap[href]) groupHrefMap[href] = [];
          groupHrefMap[href].push(person);
          //dump(person.displayName + " is in group " + href + "\n");
        }
        
        people.push(person);
      } catch (e) {
        this._log.info("Error importing GMail contact: " + e.stack);
      }
    }
    
    //dump("People lenght: " + people.length + "\n");

    // At this point we have all the people, and the groupMap contains
    // all of the groupMembershipInfo hrefs that we encountered.  We now
    // need to fetch all those groups to find their names.
    let msg = {
      action: 'http://www.google.com/m8/feeds/groups/default/full',
      method:"GET",
      parameters:{'v':'2', "max-results":"2000"}
    };
    let self = this;
    this.oauthHandler = OAuthConsumer.authorize(
        this.name,
        this.consumerToken,
        this.consumerSecret,
        this.redirectURL,
        function doGroupsImport(svc) { 

          OAuthConsumer.call(svc, msg, function GmailGroupImportCallHandler(req) {
            if (req.status != 200) {
	      People._log.error("Error " + req.status + " while fetching GMail groups: " + req.responseText + "\n");
            } else {
              let xmlDoc = req.responseXML;
              let root = xmlDoc.ownerDocument == null ?
                xmlDoc.documentElement : xmlDoc.ownerDocument.documentElement;
              let nsResolver = xmlDoc.createNSResolver(root);
              function evaluate(elem, xpathString) xmlDoc.evaluate(xpathString, elem, nsResolver,
                        Ci.nsIDOMXPathResult.ANY_TYPE, null);

              let iter = evaluate(xmlDoc, "//*[local-name()='entry']");
              while ((elem = iter.iterateNext())) {
              
                let idIter = evaluate(elem, "*[local-name()='id']");
                let id = idIter.iterateNext();
                if (id) id = id.textContent;
                //dump("Handling gmail contact group " + id + "\n");
              
                if (id) {
                  if (groupHrefMap[id]) { 
                    let titleIter = evaluate(elem, "*[local-name()='title']");
                    let title = titleIter.iterateNext();
                    if (title) title = title.textContent;
                    //dump(" Got title " + title + "\n");
                    if (title) {
                      if (title.indexOf("System Group: ") == 0) {
                        title = title.substring(14); // strip off System Group
                      }
                      for each (let p in groupHrefMap[id]) {
                        //dump("Pushing group " + title + " on person " + p.displayName + "\n");
                        if (!p.tags) p.tags = [];
                        p.tags.push(title);
                      }
                    }
                  } else {
                    //dump(" unused\n");
                  }
                }
              }

              // Now - if a person is not in -any- group, they are a harvested address.
              // We don't want those.
              let peopleToImport = [];
              for each (let p in people)
              {
                if (p.tags && p.tags.length > 0)
                {
                  peopleToImport.push(p);
                  p.tags.push("Gmail");
                }
              }
              self._log.info("Adding " + peopleToImport.length + " Gmail address book contacts to People store");
              People.add(peopleToImport, self, self.progressCallback);
              self.completionCallback(null);
            }
          });

    },
    this.authParams,
    "contacts@labs.mozilla.com");
  }

};


PeopleImporter.registerBackend(GmailImporter);
