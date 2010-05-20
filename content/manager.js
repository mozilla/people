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


var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                   .getService(Components.interfaces.nsIWindowMediator);
var win = wm.getMostRecentWindow(null);
window.openURL = win.openURL;

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
      value = '<a target="_blank" href="javascript:void(null)" onclick="openURL(\'' + withScheme + '\')">' + htmlescape(item.value) + '</a>';
		} else if (contentHandlerURL) {
			value = '<a target="_blank" href="javascript:void(null)" onclick="openURL(\'' + contentHandlerURL + encodeURIComponent(item.value).replace(/ /g, '+') + '\')">' + htmlescape(item.value) + '</a>';      
    } else {
			value = htmlescape(item.value);
		}
		appendNameValueBlock(row, label, value);
		container.appendChild(row);
	}
}

function addAccountsList(container, aList)
{
	for each (let item in aList) {
		let row = createDiv("identity");
		
		let label = null;
		if (item.domain) {
			label = htmlescape(item.domain);
		} else {
			label = defaultType;
		}
    let value;
    
    if (item.username) {
      value = htmlescape(item.username);
    } else if (item.userid) {
      value = htmlescape(item.userid);
    } else {
      value = "(no username)";
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
    let favicon = null;
		let IOService = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);
		let itemURL = IOService.newURI(item.value, null, null);
    try {
		  var faviconService = Components.classes["@mozilla.org/browser/favicon-service;1"].getService(Components.interfaces.nsIFaviconService);
      favicon = faviconService.getFaviconImageForPage(itemURL);
    } catch (e) {
      // that's okay
      //favicon = IOService.newURI("http://www.getfavicon.org/?url="+itemURL.host, null, null);
    }

    value = '<a target="_blank" href="' + item.value + '">' + htmlescape(item.value) + '</a>';
    if (favicon) value = "<img src='" + favicon.spec + "'/> " + value;
		appendNameValueBlock(row, label, value);
		container.appendChild(row);
    already[item.type + item.value] = 1;
	}
}


