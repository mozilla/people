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
const Ci = Components.interfaces;
const Cc = Components.classes;

Cu.import("resource://people/modules/people.js");
Cu.import("resource://people/modules/import.js");

var IO_SERVICE = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
var UNESCAPE_SERVICE = Cc["@mozilla.org/feed-unescapehtml;1"].getService(Ci.nsIScriptableUnescapeHTML);

var gPeople = null;
var gGroupName = null;
var gContainer;
var gFeedback;
var gPeopleBox;

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

function initGroup(container, identifier)
{
  gContainer = container;
  gGroupName = identifier;
  gPeople = People.find({tags:identifier});
  
  for each (p in gPeople) {
    p.givenName = p.getProperty("name/givenName");
    p.familyName = p.getProperty("name/familyName");
  }
  gPeople.sort(function(a,b) {
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

  document.title = "Contacts Group " + identifier;

  gFeedback = createDiv("feedback");
  gFeedback.setAttribute("id", "feedback");
  gContainer.appendChild(gFeedback);

  renderPeople();
  /*
  
  disabled automatic group discovery for the moment.
  
  for each (p in gPeople) {
    p.coordinator = new DiscoveryCoordinator(p, false, personUpdated, discoveryProgressFn);
    p.coordinator.start();
  }*/
}

function renderPeople()
{  
  var headerBox = createDiv("header");
  gContainer.appendChild(headerBox);
  headerBox.appendChild(document.createTextNode("Group \"" + gGroupName + "\""));

  gPeopleBox = createDiv("people");
  gPeopleBox.setAttribute("id", "people");
  gContainer.appendChild(gPeopleBox);

  for each (var person in gPeople)
  {
    try {
      renderPerson(person, gPeopleBox);
    } catch (e) {
      People._log.info("Error while rendering person in group view: " + e);
    }
  }
}

function personUpdated(aPerson)
{
  People._log.debug("Person updated: " + aPerson.displayName);
  renderPerson(aPerson, gPeopleBox);
  try {
    renderUpdates();
  } catch (e) {
    People._log.warn(e);
  }
}

function discoveryProgressFn(msg)
{
  try {
    if (msg) {
      gFeedback.innerText = msg;
    }
  } catch (e) {
    People._log.warn(e);
  }
}

function renderPerson(person, peopleBox)
{   
  var personBox = document.getElementById("person-" + person.guid);
  if (!personBox) {
    personBox = createDiv("person");
    personBox.setAttribute("id", "person-" + person.guid);
    peopleBox.appendChild(personBox);
  } else {
    personBox.innerHTML = "";
  }

/*  var photos = person.getProperty("photos");
  if (photos) {
    var photoBox = createDiv("photo");
    var photoImg = createElem("img");
    photoImg.setAttribute("src", photos[0].value);
    photoImg.setAttribute("class", "profilePhoto");
    photoBox.appendChild(photoImg);
    personBox.appendChild(photoBox);
  }
*/
  var dN = person.getProperty("displayName");
  if (dN) {
    var displayNameDiv = createDiv("displayName");
    var nameLink = createElem("a");
    nameLink.appendChild(document.createTextNode(dN));
    nameLink.setAttribute("href", "person:guid:" + person.guid);
    displayNameDiv.appendChild(nameLink);
    personBox.appendChild(displayNameDiv);
  }
}

function trimURL(url)
{
  if (url.indexOf("www.") == 0) url = url.slice(4);
  return url;

}

var gUpdateDisplayCount = 25;
function renderUpdates()
{
  People._log.debug("Rendering person updates");

  var updatesBox = document.getElementById("updates");
  if (!updatesBox) {
    updatesBox = createDiv("updates");
    updatesBox.setAttribute("id", "updates");
    gContainer.appendChild(updatesBox);
  } else {
    updatesBox.innerHTML = "";
  }
  var updateHeaderBox = createDiv("updateheader");
  updateHeaderBox.appendChild(document.createTextNode("Updates"));
  updatesBox.appendChild(updateHeaderBox);

  var updates = getUpdateList();
  var map = getServiceMap(updates);
  
  var serviceMapBox = createDiv("servicemap");
  for (var svc in map) {
    var svcBox = createDiv("svc");
    try {
      var FAVICON_SERVICE = Components.classes["@mozilla.org/browser/favicon-service;1"].getService(Ci.nsIFaviconService);
      var favicon = FAVICON_SERVICE.getFaviconImageForPage(IO_SERVICE.newURI("http://" + svc, null, null));
    } catch (e) {}
    if (favicon) {
      var faviconImg = createElem("img");
      faviconImg.setAttribute("src", favicon.spec);
      faviconImg.setAttribute("class", "favicon");
      svcBox.appendChild(faviconImg);
    }
    svcBox.appendChild(document.createTextNode(trimURL(svc)));
    serviceMapBox.appendChild(svcBox);
  }
  updatesBox.appendChild(serviceMapBox);
  

  var count = 0;
  var renderContext = {};

  for each (var u in updates)
  {
    if (count == gUpdateDisplayCount) break;
    count++;
    
    try {
      var updateBox = createDiv("update");
      renderSingleUpdate(u, updateBox, renderContext);
      updatesBox.appendChild(updateBox);
    } catch (e) {
      People._log.info("Error while rendering update: " + e);
    }
  }
}

function renderSingleUpdate(anUpdate, updateBox, renderContext)
{
  var photos = anUpdate.person.getProperty("photos");
  var photoBox = createDiv("photo");
  var photoImg = createElem("img");
  photoImg.setAttribute("class", "updatePhoto");
  photoBox.appendChild(photoImg);
  updateBox.appendChild(photoBox);
  if (photos) {
    photoImg.setAttribute("src", photos[0].value);
  } else {
    photoImg.setAttribute("src", "chrome://people/content/images/person.png");
  }

  if (anUpdate.entry.summary) {
    text = anUpdate.entry.summary.text;
  } else if (anUpdate.entry.content) {
    text = anUpdate.entry.content.text;
  }
  let data;
  if (text && text.length < 250) {
    data = text;
  } else {
    data = anUpdate.entry.title.text;
  }
  //let link;
  //if (theEntry.entry.link)
  //<link rel="alternate" type="text/html" href="http://www.flickr.com/photos/billwalker/4536808205/"/>

/*  if (anUpdate.entry.enclosures) {
    for (var e = 0; e < anUpdate.entry.enclosures.length; ++e) {
      var enc = anUpdate.entry.enclosures.queryElementAt(e, Ci.nsIWritablePropertyBag2);
      if (enc.hasKey("type")) {
        var enctype = enc.get("type");
        if (enctype.indexOf("image/") == 0)
        {
          var link = createElem("a");
          link.setAttribute("target", "_blank");
          link.setAttribute("href", eng.get('url'));
          link.appendChild(document.createTextNode("[image]"));
          updateBox.appendChild(link);
        }
      }
    }
  }
  if (anUpdate.entry.mediaContent) {
    for (var e = 0; e < anUpdate.entry.mediaContent.length; ++e) {
      var enc = anUpdate.entry.mediaContent.queryElementAt(e, Ci.nsIWritablePropertyBag2);
    }
  }*/

  var updateText = createDiv("updatetext");

  var authorLink = createElem("a");
  authorLink.setAttribute("class", "author");
  authorLink.setAttribute("href", "person:" + anUpdate.person.guid);
  authorLink.appendChild(document.createTextNode(anUpdate.person.displayName));
  updateText.appendChild(authorLink);

  updateText.appendChild(document.createTextNode(" "));

  var updateSpan = createElem("span");
  updateSpan.setAttribute("class", "title");
  if (anUpdate.link.atom) {
    updateSpan.innerHTML = data;
  } else {
    var angleBracket = data.indexOf("<");
    if (angleBracket >= 0 && data.indexOf(">") > 0) {
      updateSpan.innerHTML = data;    
    } else {
      updateSpan.appendChild(document.createTextNode(data));
    }
  }
  updateText.appendChild(updateSpan);

  var tagline = createDiv("tagline");
  updateText.appendChild(tagline);

  var timestamp = createElem("span");
  timestamp.setAttribute("class", "updateTime");
  timestamp.appendChild(document.createTextNode(formatDate(getEntryDate(anUpdate.entry))));
  tagline.appendChild(timestamp);

  tagline.appendChild(document.createTextNode(" from "));

  var source = createElem("span");
  timestamp.setAttribute("class", "updateSource");
  source.appendChild(document.createTextNode(trimURL(anUpdate.link.value)));
  tagline.appendChild(source);
  
  
  updateBox.appendChild(updateText);
  // anUpdate.parent.title.text + "</a></span></div><br clear='left'/>";  
}


function formatDate(dateStr)
{
  if (!dateStr) return "null";
  
  var now = new Date();
  var then = new Date(dateStr);

  if (then.getDate() != now.getDate())
  {
     var dayDelta = (new Date().getTime() - then.getTime() ) / 1000 / 60 / 60 / 24 // hours
     if (dayDelta < 2) str = "yesterday";
     else if (dayDelta < 7) str = Math.floor(dayDelta) + " days ago";
     else if (dayDelta < 14) str = "last week";
     else if (dayDelta < 30) str = Math.floor(dayDelta) + " days ago";
     else str = Math.floor(dayDelta /30)  + " month" + ((dayDelta/30>2)?"s":"") + " ago";
  } else {
    var minuteDelta = (new Date().getTime() - then.getTime()) / 1000 / 60 / 24;
    var str;

    if (minuteDelta < 2) {
      str = "1 minute ago";
    } else if (minuteDelta < 45) {
      str = "" + Math.floor(minuteDelta) + " minutes ago";
    } else if (minuteDelta < 90) {
      str = "about an hour ago";
    } else {
      var hrs = then.getHours();
      var mins = then.getMinutes();
      
      var hr = Math.floor(Math.floor(hrs) % 12);
      if (hr == 0) hr =12;
      var mins = Math.floor(mins);
      str = hr + ":" + (mins < 10 ? "0" : "") + Math.floor(mins) + " " + (hrs >= 12 ? "P.M." : "A.M.");
    }
  }
  return str;
}



function getEntryDate(entry) {
  if (entry) {
    if (entry.published) return entry.published;
    if (entry.updated) return entry.updated;
  }
  return null;
}

function getServiceMap(anUpdateList)
{
  var map = {};

  for each (var u in anUpdateList)
  {
    var siteID;
    try {
      var uri = IO_SERVICE.newURI(u.link.value, null, null);
      siteID = uri.host;
    } catch (e) {
      siteID = u.type; 
    } 
    u.siteID = siteID;
    if (!map[siteID]) map[siteID] = true;
  }
  return map;
}


function getUpdateList()
{
  var allUpdates = [];
  var alreadyHandled = {};

  for each (var p in gPeople)
  {
    for each (var u in p.getProperty("urls"))
    {
      if (u.feed) {
        for (i=0; i<u.feed.items.length; i++) {
          var theEntry;
          try {
            theEntry = u.feed.items.queryElementAt(i, Components.interfaces.nsIFeedEntry);
          } catch (e) {
            theEntry = u.feed.items[i];
          }
          if (theEntry) {
            var theDate = getEntryDate(theEntry);
            var key = (theEntry.title?theEntry.title.text:"") + "|" + (theDate?theDate:"");
            if (!alreadyHandled[key]) {
              allUpdates.push({person:p,parent:u.feed, entry:theEntry, urlObject:u, link:u});
              alreadyHandled[key] = true;
            }
          }
        }
      }
    }
  }

  if (allUpdates.length > 0)
  {
    // Sort by date
    allUpdates.sort(function dateCompare(a,b) {
      var aDate = getEntryDate(a.entry);
      var bDate = getEntryDate(b.entry);
      if (aDate && bDate) {
        try {
          return new Date(bDate) - new Date(aDate);
        } catch (e) {
          return 0;
        }
      } else if (aDate) {
        return -1;
      } else if (bDate) {
        return 1;
      } else {
        return a.entry.title.text.localeCompare(b.entry.title.text);
      }
    });
  }
  return allUpdates;
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
