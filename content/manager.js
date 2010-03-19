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

function createDiv(clazz)
{
	let aDiv = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
	aDiv.setAttribute("class", clazz);
  return aDiv;
}

function appendNameValueBlock(container, name, value)
{
  // Note that the name and value are not HTML-escaped prior to insertion into the DOM.
	let typeDiv = createDiv("type");
	try {
		typeDiv.innerHTML = name;
	} catch (e) {
		typeDiv.innerHTML = '';	
	}
	let valueDiv = createDiv("value");
	try {
		valueDiv.innerHTML = value;	
	} catch (e) {
		valueDiv.innerHTML = '';		
	}
	container.appendChild(typeDiv);
	container.appendChild(valueDiv);
}

function addFieldList(container, aList, defaultType, valueScheme, contentHandlerURL)
{
	for each (let item in aList) {
		let row = createDiv("identity");
		
		let label = null;
		if (item.type) {
			label = htmlescape(item.type);
		} else {
			label = defaultType;
		}

		let value = null;
		if (valueScheme != undefined) {
			let uri = encodeURIComponent(item.value);
			let withScheme = null;
      
      // To avoid script injection attacks, we need to be a bit careful here.
      // TODO: Escape input to implement XSS protection.
			if (uri.indexOf(valueScheme) == 0) {
				withScheme = item.value;
			} else {
				withScheme = valueScheme + ':' + escape(item.value);
			}
      value = '<a target="_blank" href="' + withScheme + '">' + htmlescape(item.value) + '</a>';
		} else if (contentHandlerURL) {
			value = '<a target="_blank" href="' + contentHandlerURL + encodeURIComponent(item.value).replace(/ /g, '+') + '">' + htmlescape(item.value) + '</a>';      
    } else {
			value = htmlescape(item.value);
		}
		appendNameValueBlock(row, label, value);
		container.appendChild(row);
	}
}

// Produces a list of elements for the "link" field, filtering based on the content-type
// to avoid displaying those elements that would be uninteresting to humans.  Also,
// remove duplicates.
var INTERNAL_LINK_RELS = {
  "http://portablecontacts.net/spec/1.0":1,
  "http://specs.openid.net/auth/2.0/provider":1};

function addLinksList(container, aList, defaultType, valueScheme, contentHandlerURL)
{
  var already = {};
	for each (let item in aList) {
    var ctype= item["content-type"];
    if (ctype != undefined) {
      if (ctype == "text/html" || ctype == "application/atom+xml" || ctype == "text/plain") { // what about rdf+xml?  Google serves FOAF like that.  Hrm.
        // good to go
      } else {
        continue; // skip it.
      }
    }
    if (already[item.type + item.value] != undefined) continue;
    if (item.rel != undefined && INTERNAL_LINK_RELS[item.rel] != undefined) continue;
		let row = createDiv("identity");
		let label = null;
		if (item.type) {
			label = htmlescape(item.type);
		} else {
			label = defaultType;
		}
    value = '<a target="_blank" href="' + item.value + '">' + htmlescape(item.value) + '</a>';
		appendNameValueBlock(row, label, value);
		container.appendChild(row);
    already[item.type + item.value] = 1;
	}
}


