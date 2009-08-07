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

let PeopleManager = {

  onLoad: function() {
   	navigator.people.find( {}, PeopleManager.onLoad2);
 },

  onLoad2: function(peopleStore) {
    let results = document.getElementById("results");
    if(results) {
      for each (let person in peopleStore) {
        let id = person.documents.default;
        let contact = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
	contact.setAttribute("class", "contact");
        let summary = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
        summary.setAttribute("class", "summary");

        let photo = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
        let img = document.createElementNS("http://www.w3.org/1999/xhtml", "img");
        let photoURL = "chrome://people/content/person.png"; 
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
        displayName.innerHTML = id.displayName;
        information.appendChild(displayName);

        let description = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
        description.setAttribute("class", "description");
	for each (let organization in id.organizations) {
	  description.innerHTML += organization.title + ", " + organization.name + "<br/>"; 
	}
        information.appendChild(description);
		
	summary.appendChild(information);
	contact.appendChild(summary);

	let identities = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
	identities.setAttribute("class", "identities");
	for each (let email in id.emails) {
		let identity = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
		identity.setAttribute("class", "identity");
		let email_type = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
		email_type.setAttribute("class", "type");
		email_type.innerHTML = email.type;
		let email_value = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
		email_value.setAttribute("class", "value");
		let uri = encodeURIComponent(email.value);
		email_value.innerHTML = '<a href="mailto:'+uri+'">'+email.value+'</a>';

		identity.appendChild(email_type);
		identity.appendChild(email_value);

  		identities.appendChild(identity);
	 }

	 for each (let phone in id.phoneNumbers) {
		let identity = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
		identity.setAttribute("class", "identity");

		let phone_type = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
		phone_type.setAttribute("class", "type");
		phone_type.innerHTML = phone.type;
		let phone_value = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
		phone_value.setAttribute("class", "value");
		phone_value.innerHTML = phone.value;	

		identity.appendChild(phone_type);
		identity.appendChild(phone_value);

       		identities.appendChild(identity);
	  }

	  for each (let im in id.ims) {
		let identity = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
		identity.setAttribute("class", "identity");

		let im_type = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
		im_type.setAttribute("class", "type");
		im_type.innerHTML = im.type;
		let im_value = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
		im_value.setAttribute("class", "value");
		im_value.innerHTML = im.value;	

		identity.appendChild(im_type);
		identity.appendChild(im_value);

       		identities.appendChild(identity);
	}

	 for each (let account in id.accounts) {
		let identity = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
		identity.setAttribute("class", "identity");

		let account_type = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
		account_type.setAttribute("class", "type");
		account_type.innerHTML = account.type;
		let account_value = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
		account_value.setAttribute("class", "value");
		account_value.innerHTML = account.value;	

		identity.appendChild(account_type);
		identity.appendChild(account_value);

     			identities.appendChild(identity);
	}
				
	contact.appendChild(identities);
	results.appendChild(contact);		
   	    }
     }
  }
};

window.addEventListener("load",   function() PeopleManager.onLoad(),   false);

var peopleStore = [
    {
      "profileUrl": "http://www.google.com/s2/profiles/user1ID",
      "isViewer": true,
      "id": "user1ID",
      "thumbnailUrl": "http://cbeard.typepad.com/p6230091.jpg",
      "name": {
        "formatted": "Elizabeth Bennet",
        "familyName": "Bennet",
        "givenName": "Elizabeth"
      },
      "emails": [
        {
          "value": "mhashimoto-04@plaxo.com",
          "type": "work",
          "primary": "true"
        }
      ],
      "urls": [
        {
          "value": "http://www.google.com/s2/profiles/user1ID",
          "type": "profile"
        }
      ],
      "photos": [
        {
          "value": "http://cbeard.typepad.com/p6230091.jpg",
          "type": "thumbnail"
        }
      ],
      "displayName": "Elizabeth Bennet"
    },
    {
      "profileUrl": "http://www.google.com/s2/profiles/user2ID",
      "id": "user2ID",
      "name": {
        "familyName": "Darcy",
        "givenName": "Fitzwilliam"
      },
      "urls": [
        {
          "value": "http://www.google.com/s2/profiles/user2ID",
          "type": "profile"
        }
      ],
      "emails": [
        {
          "value": "darcy@gmail.com",
          "type": "work",
          "primary": "true"
        }
      ],
      "displayName": "darcy@gmail.com"
    },
    {
      "name": {
        "formatted": "Jane Bennet"
      },
      "displayName": "Jane Bennet"
    }
];

