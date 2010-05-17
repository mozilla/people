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
      parameters: {'v':'2'}
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

    let xmlDoc = req.responseXML;
    let root = xmlDoc.ownerDocument == null ?
      xmlDoc.documentElement : xmlDoc.ownerDocument.documentElement;
    let nsResolver = xmlDoc.createNSResolver(root);

    function evaluate(elem, xpathString) xmlDoc.evaluate(xpathString, elem, nsResolver,
							Ci.nsIDOMXPathResult.ANY_TYPE, null);
    
    let people = [];
    let iter = evaluate(xmlDoc, "//*[local-name()='entry']");
    let elem;
    while ((elem = iter.iterateNext())) {
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

        let titleIter = evaluate(elem, "*[local-name()='title']");
	let title = titleIter.iterateNext();
	if (title && title.textContent) {
	  person.displayName = title.textContent;
	} else {
	  person.displayName = person.emails[0].value;
	}
        people.push(person);
      } catch (e) {
        this._log.info("Error importing GMail contact: " + e.stack);
      }
    }

    this._log.info("Adding " + people.length + " Yahoo address book contacts to People store");
    People.add(people, this, this.progressCallback);
    this.completionCallback(null);  
  }

};


PeopleImporter.registerBackend(GmailImporter);