let PeopleManager = {
  onLoad: function() {
    navigator.people.find( {}, null, PeopleManager.render);
  },

	render: function(peopleStore) {
    PeopleManager.resultSet = peopleStore;
    let results = document.getElementById("contacts");
    let parent = results.parentNode;
    parent.removeChild(results);
    results = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
    results.setAttribute("id", "contacts");
    parent.appendChild(results);
    
    if (peopleStore.length == 0) {
      document.getElementById('contactCount').innerHTML = "You have no contacts loaded.  Activate a Contact Service to make them available to Firefox.";
      selectPane("service");
    }
    else
    {
      document.getElementById('contactCount').innerHTML = "There are " + peopleStore.length + " people in your contacts.  Click 'Contacts', at the top right, to see them.";
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
       } else if (a.displayName && b.displayName) {
         return a.displayName.localeCompare(b.displayName);
       } else if (a.displayName) {
        return -1;
       } else if (b.displayName) {
        return 1;
       } else {
        return a.guid.localeCompare(b.guid);
       }
      });
      
      if (contactDisplayMode == 'table') {
        PeopleManager.renderTable(peopleStore);        
        if (PeopleManager.selectedPersonGUID) selectPerson(PeopleManager.selectedPersonGUID);
      } else if (contactDisplayMode == 'cards') {
        PeopleManager.renderContactCards(peopleStore);
      }
    }
	},

	renderContactCards : function(peopleStore)
	{
    liveUpdateShowMode = 'inline-block';
    let results = document.getElementById("contacts");
    var i =0;
    results.setAttribute("class", "contactcards");
    for each (let person in peopleStore) {
      try {
        let id = person.documents.default;
        let contact = createDiv("contact");
        let summary = createDiv("summary");

        let photo = createDiv("photo");
        let img = document.createElementNS("http://www.w3.org/1999/xhtml", "img");
        let photoURL = "chrome://people/content/images/person.png"; 
        for each (let photo in id.photos) {
          if( photo.type == "thumbnail") {
            photoURL = photo.value;
          }
        }
        img.setAttribute("src", photoURL);
        photo.appendChild(img);
        summary.appendChild(photo);

        let information = createDiv("information");
        let displayName = createDiv("name");
        displayName.innerHTML = htmlescape(id.displayName);
        information.appendChild(displayName);

        let description = createDiv("description");
        for each (let organization in id.organizations) {
          description.innerHTML += htmlescape(organization.title) + ", " + htmlescape(organization.name) + "<br/>"; 
        }
        information.appendChild(description);
          
        summary.appendChild(information);
        contact.appendChild(summary);

        let identities = createDiv("identities");
        addFieldList(identities, id.emails, "email", "mailto");
        addFieldList(identities, id.phoneNumbers, "phone");
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
   $('#searchbox').liveUpdate($("#contacts")).focus();
	},

  renderTable : function(peopleStore)
  {
    liveUpdateShowMode = 'block';  
    let results = document.getElementById("contacts");
    var i =0;
    results.setAttribute("class", "contacttable");

    let contactList = createDiv("contactlist");
    contactList.setAttribute("id", "contactlist");
    results.appendChild(contactList);

    let detail = createDiv("tabledetailpane");
    detail.setAttribute("id", "tabledetailpane");
    results.appendChild(detail);

    for each (let person in peopleStore) {
      try {
        
        let id = person.documents.default;
        let contact =  createDiv("contact");

        let img = document.createElementNS("http://www.w3.org/1999/xhtml", "img");
        img.setAttribute("width", "16");
        img.setAttribute("height", "16");
        img.setAttribute("src", "chrome://people/content/images/person_grey.png");
        contact.appendChild(img);

        let a = document.createElementNS("http://www.w3.org/1999/xhtml", "a");
        a.setAttribute("class", "clink");
        a.setAttribute("href", "javascript:selectPerson('" + person.guid + "')");
        a.appendChild(document.createTextNode(id.displayName));
        contact.appendChild(a);

        // hidden div for name
        let displayName = createDiv("name");
        displayName.setAttribute("style", "display:none");
        displayName.innerHTML = htmlescape(id.displayName);
        contact.appendChild(displayName);
        
        contactList.appendChild(contact);
        
      } catch (e) {
        // this shouldn't happen...
        People._log.info(e);
        dump(e + "\n");
      }
    }
    $('#searchbox').liveUpdate($("#contactlist")).focus();
  }
};

function selectPerson(guid)
{
  PeopleManager.selectedPersonGUID = guid;
  detail = document.getElementById('tabledetailpane');
  detail.innerHTML = "";

  let id = null;
  for each (let person in PeopleManager.resultSet) {
    if (person.guid == guid) {
      id = person.documents.default;
      break;
    }
  }
  if (!id) return;
    
  // summary
  //  photo
  //  information
  //    displayName
  //    description
  // identities
  //   identity
  //    type
  //    value
    
  let summary = createDiv("summary");
  let photo = createDiv("photo");

  let img = document.createElementNS("http://www.w3.org/1999/xhtml", "img");
  let photoURL = "chrome://people/content/images/person.png"; 
  for each (let photo in id.photos) {
    if( photo.type == "thumbnail") {
      photoURL = photo.value;
    }
  }
  img.setAttribute("src", photoURL);
  photo.appendChild(img);
  summary.appendChild(photo);

  let information = createDiv("information");
  let displayName = createDiv("name");
  displayName.innerHTML = htmlescape(id.displayName);
  information.appendChild(displayName);

  let description = createDiv("description");
  for each (let organization in id.organizations) {
    description.innerHTML += htmlescape(organization.title) + ", " + htmlescape(organization.name) + "<br/>"; 
  }
  information.appendChild(description);
    
  summary.appendChild(information);
  detail.appendChild(summary);

  let identities = createDiv("identities");
  addFieldList(identities, id.emails, "email", "mailto");
  addFieldList(identities, id.phoneNumbers, "phone");
  addFieldList(identities, id.ims);
  addFieldList(identities, id.accounts);
  addLinksList(identities, id.links);
  addFieldList(identities, id.location, null, null, "http://maps.google.com/maps?q=");
  detail.appendChild(identities);

  let allDiscoverers = createDiv("discoverers");
  allDiscoverers.appendChild(document.createTextNode("Search for additional content:"));
  let discoverers = PeopleImporter.getDiscoverers();
  for (let disco in discoverers) {
    let discoverer = PeopleImporter.getDiscoverer(disco);
    let dDiv = createDiv("discovererbadge");
    
    if (discoverer.iconURL && discoverer.iconURL.length) {
      let dImg = document.createElementNS("http://www.w3.org/1999/xhtml", "img");
      dImg.setAttribute("src", discoverer.iconURL);
      dImg.setAttribute("id", disco+"-badge");
      dDiv.appendChild(dImg);
    }
    
    let dLabel = createDiv("discovererlabel");
    dLabel.appendChild(document.createTextNode(discoverer.displayName));
    dDiv.appendChild(dLabel);

    let dButton = document.createElementNS("http://www.w3.org/1999/xhtml", "input");
    dButton.setAttribute("type", "submit");
    dButton.setAttribute("onclick", "javascript:doDiscovery('" + disco + "')");
    dButton.setAttribute("class", "discovererbutton");
    dButton.setAttribute("value", "Find");
    dDiv.appendChild(dButton);

    let dProgress = createDiv("discovererprogress");
    dProgress.setAttribute("id", "discoverer" + disco + "progress");
    dProgress.appendChild(document.createTextNode(""));
    dDiv.appendChild(dProgress);
    allDiscoverers.appendChild(dDiv);
  }
  detail.appendChild(allDiscoverers);

}

function doDiscovery(service)
{
  try {
    updateDiscoveryProgress(service, "Working...");
    People.doDiscovery(service, PeopleManager.selectedPersonGUID, function(error) {discoveryComplete(error, service)}, function(val) {updateDiscoveryProgress(service, val);});
  } catch (e) {
    updateDiscoveryProgress(service, e.message);
  }
}

function updateDiscoveryProgress(service, msg)
{
  if (msg == null) {
    document.getElementById('discoverer' + service + 'progress').style.display = 'none';     
    document.getElementById('discoverer' + service + 'progress').innerHTML = "";
  } else {
    document.getElementById('discoverer' + service + 'progress').style.display = 'block'; 
    document.getElementById('discoverer' + service + 'progress').innerHTML = msg;
  }
}

function discoveryComplete(error, service) 
{
  if (error) {
    updateDiscoveryProgress(service, error.message);
  } else {
    updateDiscoveryProgress(service, null);
    navigator.people.find( {}, null, PeopleManager.render);
  }
}


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

