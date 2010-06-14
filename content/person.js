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

try {
// if the favicon service doesn't exist (e.g. Thunderbird) just ignore it
var FAVICON_SERVICE = Cc["@mozilla.org/browser/favicon-service;1"].getService(Ci.nsIFaviconService);
} catch(e) {}
var IO_SERVICE = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
var UNESCAPE_SERVICE = Cc["@mozilla.org/feed-unescapehtml;1"].getService(Ci.nsIScriptableUnescapeHTML);
var HISTORY_SERVICE = Cc["@mozilla.org/browser/nav-history-service;1"].getService(Ci.nsINavHistoryService);
                               
var gPerson = null;
var gContainer;
var gDocuments;

const CONTACT_CARD = 1;
const DATA_SOURCES = 2;

var gDisplayMode = CONTACT_CARD;

var gDiscoveryCoordinator = null;

var wm = Cc["@mozilla.org/appshell/window-mediator;1"]
                   .getService(Ci.nsIWindowMediator);
var win = wm.getMostRecentWindow(null);
window.openURL = win.openURL;

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
//  titleDiv.appendChild(document.createTextNode(title + ":"));
  itemsDiv.appendChild(titleDiv);

  var already = {};
  var count = 0;
  var itemContainer = itemsDiv; // could be reassigned for overflow
  for each (var item in list) {
    var ctype= item["content-type"];
    if (ctype != undefined) {
      if (ctype == "text/html" || ctype == "application/atom+xml" || ctype == "text/plain") { // what about rdf+xml?  Google serves FOAF like that.  Hrm.
      } else {
        continue; // skip it.
      }
    }
    var value = item.value;
    if (options && options.itemRender) value = options.itemRender(item);
    if (options && options.skipTypeList) {
      if (options.skipTypeList.indexOf(item.type) >= 0) continue;
    }
        
    if (already[value] != undefined) continue;
    already[value] = 1;

    // Begin disclosure box, if needed...
    count++;
    if (options && options.hideLongList && count == 6 && !gOverflowRevealedMap[objectType]) {
      var disclosureDiv = createDiv("item_overflow");
      disclosureDiv.setAttribute("id", objectType + "overflow");
      disclosureDiv.style.display = 'none';
      itemsDiv.appendChild(disclosureDiv);
      itemContainer = disclosureDiv;
    }

    var itemDiv = createDiv("item");
    var itemTypeDiv = createDiv("type");
    var itemValueDiv = createDiv("value");
    if (item.type) {
      itemTypeDiv.appendChild(document.createTextNode(item.type));
    }

    var favicon= null;
    if (options && options.includeFavicon) {
      let itemURL = IO_SERVICE.newURI(item.value, null, null);
      try {
        favicon = FAVICON_SERVICE.getFaviconImageForPage(itemURL);
      } catch (e) {
        // could do, but is slow and not cached in tb
        //favicon = IO_SERVICE.newURI("http://www.getfavicon.org/?url="+itemURL.host, null, null);
      }
      if (favicon) {
        var faviconImg = createElem("img");
        faviconImg.setAttribute("src", favicon.spec);
        faviconImg.setAttribute("class", "valuefavicon");
        itemValueDiv.appendChild(faviconImg);
      }
    }
    if (options && options.linkify) {
      var link = createElem("a");
      if (options.onclick) {
        link.setAttribute("onclick", "openURL('"+value+"')");
        link.setAttribute("href", "javascript:void(null)");
      } else {
        link.setAttribute("href", value);
        link.setAttribute("target", "_blank");
      }
      
      if (!options.useHistoryTitles) {
        let query = HISTORY_SERVICE.getNewQuery();
        let options = HISTORY_SERVICE.getNewQueryOptions();
        let queryURI = IO_SERVICE.newURI(item.value, null, null);
        query.uri = queryURI;

        let result = HISTORY_SERVICE.executeQuery(query, options);
        if (result && result.root) {
          result.root.containerOpen = true;
        }
        if (result && result.root && result.root.hasChildren) {
          let node = result.root.getChild(0);          
          link.appendChild(document.createTextNode(node.title));        
        } else {
          link.appendChild(document.createTextNode(value));        
        }
      }
      else
      {
        link.appendChild(document.createTextNode(value));
      }
      itemValueDiv.appendChild(link);
    } else if (options && options.linkToURL) {
      var link = createElem("a");
      if (options.onclick) {
        link.setAttribute("onclick", "openURL('"+options.linkToURL +escape(value)+"')");
        link.setAttribute("href", "javascript:void(null)");
      } else {
        link.setAttribute("href", options.linkToURL + escape(value));
        link.setAttribute("target", "_blank");
      }
      link.appendChild(document.createTextNode(value));
      itemValueDiv.appendChild(link);    
    } else {
      itemValueDiv.appendChild(document.createTextNode(item.value));
    }
    itemDiv.appendChild(itemTypeDiv);
    itemDiv.appendChild(itemValueDiv);
    itemContainer.appendChild(itemDiv);
  }
  if (options && options.hideLongList && count > 6 && !gOverflowRevealedMap[objectType]) {
    var link = createElem("a");
    link.setAttribute("class", "item_overflow_link");
    link.setAttribute("id", objectType + "overflowlink");
    link.setAttribute("onclick", "revealOverflow('" + objectType + "')");
    link.appendChild(document.createTextNode("Show " + (count-5) + " more..."));
    itemsDiv.appendChild(link);
  }
  return itemsDiv;
}

