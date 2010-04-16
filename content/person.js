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
 *   Michael Hanson <mhanson@mozilla.com>
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
const Cu = Components.utils;
const Cc = Components.classes;

Cu.import("resource://people/modules/people.js");
Cu.import("resource://people/modules/import.js");    

var FAVICON_SERVICE = Cc["@mozilla.org/browser/favicon-service;1"].getService(Components.interfaces.nsIFaviconService);
var IO_SERVICE = Cc["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);


var gPerson = null;
var gContainer;
var gDocuments;
var gPendingDiscoveryCount=0;

function createDiv(clazz)
{
	let aDiv = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
	aDiv.setAttribute("class", clazz);
  return aDiv;
}

function createElem(type, clazz)
{
	let anElem = document.createElementNS("http://www.w3.org/1999/xhtml", type);
	if (clazz) anElem.setAttribute("class", clazz);
  return anElem;
}

function renderTypeValueList(title, objectType, list, options)
{
  var itemsDiv = createDiv("vlist");
  itemsDiv.setAttribute("id", objectType + "s");
  var titleDiv = createDiv("vlist_title");
  titleDiv.setAttribute("id", objectType + "stitle");
  titleDiv.appendChild(document.createTextNode(title + ":"));
  itemsDiv.appendChild(titleDiv);

  var already = {};
  for each (var item in list) {
    var ctype= item["content-type"];
    if (ctype != undefined) {
      if (ctype == "text/html" || ctype == "application/atom+xml" || ctype == "text/plain") { // what about rdf+xml?  Google serves FOAF like that.  Hrm.
      } else {
        continue; // skip it.
      }
    }
    if (already[item.type + item.value] != undefined) continue;
    already[item.type + item.value] = 1;

    var itemDiv = createDiv("item");
    var itemTypeDiv = createDiv("type");
    var itemValueDiv = createDiv("value");
    if (item.type) {
      itemTypeDiv.appendChild(document.createTextNode(item.type));
    }

    var favicon= null;
    if (options && options.includeFavicon) {
      try {
        favicon = FAVICON_SERVICE.getFaviconImageForPage(IO_SERVICE.newURI(item.value, null, null));
      } catch (e) {}
      if (favicon) {
        var faviconImg = createElem("img");
        faviconImg.setAttribute("src", favicon.spec);
        faviconImg.setAttribute("class", "valuefavicon");
        itemValueDiv.appendChild(faviconImg);
      }
    }
    var value = item.value;
    if (options && options.itemRender) value = options.itemRender(item);
    
    if (options && options.linkify) {
      var link = createElem("a");
      link.setAttribute("href", value);
      link.setAttribute("target", "_blank");
      link.appendChild(document.createTextNode(value));
      itemValueDiv.appendChild(link);
    } else if (options && options.linkToURL) {
      var link = createElem("a");
      link.setAttribute("href", options.linkToURL + value);
      link.setAttribute("target", "_blank");
      link.appendChild(document.createTextNode(value));
      itemValueDiv.appendChild(link);    
    } else {
      itemValueDiv.appendChild(document.createTextNode(item.value));
    }
    itemDiv.appendChild(itemTypeDiv);
    itemDiv.appendChild(itemValueDiv);
    itemsDiv.appendChild(itemDiv);
  }
  return itemsDiv;
}


function initPerson(container, identifier)
{
  gContainer = container;

  var input = constructDocumentFromIdentifier(identifier);
  var query = constructQueryFromDocument(input);
  var searchResult = null;
  if (query.__count__ > 0) {
    searchResult = People.find(query);
  }
  if (searchResult && searchResult.length > 0) {
    gPerson = searchResult[0];
    gDocuments = searchResult[0].obj.documents;
  } else {
    gDocuments = {input:input};
    gPerson = new Person({documents:gDocuments});
  }
  renderPerson();
  startDiscovery(gPerson);
}

function constructDocumentFromIdentifier(identifier)
{
  var inputDoc = {};
  if (identifier.indexOf("@") > 0) {
    // let's guess it's an email
    inputDoc.emails = [{type:"email", value:identifier}];
  } else if (identifier.indexOf("http") == 0) {
    // probably a link
    inputDoc.urls = [{type:"URL", value:identifier}];
  } else {
    // not sure, we'll have to guess it's a name for now
    inputDoc.displayName = identifier;
    // return IO_SERVICE.newChannel("data:text/html,No actionable identifier provided.", null, null);
  }
  return inputDoc;
}

function constructQueryFromDocument(doc)
{
  var ret = {};
  if (doc.emails && doc.emails.length>0) ret.emails = doc.emails[0].value;
  if (doc.displayName) ret.displayName = doc.displayName;
  return ret;
}

function renderPerson()
{  
  try {
    var personBox = createDiv("person");
    
    if (gPendingDiscoveryCount>0) {
      var spinnerBox = createDiv("spinner");
      var spinnerImg = createElem("img");
      spinnerImg.setAttribute("src", "chrome://people/content/images/loading.gif");
      spinnerImg.setAttribute("title", "" + gPendingDiscoveryCount + " queries pending");
      spinnerBox.appendChild(spinnerImg);
      personBox.appendChild(spinnerBox);
    }
    
    var photos = gPerson.getProperty("photos");
    if (photos) {
      var photoBox = createDiv("photo");
      var photoImg = createElem("img");
      photoImg.setAttribute("src", photos[0].value);
      photoImg.setAttribute("class", "profilePhoto");
      photoBox.appendChild(photoImg);
      personBox.appendChild(photoBox);
    }

    var dN = gPerson.getProperty("displayName");
    if (dN) {
      var displayNameDiv = createDiv("displayName");
      displayNameDiv.appendChild(document.createTextNode(dN));
      personBox.appendChild(displayNameDiv);
      document.title = dN;
    }

    var emails = gPerson.getProperty("emails");
    if (emails) {
      personBox.appendChild(renderTypeValueList("Email Addresses", "email", emails));
    }
    var phones = gPerson.getProperty("phoneNumbers");
    if (phones) {
      personBox.appendChild(renderTypeValueList("Phone Numbers", "phone", phones));
    }
    var locations = gPerson.getProperty("location");
    if (locations) {
      personBox.appendChild(renderTypeValueList("Locations", "location", locations, 
        {linkToURL:"http://maps.google.com/maps?q="}));
    }

    var addresses = gPerson.getProperty("addresses");
    if (addresses) {
      personBox.appendChild(renderTypeValueList("Addresses", "adr", addresses, {itemRender: function addrRender(item) {
        return (item.streetAddress ? item.streetAddress + " " : "") + 
               (item.locality ? item.locality + " " : "") + 
               (item.region ? item.region + " " : "") + 
               (item.postalCode ? item.postalCode + " " : "") + 
               (item.country ? item.country : ""); 
       }, linkToURL:"http://maps.google.com/maps?q="}));
    }
    var urls = gPerson.getProperty("urls");
    if (urls) {
      urls = selectTopLevelUrls(urls);
      personBox.appendChild(renderTypeValueList("Links", "url", urls, {includeFavicon:true, linkify:true}));
    }
    var notes = gPerson.getProperty("notes");
    if (notes) {
      personBox.appendChild(renderTypeValueList("Notes", "note", notes));
    }
    gContainer.innerHTML = "";
    gContainer.appendChild(personBox);
  } catch (e) {
    gContainer.innerHTML = "Uh oh, something went wrong! " + e;
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

  
function startDiscovery(inputPerson)
{
  var discoverers = PeopleImporter.getDiscoverers();

  for (var d in discoverers) {
    var discoverer = PeopleImporter.getDiscoverer(d);
    if (discoverer) {
      let engine = d;
      gPendingDiscoveryCount += 1;
      discoverer.discover(inputPerson, 
        function completion(newDoc) {
          gPendingDiscoveryCount -= 1;
          if (newDoc) {
            gDocuments[engine] = newDoc;
            renderPerson();
          }
        },
        function progress(msg) {
          dump(msg);
        }
      );
    }
  }
}
