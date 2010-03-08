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
 *   Chris Beard <cbeard@mozilla.org>
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

function appendNameValueBlock(container, name, value)
// Note that the name and value are not HTML-escaped prior to insertion into the DOM.
{
	let typeDiv = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
	typeDiv.setAttribute("class", "type");
	try {
		typeDiv.innerHTML = name;
	} catch (e) {
		typeDiv.innerHTML = '';	
	}
	let valueDiv = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
	valueDiv.setAttribute("class", "value");
	try {
		valueDiv.innerHTML = value;	
	} catch (e) {
		valueDiv.innerHTML = '';		
	}
	container.appendChild(typeDiv);
	container.appendChild(valueDiv);
}

function addFieldList(container, aList, defaultType, valueScheme)
{
	for each (let item in aList) {
		let row = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
		row.setAttribute("class", "identity");
		
		let label = null;
		if (item.type) 
		{
			label = htmlescape(item.type);
		}
		else
		{
			label = defaultType;
		}

		let value = null;
		if (valueScheme != undefined)
		{
			let uri = encodeURIComponent(item.value);
			let withScheme = null;
			if (uri.indexOf(valueScheme) == 0) {
				withScheme = uri;
			} else {
				withScheme = valueScheme + ':' + escape(uri);
			}
			value = '<a href="' + withScheme + '">' + htmlescape(item.value) + '</a>';
		}
		else
		{
			value = htmlescape(item.value);
		}
		appendNameValueBlock(row, label, value);
		container.appendChild(row);
	}
}

let PeopleManager = {
  onLoad: function() {
    navigator.people.find( {}, null, PeopleManager.render);
  },

	render: function(peopleStore) {
			let results = document.getElementById("results");
			if (results) {
				while (results.lastChild) results.removeChild(results.lastChild);
			}
			PeopleManager.renderContactCards(peopleStore);
	},

	renderContactCards : function(peopleStore)
	{
    let results = document.getElementById("results");
    if(results) {
			if (peopleStore.length == 0) {
				document.getElementById("message").innerHTML = "<br/><br/><br/>You have no contacts loaded.  Activate one of your contact sources, at top right, to make them available to Firefox!"
			}
			else {
				document.getElementById("message").innerHTML = "";
			
				// sort people...
				peopleStore.sort(function(a,b) {
					if (a.familyName && b.familyName) {
						var ret= a.familyName.localeCompare(b.familyName);
						if (ret == 0) {
							return a.givenName.localeCompare(b.givenName);
						} else {
							return ret;
						}
					} else if (a.familyName) {
						return -1;
					} else if (b.familyName) {
						return 1;
					} else {
						return a.displayName.localeCompare(b.displayName);
					}
				});
			
				for each (let person in peopleStore) {
					try {
						
						let id = person.documents.default;
						let contact = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
						contact.setAttribute("class", "contact");
						let summary = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
						summary.setAttribute("class", "summary");

						let photo = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
						let img = document.createElementNS("http://www.w3.org/1999/xhtml", "img");
						let photoURL = "chrome://people/content/images/person.png"; 
						for each (let photo in id.photos) {
							if( photo.type == "thumbnail") {
								photoURL = photo.value;
							}
						}
						img.setAttribute("src", photoURL);
						photo.setAttribute("class", "photo");
						photo.appendChild(img);
						summary.appendChild(photo);

						let information = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
						information.setAttribute("class", "information");
						let displayName = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
						displayName.setAttribute("class", "name");
						displayName.innerHTML = htmlescape(id.displayName);
						information.appendChild(displayName);

						let description = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
						description.setAttribute("class", "description");
						for each (let organization in id.organizations) {
							description.innerHTML += htmlescape(organization.title) + ", " + htmlescape(organization.name) + "<br/>"; 
						}
						information.appendChild(description);
							
						summary.appendChild(information);
						contact.appendChild(summary);

						let identities = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
						identities.setAttribute("class", "identities");
						addFieldList(identities, id.emails, "email", "mailto");
						addFieldList(identities, id.phoneNumbers, "phone", "tel");
						addFieldList(identities, id.ims);
						addFieldList(identities, id.accounts);
						addFieldList(identities, id.links, "URL", "http");
						addFieldList(identities, id.location);

						contact.appendChild(identities);
						results.appendChild(contact);
					} catch (e) {
						// this shouldn't happen...
						People._log.info(e);
						dump(e + "\n");
					}
				 }
			 }
     }
   $('#searchbox').liveUpdate($("#results")).focus();
	}
};


function htmlescape(html) {
	if (!html) return html;
	
  return html.
    replace(/&/gmi, '&amp;').
    replace(/"/gmi, '&quot;').
    replace(/>/gmi, '&gt;').
    replace(/</gmi, '&lt;')
}


/*
 The implicit canonical user for this rendering is:
 
 aPerson: {
	photos: [
		{value:"http://photo", type:"thumbnail"},
		{value:"http://photo", type:"somethingelse"}
	],
	displayName: "GivenName FamilyName",
	organizations: [
	  {name:"OrgName", title:"Title"}
	],
	emails: [
		{type:"type",value:"user@somewhere"},
		{type:"type",value:"user@somewhere"}
	],
	accounts: [
		{type:"type",value:"value"},
		{type:"type",value:"value"}
	],
	links: [
		{type:"type",value:"value"},
		{type:"type",value:"value"}
	]
	}
*/