function renderPhotoList(title, objectType, list, options)
{
  var itemsDiv = createDiv("vlist");
  itemsDiv.setAttribute("id", objectType + "s");
  var titleDiv = createDiv("vlist_title");
  titleDiv.setAttribute("id", objectType + "stitle");
//  titleDiv.appendChild(document.createTextNode(title + ":"));
  itemsDiv.appendChild(titleDiv);

  var listContainer = itemsDiv;
  if (!gOverflowRevealedMap[objectType]) {
    var disclosureDiv = createDiv("item_overflow");
    disclosureDiv.setAttribute("id", objectType + "overflow");
    disclosureDiv.style.display = 'none';
    itemsDiv.appendChild(disclosureDiv);
    listContainer = disclosureDiv;

    var link = createElem("a");
    link.setAttribute("class", "item_overflow_link");
    link.setAttribute("id", objectType + "overflowlink");
    link.setAttribute("onclick", "revealOverflow('" + objectType + "')");
    link.appendChild(document.createTextNode("Show " + (list.length) + " photos..."));
    itemsDiv.appendChild(link);
  }
  
  var already = {};
  var itemContainer = itemsDiv; // could be reassigned for overflow
  var itemList = createElem("ul");
  itemList.setAttribute("class", "photolist");
  listContainer.appendChild(itemList);

  for each (var item in list) {

    if (already[item.type + item.value] != undefined) continue;
    already[item.type + item.value] = 1;

    var theItem = createElem("li");
    var theImg = createElem("img");
    theImg.setAttribute("src", item.value);
    theImg.setAttribute("class", "listedPhoto");
    theItem.appendChild(theImg);
    itemList.appendChild(theItem);
  }
  return itemsDiv;
}


var gOverflowRevealedMap = {};
function revealOverflow(objectType)
{
  document.getElementById(objectType + "overflow").style.display='block';
  document.getElementById(objectType + "overflowlink").style.display='none';
  gOverflowRevealedMap[objectType] = 1;
  
}

