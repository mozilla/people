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
	typeDiv.innerHTML = name;
	let valueDiv = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
	valueDiv.setAttribute("class", "value");
	valueDiv.innerHTML = value;	
	container.appendChild(typeDiv);
	container.appendChild(valueDiv);
}
function addFieldList(container, aList)
{
	var any= false;
	for each (let item in aList) {
		any = true;
		let row = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
		row.setAttribute("class", "identity");
		appendNameValueBlock(row, htmlescape(item.type), htmlescape(item.value));
		container.appendChild(row);
	}
	return any;
}

let PeopleDisclosure = {
  onLoad: function() {
		result = People.find({});
		PeopleDisclosure.onResult(result);
  },

	onResult: function(peopleStore) {
		this.peopleResults = peopleStore;
		for each (var p in peopleStore) {
			selectedPeople[p.guid] = false;
		}
		this.render();
	},

	render: function() {
		let results = document.getElementById("results");
		if (results) {
			while (results.lastChild) results.removeChild(results.lastChild);
		}
		this.renderContactCards(this.peopleResults);
	},

	renderContactCards : function(peopleStore)
	{
    let results = document.getElementById("results");
    if(results) {
			if (peopleStore.length == 0) {
				document.getElementById("message").innerHTML = "<br/><br/><br/>You have no contacts loaded in Firefox.  Select \"Contacts\" from the Tools menu to activate some."
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
					let anyDataVisible = false;
					let id = person.documents.default;
					let contact = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
					contact.setAttribute("class", "contact");

					let summary = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
					summary.setAttribute("class", "summary");

					let checkbox = document.createElementNS("http://www.w3.org/1999/xhtml", "input");
					checkbox.setAttribute("type", "checkbox");
					checkbox.setAttribute("name", person.guid);
					checkbox.setAttribute("class", "disclosureCheckbox");
					checkbox.setAttribute("onclick", "selectedPeople['" + person.guid + "']=this.checked");
					if (selectedPeople[person.guid]) checkbox.setAttribute("checked", "true");
					summary.appendChild(checkbox);

					let photo = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
					let img = document.createElementNS("http://www.w3.org/1999/xhtml", "img");
					let photoURL = "chrome://people/content/images/person_grey.png"; 
					for each (let photo in id.photos) {
						if( photo.type == "thumbnail") {
							photoURL = photo.value;
						}
					}
					if (photoURL) {
						img.setAttribute("src", photoURL);
						photo.setAttribute("class", "photo");
						photo.appendChild(img);
						summary.appendChild(photo);
					}

					let information = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
					information.setAttribute("class", "information");

					let displayName = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
					displayName.setAttribute("class", "name");

					if (fieldActive["displayName"] == true) {
						displayName.innerHTML = htmlescape(id.displayName);
						anyDataVisible = true;
					}
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
					if (fieldActive["emails"]== true) {
						for each (let email in id.emails) {
							anyDataVisible = true;
							let identity = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
							identity.setAttribute("class", "identity");

							let uri = encodeURIComponent(email.value);
							appendNameValueBlock(identity, htmlescape(email.type) || "email", 
																	'<a href="mailto:'+escape(uri)+'">'+htmlescape(email.value)+'</a>');
							identities.appendChild(identity);
						 }
					}

					if (fieldActive["phoneNumbers"] == true) anyDataVisible |= addFieldList(identities, id.phoneNumbers);
					//addFieldList(identities, id.ims);
					//addFieldList(identities, id.accounts);
					if (fieldActive["links"] == true) anyDataVisible |= addFieldList(identities, id.links);
					//addFieldList(identities, id.location);

					contact.appendChild(identities);
					
					if (anyDataVisible)
						results.appendChild(contact);
				 }
			 }
     }
	}
};


function htmlescape(html) {
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