let PeopleManager = {
  onLoad: function() {
    navigator.people.find( {}, null, PeopleManager.loadComplete);
  },

	loadComplete: function(peopleStore) {
    PeopleManager.resultSet = peopleStore;
/*    let results = document.getElementById("contacts");
    let parent = results.parentNode;
    parent.removeChild(results);
    results = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
    results.setAttribute("id", "contacts");
    parent.appendChild(results);*/
    
    if (peopleStore.length == 0) {
      document.getElementById('contactCount').innerHTML = "You have no contacts loaded.  Activate a Contact Service to make them available to Firefox.";
      selectPane("service");
    }
    else
    {
      for each (p in peopleStore) {
        p.givenName = p.getProperty("name/givenName");
        p.familyName = p.getProperty("name/familyName");
      }
      document.getElementById('contactCount').innerHTML = "There are " + peopleStore.length + " people in your contacts.  Click 'Contacts', at the top left, to see them.";
      peopleStore.sort(function(a,b) {
       try {
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
        } catch (e) {
          People._log.warn("Sort error: " + e + "; a.familyName is " + a.familyName + ", b.familyName is " + b.familyName);
          return -1;
        }
      });
      
      PeopleManager.render();
    }
	},
  
  render: function render()
  {
		if (document.getElementById("contactpane").style.display == "none")
			return;
    document.getElementById("contacts").innerHTML = "";
    document.getElementById("contactdetail").innerHTML = "";

    if (contactDisplayMode == 'table') {
			document.getElementById("contactdetail").style.display = "block";
      PeopleManager.renderTable(PeopleManager.resultSet);        
      if (PeopleManager.selectedPersonGUID) selectPerson(PeopleManager.selectedPersonGUID);
    } else if (contactDisplayMode == 'cards') {
			document.getElementById("contactdetail").style.display = "none";
      PeopleManager.renderContactCards(PeopleManager.resultSet);
    }  
  },

	renderContactCards : function(peopleStore)
	{
    liveUpdateShowMode = 'inline-block';
    let results = document.getElementById("contacts");
    var i =0;
    results.setAttribute("class", "contactcards");
    results.style.width = "100%";
    for each (let person in peopleStore) {
      try {
        // let id = person.documents.default;
        let contact = createDiv("contact");
        let summary = createDiv("summary");

        let photo = createDiv("photo");
        let img = document.createElementNS("http://www.w3.org/1999/xhtml", "img");
        let photoURL = "chrome://people/content/images/person.png"; 
        for each (let photo in person.getProperty("photos")) {
          if( photo.type == "thumbnail") {
            photoURL = photo.value;
          } 
        }
        img.setAttribute("src", photoURL);
        photo.appendChild(img);
        summary.appendChild(photo);

        let information = createDiv("information");
        let displayName = createDiv("name");
        displayName.innerHTML = htmlescape(person.getProperty("displayName"));
        information.appendChild(displayName);

        let description = createDiv("description");
        for each (let organization in person.getProperty("organizations")) {
          description.innerHTML += htmlescape(organization.title) + ", " + htmlescape(organization.name) + "<br/>"; 
        }
        information.appendChild(description);
          
        summary.appendChild(information);
        contact.appendChild(summary);

        let identities = createDiv("identities");
        addFieldList(identities, person.getProperty("emails"), "email", "mailto");
        addFieldList(identities, person.getProperty("phoneNumbers"), "phone", "callto");
        addFieldList(identities, person.getProperty("ims"));
        addAccountsList(identities, person.getProperty("accounts"));
        addFieldList(identities, person.getProperty("urls"), "URL", "http");
        addFieldList(identities, person.getProperty("location"));

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
    results.style.width = "200px";
    var i =0;
    results.setAttribute("class", "contacttable");

    let contactList = createDiv("contactlist");
    contactList.setAttribute("id", "contactlist");
    results.appendChild(contactList);

    // Create the detail area:
    let detail = createDiv("tabledetailpane");
    detail.setAttribute("id", "tabledetailpane");
    document.getElementById("contactdetail").appendChild(detail);

    for each (let person in peopleStore) {
      try {
        
        // let id = person.documents.default;
        let contact =  createDiv("contact");

        let img = document.createElementNS("http://www.w3.org/1999/xhtml", "img");
        img.setAttribute("width", "16");
        img.setAttribute("height", "16");
        img.setAttribute("src", "chrome://people/content/images/person_grey.png");
        contact.appendChild(img);


        var dN = person.getProperty("displayName");
        if (dN == null || dN.length ==0) {
          let emails = person.getProperty("emails");
          if (emails && emails.length > 0) {
            dN = emails[0].value;
          } else {
            let accounts = person.getProperty("accounts");
            if (accounts && accounts.length > 0) {
              dN = accounts[0].username;
            } else {
              let orgs = person.getProperty("organizations");
              if (orgs && orgs.length > 0) {
                dN = accounts[0].name;
              } else {
                let urls = person.getProperty("urls");
                if (urls && urls.length > 0) {
                  dN = urls[0].value;
                } else {
                  dN = "Unnamed Contact";
                }
              }
            }
          }
        }

        let a = document.createElementNS("http://www.w3.org/1999/xhtml", "a");
        a.setAttribute("class", "clink");
        a.setAttribute("onclick", "selectPerson('" + person.guid + "')");
        a.appendChild(document.createTextNode(dN));
        contact.appendChild(a);

        // hidden div for name
        let displayName = createDiv("name");
        displayName.setAttribute("style", "display:none");
        displayName.innerHTML = htmlescape(dN);
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
  if (guid != PeopleManager.selectedPersonGUID) gDiscoveryMessage = "";
  PeopleManager.selectedPersonGUID = guid;

  let person = null;
  for each (let aPerson in PeopleManager.resultSet) {
    if (aPerson.guid == guid) {
      person = aPerson;
      break;
    }
  }
  if (!person) return;

  PeopleManager.selectedPerson = person;
  renderDetailPane();
}

function renderDetailPane()
{
  let person = PeopleManager.selectedPerson;
  let container = document.getElementById('tabledetailpane');
  container.innerHTML = "";

  let iframe = document.createElementNS("http://www.w3.org/1999/xhtml", "iframe");
  iframe.setAttribute("style", "border:0px");
  iframe.setAttribute("src", "person:guid:" + person.guid);
  iframe.setAttribute("border", "0");
  iframe.setAttribute("width", "100%");
  iframe.setAttribute("height", "100%");
  container.appendChild(iframe);
  return;


  // summary
  //  photo
  //  information
  //    displayName
  //    description
  // identities
  //   identity
  //    type
  //    value
    
  try {
    let summary = createDiv("summary");
    let photo = createDiv("photo");

    let controls = createDiv("detailcontrols");
    let link = document.createElementNS("http://www.w3.org/1999/xhtml", "a");
    link.setAttribute("onclick", "renderDetailAttributionPane()");
    link.appendChild(document.createTextNode("Where did this information come from?"));
    controls.appendChild(link);
    summary.appendChild(controls);

    let img = document.createElementNS("http://www.w3.org/1999/xhtml", "img");
    let photoURL;
    let backupPhotoURL;
    for each (let photo in person.getProperty("photos")) {
      if( photo.type == "thumbnail") {
        photoURL = photo.value;
      } else if (!backupPhotoURL) {
        backupPhotoURL = photo.value;
      }
    }
    if (!photoURL) {
      if (backupPhotoURL) photoURL = backupPhotoURL;
      else photoURL = "chrome://people/content/images/person.png";
    }
    img.setAttribute("src", photoURL);
    photo.appendChild(img);
    summary.appendChild(photo);

    let information = createDiv("information");
    let displayName = createDiv("name");
    displayName.innerHTML = htmlescape(person.getProperty("displayName"));
    information.appendChild(displayName);

    let description = createDiv("description");
    for each (let organization in person.getProperty("organizations")) {
      if (organization.title && organization.name) {
        description.innerHTML += htmlescape(organization.title) + ", " + htmlescape(organization.name) + "<br/>";       
      } else if (organization.name) {
        description.innerHTML += htmlescape(organization.name) + "<br/>";             
      }
    }
    information.appendChild(description);
      
    summary.appendChild(information);
    container.appendChild(summary);

    let identities = createDiv("identities");
    addFieldList(identities, person.getProperty("emails"), "mailto");
    addFieldList(identities, person.getProperty("phoneNumbers"), "phone");
    addFieldList(identities, person.getProperty("ims"));
    addFieldList(identities, person.getProperty("location"), null, null, "http://maps.google.com/maps?q=");

    var urls = person.getProperty("urls");
    if (urls && urls.length > 0) {
      urls = selectTopLevelUrls(urls);
      let header = createDiv("fieldheader");
      header.innerHTML = "Links:";
      identities.appendChild(header);
      addLinksList(identities, urls);
    }

    var accounts = person.getProperty("accounts");
    if (accounts && accounts.length > 0) {
      let header = createDiv("fieldheader");
      header.innerHTML = "Accounts:";
      identities.appendChild(header);
      addAccountsList(identities, accounts);
    }
    container.appendChild(identities);


    let discovery = createDiv("discoverers");
    discovery.appendChild(document.createTextNode("Find " + person.getProperty("displayName") + " on the web: "));
    let dButton = document.createElementNS("http://www.w3.org/1999/xhtml", "input");
    dButton.setAttribute("type", "submit");
    dButton.setAttribute("onclick", "javascript:doDiscovery()");
    dButton.setAttribute("class", "discovererbutton");
    dButton.setAttribute("value", "Search");
    discovery.appendChild(dButton);

    let dProgress = createDiv("discovererprogress");
    dProgress.setAttribute("id", "discovererprogress");
    if (gDiscoveryMessage) dProgress.innerHTML = gDiscoveryMessage;

    discovery.appendChild(dProgress);

    container.appendChild(discovery);
  } catch (e) {
    People._log.warn(e);
  }
}

function selectTopLevelUrls(urls)
{
  var ret = [];
  for each (var u in urls) {
    var matched = false;
    for each (var r in ret) {
      if (u.value.indexOf(r.value) == 0) {matched = true;break;}
    }
    if (!matched) ret.push(u);
  }
  return ret;
}




function renderDetailAttributionPane()
{
  let person = PeopleManager.selectedPerson;
  container = document.getElementById('tabledetailpane');
  container.innerHTML = "";

  let controls = createDiv("detailcontrols");
  let link = document.createElementNS("http://www.w3.org/1999/xhtml", "a");
  link.setAttribute("onclick", "renderDetailPane()");
  link.appendChild(document.createTextNode("Back to the summary"));
  controls.appendChild(link);
  container.appendChild(controls);

  let svcbox = createDiv("servicedetail");
  for (let aService in person.obj.documents)
  {
    let aDoc = person.obj.documents[aService];

    let header = createDiv("header");
    let svc = PeopleImporter.getService(aService);
    if (svc) {
      header.appendChild(document.createTextNode(svc.explainString()));
      svcbox.appendChild(header);
      traverseRender(aDoc, svcbox);
    }
  }
  container.appendChild(svcbox);
}

function traverseRender(anObject, container)
{
  for (let aKey in anObject)
  {
    if (isArray(anObject[aKey]))
    {
      let count = 1;
      let subhead = createDiv("subhead");
      subhead.appendChild(document.createTextNode(aKey));
      for each (let anItem in anObject[aKey])
      {
        if (typeof anItem == "string") 
        {
          let item = createDiv("item");
          let slot = createDiv("slot");
          let label = createDiv("svcdetaillabel");
          let value = createDiv("svcdetailvalue");
          value.appendChild(document.createTextNode(anItem));
          slot.appendChild(label);
          slot.appendChild(value);
          item.appendChild(slot);
          subhead.appendChild(item);
        }
        else if (anItem.hasOwnProperty("type") && anItem.hasOwnProperty("value"))
        {
          let item = createDiv("item");
          let slot = createDiv("slot");
          let label = createDiv("svcdetaillabel");
          let value = createDiv("svcdetailvalue");
          label.appendChild(document.createTextNode(anItem.type));
          value.appendChild(document.createTextNode(anItem.value));
          slot.appendChild(label);
          slot.appendChild(value);
          item.appendChild(slot);
          if (anItem.rel && anItem.rel != anItem.type) {
            let rel = createDiv("svcdetailvaluerel");
            rel.appendChild(document.createTextNode("rel: " + anItem.rel));
            value.appendChild(rel);
          }
          subhead.appendChild(item);
        }
        else if (anItem.hasOwnProperty("domain")) // specialcase for accounts
        {
          let item = createDiv("item");
          let slot = createDiv("slot");
          let label = createDiv("svcdetaillabel");
          let value = createDiv("svcdetailvalue");
          label.appendChild(document.createTextNode(anItem.domain));
          var username = anItem.username;
          var userid = anItem.userid;
          var un;
          if (username && userid) {
            un = username + " (" + userid + ")";
          } else if (username) un = username;
          else if (userid) un = userid;
          
          if (un) {
            value.appendChild(document.createTextNode(un));
          } else {
            value.appendChild(document.createTextNode("(No username)"));
          }
          slot.appendChild(label);
          slot.appendChild(value);
          item.appendChild(slot);
          subhead.appendChild(item);
        }
        else 
        {
          // generic item; use 'name' if it is present
          let item = createDiv("counteditem");
          
          let textLabel;
          if (anItem.name) textLabel = anItem.name;
          else textLabel = "Item #" + count;

          let slot = createDiv("slot");
          let label = createDiv("svcitemlabel");
          label.appendChild(document.createTextNode(textLabel));
          slot.appendChild(label);
          item.appendChild(slot);

          for (let aSlot in anItem)
          {
            if (aSlot == "name") continue;
            let slot = createDiv("slot");
            let label = createDiv("svcdetaillabel");
            let value = createDiv("svcdetailvalue");
            label.appendChild(document.createTextNode(aSlot));
            value.appendChild(document.createTextNode(anItem[aSlot]));
            slot.appendChild(label);
            slot.appendChild(value);
            item.appendChild(slot);
          }
          subhead.appendChild(item);
          count = count + 1;
        }
      }
      container.appendChild(subhead);
    }
    else if (typeof anObject[aKey] == 'object') 
    {
      let subhead = createDiv("subhead");
      subhead.appendChild(document.createTextNode(aKey));
      let nestbox = createDiv("nestbox");
      subhead.appendChild(nestbox);
      traverseRender(anObject[aKey], nestbox);
      container.appendChild(subhead);
    }
    else
    {
      let slot = createDiv("slot");
      let label = createDiv("svcdetaillabel");
      let value = createDiv("svcdetailvalue");
      label.appendChild(document.createTextNode(aKey));
      value.appendChild(document.createTextNode(anObject[aKey]));
      slot.appendChild(label);
      slot.appendChild(value);
      container.appendChild(slot);
    }
  }
}



var gDiscoveryMessage = "";
function doDiscovery()
{
  let discoverers = PeopleImporter.getDiscoverers();
  gDiscoveryMessage =  "";
  for (let disco in discoverers) {
    try {
      let discoverer = PeopleImporter.getDiscoverer(disco);
      updateDiscoveryProgress("Working...");
      People.doDiscovery(disco, PeopleManager.selectedPersonGUID, 
        function(error) {discoveryComplete(error)}, 
        function(val) {updateDiscoveryProgress(discoverer.name + ": " + val);});
    } catch (e) {
      updateDiscoveryProgress(e.message);
    }
  }
  if (gDiscoveryMessage == "") {
    gDiscoveryMessage = "Nothing was found about this contact using this information.";
  } else {
    gDiscoveryMessage = "Search results:<br/>" + gDiscoveryMessage;
  }
  navigator.people.find( {}, null, PeopleManager.loadComplete);
}

function updateDiscoveryProgress(msg)
{
  if (msg == null) {
    document.getElementById('discovererprogress').style.display = 'none';     
    document.getElementById('discovererprogress').innerHTML = "";
  } else {
    document.getElementById('discovererprogress').style.display = 'block'; 
    document.getElementById('discovererprogress').innerHTML = msg;
  }
}

function discoveryComplete(result) 
{
  if (result && result.success) {
    gDiscoveryMessage = gDiscoveryMessage + result.success + "<br/>";
    updateDiscoveryProgress(gDiscoveryMessage);
  } else {
    updateDiscoveryProgress(result.message);
  }
}


function isArray(obj) {
  return obj != null && obj.constructor.toString() == Array;
}

function htmlescape(html) {
	if (!html) return html;
	if (!html.replace) return html;
  
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
		{domain:"domain.com",username:"value",userid:"1234"},
		{domain:"domain.com",username:"value",userid:"1234"}
	],
	urls: [
		{type:"type",value:"value"},
		{type:"type",value:"value"}
	]
	}
*/