function initPerson(container, identifier)
{
  gContainer = container;

  var input = constructDocumentFromIdentifier(identifier);
  var query = constructQueryFromDocument(input);
  var searchResult = null;

  var count=0;
  for (var p in query) count++;
  if (count > 0) {
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
  
  window.setTimeout('startDiscovery()', 3000);
}

let gPersistDiscovery = true;
function startDiscovery() 
{
  gDiscoveryCoordinator = new DiscoveryCoordinator(gPerson, gPersistDiscovery, renderPerson, renderProgressIndicator, renderPerson);
  gDiscoveryCoordinator.start();
}

function constructDocumentFromIdentifier(identifier)
{
  var inputDoc = {};
  if (identifier.indexOf("guid:") == 0) {
    inputDoc.guid = identifier.slice(5);
  } else if (identifier.indexOf("@") > 0) {
    // let's guess it's an email
    inputDoc.emails = [{type:"email", value:identifier}];
  } else if (identifier.indexOf("http") == 0) {
    // probably a link - but special case a couple
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
  if (doc.guid) ret.guid = doc.guid;
  return ret;
}

function toggleProgressBox()
{
  var pbox = document.getElementById("progressBox");
  if (pbox) {
    if (pbox.style.display == 'none') {
      pbox.style.display = 'block';
    } else {
      pbox.style.display = 'none';    
    }
  }
}

function renderProgressIndicator()
{
  var personBox = document.getElementById("person");
  if (personBox) {
    var spinnerBox = document.getElementById("progressIndicator");
    if (spinnerBox) spinnerBox.innerHTML = "";
    
    if (gDiscoveryCoordinator && gDiscoveryCoordinator.anyPending()) 
    {
      if (!spinnerBox) {
        spinnerBox = createDiv("spinner");
        spinnerBox.setAttribute("id", "progressIndicator");
        personBox.insertBefore(spinnerBox, personBox.firstChild);
      } 
      
      var spinnerImg = createElem("img");
      spinnerImg.setAttribute("onclick", "toggleProgressBox()");
      spinnerImg.setAttribute("src", "chrome://people/content/images/loading.gif");
      spinnerImg.setAttribute("title", "Click for search detail");
      
      var text = "<div>";
      for each (d in gDiscoveryCoordinator._pendingDiscoveryMap) {
        text += htmlescape(d) + "<br/>";
      }
      text += "</div>";
      spinnerBox.appendChild(spinnerImg);

      var spinnerMouseover = createDiv("mouseover");
      spinnerMouseover.setAttribute("id", "progressBox");
      spinnerMouseover.setAttribute("style", "display:none");
      try {
        spinnerMouseover.innerHTML = text;
      } catch (e) {
        spinnerMouseover.innerHTML = "Whoops, got an error";
        dump("Illegal spinner text: " + text + "\n");
      }
      spinnerBox.appendChild(spinnerMouseover);
    }
  }
}

function renderPerson()
{  
  try {
    var personBox = createDiv("person");
    personBox.setAttribute("id", "person");
    renderProgressIndicator();
    
    let controls = createDiv("displaymode");
    let link = createElem("a");
    controls.appendChild(link);
    personBox.appendChild(controls);
    
    switch (gDisplayMode) {
      case CONTACT_CARD:
        renderContactCard(personBox);
        link.setAttribute("onclick", "setDisplayMode(" + DATA_SOURCES +")");
        link.appendChild(document.createTextNode("View data sources"));
        break;
      case DATA_SOURCES:
        renderDataSources(personBox);
        link.setAttribute("onclick", "setDisplayMode(" + CONTACT_CARD +")");
        link.appendChild(document.createTextNode("Return to summary view"));
        break;
    }

    gContainer.innerHTML = "";
    gContainer.appendChild(personBox);
  } catch (e) {
    gContainer.innerHTML = "Uh oh, something went wrong! " + e;
    throw e;
  }
}

function setDisplayMode(mode)
{
  gDisplayMode = mode;
  renderPerson();
}

function renderContactCard(personBox)
{    
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
  
  renderContactMethods(gPerson, personBox);
  renderContentLinks(gPerson, personBox);
  renderServiceLinks(gPerson, personBox);
}

function renderContactMethods(person, personBox)
{
  var photos = gPerson.getProperty("photos");
  var contactBox = createDiv("contactMethods");
  var any = false;

  var heading = createDiv("subsecHead");
  heading.appendChild(document.createTextNode("Details:"));
  contactBox.appendChild(heading);
  
  var emails = person.getProperty("emails");
  if (emails) {
    any = true;
    contactBox.appendChild(renderTypeValueList("Email Addresses", "email", emails, {linkToURL:"mailto:",onclick:true}));
  }
  var phones = person.getProperty("phoneNumbers");
  if (phones) {
    any = true;
    contactBox.appendChild(renderTypeValueList("Phone Numbers", "phone", phones, {linkToURL:"callto:",onclick:true}));
  }
  var locations = person.getProperty("location");
  if (locations) {
    any = true;
    contactBox.appendChild(renderTypeValueList("Locations", "location", locations, 
      {linkToURL:"http://maps.google.com/maps?q="}));
  }

  var addresses = person.getProperty("addresses");
  if (addresses) {
    any = true;
    contactBox.appendChild(renderTypeValueList("Addresses", "adr", addresses, {itemRender: function addrRender(item) {
      var val = "";
      if (item.streetAddress) {
        val += item.streetAddress;
        val += " ";
      }
      if (item.locality) {
        val += item.locality;
      }
      if (item.region) {// handle "city, ST" convention - TODO is this appropriate for non-US locales?
        if (val.length > 0) val += ", ";
        val += item.region;
      } 
      if (val.length > 0) val += " ";
      
      if (item.postalCode) {
        val += item.postalCode;
        val += " ";
      }
      if (item.country) {
        val += item.country;
        val += " ";
      }
      if (val.length == 0 && item.value) return item.value;
      return val;
     }, linkToURL:"http://maps.google.com/maps?q="}));
  }
  var birthday = person.getProperty("birthday");
  if (birthday) {
    any = true;  
    contactBox.appendChild(renderTypeValueList("Birthday", "url", [{type:"Birthday", value:birthday}]));
  }

  if (photos && photos.length > 1) {
    any = true;
    contactBox.appendChild(renderPhotoList("Photos", "photos", photos));
  }
  
  if (any) {
    personBox.appendChild(contactBox);
  }
}

function renderContentLinks(person, personBox)
{
  var contentBox = createDiv("content");
  var any = false;

  var heading = createDiv("subsecHead");
  heading.appendChild(document.createTextNode("Content:"));
  contentBox.appendChild(heading);

  var urls = person.getProperty("urls");
  if (urls) {
    urls = selectTopLevelUrls(urls);
    any = true;
    contentBox.appendChild(renderTypeValueList("Links", "url", urls, 
      {includeFavicon:true, linkify:true, hideLongList:true, skipTypeList:["data"]}
    ));
  }
  var notes = person.getProperty("notes");
  if (notes) {
    any = true;
    contentBox.appendChild(renderTypeValueList("Notes", "note", notes));
  }
  
  // Construct sorted union of all feed items...
  var allUpdates = [];
  for each (var u in urls)
  {
    if (u.feed) {
      u.feed.QueryInterface(Components.interfaces.nsIFeed);
      for (i=0; i<u.feed.items.length; i++) {
        var theEntry = u.feed.items.queryElementAt(i, Components.interfaces.nsIFeedEntry);
        allUpdates.push({parent:u.feed, entry:theEntry, urlObject:u});
      }
    }
  }
  if (allUpdates.length > 0)
  {
  
    // Sort by date
    allUpdates.sort(function dateCompare(a,b) {
      if (a.entry.published && b.entry.published) {
        try {
          return new Date(b.entry.published) - new Date(a.entry.published);
        } catch (e) {
          return 0;
        }
      } else if (a.entry.published) {
        return -1;
      } else if (b.entry.published) {
        return 1;
      } else {
        return a.entry.title.text.localeCompare(b.entry.title.text);
      }
    });

    var itemsDiv = createDiv("vlist");
    itemsDiv.setAttribute("id", "updates");
    var titleDiv = createDiv("vlist_title");
    titleDiv.setAttribute("id", "updatestitle");
    titleDiv.appendChild(document.createTextNode("Updates:"));
    itemsDiv.appendChild(titleDiv);

    var now = new Date();
    
    var currentTimeString = null;
    for (var i=0;i<allUpdates.length;i++) 
    {
      if (i > 100) break;
      
      theEntry = allUpdates[i];
      if (theEntry) {
        try {
          if (theEntry.entry.published) if (new Date(theEntry.entry.published.text) - now > 60*60*24*365*1000) continue;// stop at a year

          var itemDiv = createDiv("item");
          var itemTypeDiv = createDiv("type");
          var updateDiv = createDiv("update");
          itemDiv.appendChild(itemTypeDiv);
          itemDiv.appendChild(updateDiv);
          
          var str = formatDate(theEntry.entry.published);
          if (str != currentTimeString) {
            itemTypeDiv.innerHTML = 
              "<span class='pubdate'>" + formatDate(theEntry.entry.published) + "</span>";
            currentTimeString = str;
          }
          
          info = "";
          let favicon;
          try {
            favicon = FAVICON_SERVICE.getFaviconImageForPage(IO_SERVICE.newURI(theEntry.urlObject.value, null, null));
          } catch (e) {}
          if (favicon) {
            info += "<img src='" + favicon.spec + "' class='updatefavicon'/>";
          }
          
          if (theEntry.entry.enclosures) {
            for (var e = 0; e < theEntry.entry.enclosures.length; ++e) {
              var enc = theEntry.entry.enclosures.queryElementAt(e, Ci.nsIWritablePropertyBag2);
              if (enc.hasKey("type")) {
                var enctype = enc.get("type");
                if (enctype.indexOf("image/") == 0)
                {
                  info += "<img class='updateimg' style='float:left' width='96' src='" + enc.get("url") + "'/>";
                }
              }
            }
          }
          if (theEntry.entry.summary) {
            text = theEntry.entry.summary.text;
          } else if (theEntry.entry.content) {
            text = theEntry.entry.content.text;
          }
          let data;
          if (text && text.length < 250) {
            data = text;
          } else {
            data = theEntry.entry.title.text;
          }
          //let link;
          //if (theEntry.entry.link)
          //<link rel="alternate" type="text/html" href="http://www.flickr.com/photos/billwalker/4536808205/"/>
              
          info += "<span class='title'>" + data + "</span>";
          info += "<span class='source'> - <a target='_blank' href='" + htmlescape(theEntry.urlObject.value) + "'>" + theEntry.parent.title.text + "</a></span><br clear='left'/>";
          
          try {
            updateDiv.innerHTML = info;
          } catch (e) {
            data = data.replace(/&/gmi, '&amp;');
            try {
              updateDiv.innerHTML = info;
            } catch (e) {
              People._log.warn(info);
              updateDiv.innerHTML = "Unable to render";
            }
          }
          itemsDiv.appendChild(itemDiv);
        } catch (e) {
          People._log.info(e);      
        }
      }
    }
    contentBox.appendChild(itemsDiv);
  }

  if (any) {
    personBox.appendChild(contentBox);
  }

}

function renderServiceLinks(person, personBox)
{
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
      var str;
      var hrs = then.getHours();
      var mins = then.getMinutes();
      
      var hr = Math.floor(Math.floor(hrs) % 12);
      if (hr == 0) hr =12;
      var mins = Math.floor(mins);
      str = hr + ":" + (mins < 10 ? "0" : "") + Math.floor(mins) + " " + (hrs >= 12 ? "P.M." : "A.M.");
  }
  return str;
}


function renderDataSources(personBox)
{
  let svcbox = createDiv("servicedetail");
  for (let aService in gPerson.obj.documents)
  {
    let aDoc = gPerson.obj.documents[aService];

    let header = createDiv("header");
    let svc = PeopleImporter.getService(aService);
    if (svc) {
      header.innerHTML = svc.explainString();
    } else {
      try {
        header.innerHTML = "Results of discovery or import module \"" + htmlescape(aService) + "\":";
      } catch (e) {
        header.innerHTML = "Results of discovery or import module \"(bad name)\":";      
      }
    }
    svcbox.appendChild(header);
    traverseRender(aDoc, svcbox);
  }
  personBox.appendChild(svcbox);
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

          /* display full metadata: sometimes useful for debugging
          for (let aSlot in anItem)
          {
            let slot = createDiv("svcdetailvaluerel");
            slot.appendChild(document.createTextNode(aSlot +": " + anItem[aSlot]));
            value.appendChild(slot);          
          }
          */


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
          /*if (anItem.name) textLabel = anItem.name;
          else */textLabel = "Item #" + count;

          let slot = createDiv("slot");
          let label = createDiv("svccountedlabel");
          label.appendChild(document.createTextNode(textLabel));
          slot.appendChild(label);
          item.appendChild(slot);

          for (let aSlot in anItem)
          {
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




var UNIQUE_URLS = ["http://www.facebook.com/"];
function selectTopLevelUrls(urls)
{
  var tmp = [];
  
  // if it's a unique URL, take the shortest one.  This is, admittedly,
  // a hack to cause the vanity Facebook URL to come up first.
  
  // otherwise, if any URLs are prefixes of other URLs in the list,
  // take the shorter one.
  
  var shortMap = {};
  
  for each (var u in urls) {
    var wasAUnique = false;
    for each (var unique in UNIQUE_URLS) {
      if (u.value.indexOf(unique) == 0) {
        if (!shortMap[unique]) shortMap[unique] = u;
        else {
          if (u.value.length < shortMap[unique].value.length) {
            shortMap[unique] = u;
          }
        }
        wasAUnique = true;
      }
    }
    if (!wasAUnique) {
      tmp.push(u);
    }
  }
  
  var ret = [];
  for each (u in shortMap) {
    ret.push(u);
  }
  ret = ret.concat(tmp);
/*
  for each (var u in urls) {
    var matched = false;
    for each (var r in ret) {
      if (u.value.indexOf(r.value) == 0) {matched = true;break;}
    }
    if (!matched) ret.push(u);
  }*/
  return ret;
}

function ActivityRetrievalCoordinator(person) {
  this._person = person;
  this._pendingRetrievalCount = 0;
  this._pendingRetrievalMap = {};
  this._completedRetrievalMap = {};
}

ActivityRetrievalCoordinator.prototype = {
  anyPending: function() {
    return this._pendingDiscoveryCount > 0;
  },
  
  start: function() 
  {
    let urls = this._person.getProperty("urls");
    for each (let u in urls)
    {
      if (u.atom || u.rss || u.type == "updates" || u.rel == "http://schemas.google.com/g/2010#updates-from" ||
        u.value.indexOf(".atom") > 0)
      {
        let theURL = u.atom ? u.atom : (u.rss ? u.rss : u.value);
        People._log.info("Creating feed fetcher for " + theURL);
        let feedFetcher = this.createFeedFetcher(theURL, u);
        feedFetcher.send(null);
      }
      else if (u.value.indexOf("http") == 0) 
      {
        // go see if we can find a feed by resolving the link
        let pageLinkInspector = this.createPageLinkInspector(u.value, u);
        People._log.info("Starting page link inspector for " + u);
        pageLinkInspector.send(null);
      }
      else
      {
        People._log.info("Not fetching " + u.value);
      }
    }
  },
  
  createFeedFetcher : function(u, object) {
    let call = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);  
    call.open('GET', u, true);
    call.onreadystatechange = function (aEvt) {
      if (call.readyState == 4) {
        if (call.status == 200) {
          let parser = Components.classes["@mozilla.org/feed-processor;1"].createInstance(Components.interfaces.nsIFeedProcessor);
          let listener = new ActivityFeedListener(u, object);
          try {
            People._log.info("Parsing feed from " + u);
            parser.listener = listener;
            parser.parseFromString(call.responseText, IO_SERVICE.newURI(u, null, null));
          } catch (e) {
            People._log.info("Error while parsing feed " + u + ": " + e);
          }
        } else {
          People._log.info("Error while loading feed " + u + ": " + call.status);        
        }
      }
    }
    return call;
  },
  
  createPageLinkInspector : function(u, object) {
    let that = this;
    let call = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);  
    call.open('GET', u, true);
    People._log.warn("Inspecting URL " + u);
    call.onreadystatechange = function (aEvt) {
      if (call.readyState == 4) {
        if (call.status == 200) {
          People._log.warn("  - got body for " + u);
        
          var body = call.responseText;
          var re = RegExp("<(a|link).*(</link|/|)>", "gi"); 
          var result;
          while ((result = re.exec(body)) != null)
          {
            var typeRE = RegExp("type[ \n\t]*=[ \n\t]*('([^']*)'|\"([^\"]*)\")", "gi");
            var typeMatch = typeRE.exec(result);
            if (typeMatch) {
              var type = typeMatch[2] ? typeMatch[2] : typeMatch[3];
              if (type == "application/rss+xml" || type == "application/atom+xml") {// or the other feed types...

                var hrefRE = RegExp("href[ \n\t]*=[ \n\t]*('([^']*)'|\"([^\"]*)\")", "gi");
                var hrefMatch = hrefRE.exec(result);
                if (hrefMatch) {
                  var href = hrefMatch[2] ? hrefMatch[2] : hrefMatch[3];
                  var theURI = IO_SERVICE.newURI(href, null, IO_SERVICE.newURI(u, null, null));

                  if (type == "application/atom+xml") {
                    object.atom = theURI.spec;
                  } else {
                    object.rss = theURI.spec;
                  }
                  People._log.warn("  - success: creating feed fetcher for " + theURI.spec);
                  
                  that.createFeedFetcher(theURI.spec, object).send(null);
                  break;// don't want more than one?  hmmmmm.
                }
              }
            }
          }
        } else {
          People._log.warn("Received error " + call.status + " while retrieving " + u);
        }
      }
    }
    return call;
  }
};

function ActivityFeedListener(url, object) {
  this._object = object;
  this._url = url;
}

ActivityFeedListener.prototype = {
  handleResult: function(result) {
    var feed = result.doc;
    feed.QueryInterface(Components.interfaces.nsIFeed);    
    this._object.feed = feed;
    renderPerson();
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

