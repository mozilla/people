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

let allFieldList = ["displayName", "emailhash", "emails", "phoneNumbers", "urls", "name/givenName", "name/familyName"];
let fieldLabels = {displayName:"Name", 
                    emailhash: "Unique Identifier (based on email, but not addressible)", 
                    emails: "Email Addresses", 
                    phoneNumbers: "Phone Numbers", 
                    urls: "URLs (web site addresses)", 
                    "name": "Name",
                    "idHash": "Unique Anonymous Identifier",
                    "name/givenName":"Given Name", 
                    "name/familyName":"Family Name",
                    "photos":"Photos"
                  };
let fieldActive = {
                displayName:true, 
                "name/familyName":true, 
                "name/givenName":true, 
                emailhash:true, 
                emails:true, 
                phoneNumbers:true, 
                urls:true,
                photos:true,
                }
let fieldList = allFieldList; // by default, ask for all fields

let tagCountMap = {}, tagIDMap = {}, tagArray = [];

let selectedGroups = {};
let remember = {};

function selectAll() { for (p in selectedGroups) { selectedGroups[p] = true; } PeopleDisclosure.render();}
function unselectAll() { for (p in  selectedGroups) { selectedGroups[p] = false; } PeopleDisclosure.render();}


function toggleRemember()
{
	remember.value = document.getElementById('remember').checked;
}

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

function createDiv(clazz)
{
	let aDiv = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
	aDiv.setAttribute("class", clazz);
  return aDiv;
}



function constructTagMap(peopleStore) {
  tagCountMap = {};
  tagArray = [];
  tagIDMap = {};
  
  for each (let person in peopleStore) {
    let tags = person.getProperty("tags");
    for each (let tag in tags) {
      if (!tagCountMap[tag]) tagCountMap[tag] = 1;
      else tagCountMap[tag] += 1;
    }
  }
  for (tag in tagCountMap) tagArray.push(tag);
  if (tagArray.length > 0) {
    tagArray.sort();
  }
  
  count = 1;
  for each (var tag in tagArray) {
    tagIDMap[count] = tag;
    count += 1;
  }
  tagIDMap["___all___"] = "___all___";
}


let PeopleDisclosure = {
  onLoad: function() {
    result = window.top.arguments ? window.top.arguments[0].peopleList : {};
		//result = People.find({});
		PeopleDisclosure.onResult(result);
  },

	onResult: function(peopleStore) {
    try {
		this.peopleResults = peopleStore;
    constructTagMap(peopleStore);

    for each (var grp in tagArray) {
			selectedGroups[grp] = false;
		}
		this.render();
    } catch (e) {
      dump(e + "\n");
      dump(e.stack+"\n");
    }
	},

	render: function() {
		let results = document.getElementById("results");
		if (results) {
			while (results.lastChild) results.removeChild(results.lastChild);
		}
		this.renderGroups(this.peopleResults);
	},

  renderGroups: function(peopleStore)
  {
    let results = document.getElementById("results");
    if(results) {
			if (peopleStore.length == 0) {
				document.getElementById("message").innerHTML = "<br/><br/><br/>You have no contacts loaded in Firefox.  Select \"Contacts\" from the Tools menu to activate some."
			}
			else {
				document.getElementById("message").innerHTML = "";

        // Start with groups
        if (tagArray.length > 0) {
          let count = 1;
          for each (tag in tagArray) {
            let group = createDiv("group");
            group.setAttribute("id", "group-" + count);

            let checkbox = document.createElementNS("http://www.w3.org/1999/xhtml", "input");
            checkbox.setAttribute("type", "checkbox");
            checkbox.setAttribute("name", tag);
            checkbox.setAttribute("class", "disclosureCheckbox");
            checkbox.setAttribute("onclick", "selectedGroups['" + tag + "']=this.checked");
            if (selectedGroups[tag]) checkbox.setAttribute("checked", "true");
            group.appendChild(checkbox);

            group.appendChild(document.createTextNode(tag));

            let groupText = createDiv("groupText");
            groupText.appendChild(document.createTextNode(" (" + tagCountMap[tag] + ")"));
            group.appendChild(groupText);
            
            group.setAttribute("class", "groupUnselected");
            group.setAttribute("onclick", "toggleGroup(" + count + ")");
            
            results.appendChild(group);
            count += 1;
          }
          let br = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
          br.setAttribute("class", "allSpacer");
          results.appendChild(br);
        }
        
        let allGroup = createDiv("group");
        let checkbox = document.createElementNS("http://www.w3.org/1999/xhtml", "input");
        allGroup.setAttribute("id", "group-___all___");
        checkbox.setAttribute("type", "checkbox");
        checkbox.setAttribute("name", "___all___");
        checkbox.setAttribute("class", "disclosureCheckbox");
        checkbox.setAttribute("onclick", "selectedGroups['___all___']=this.checked");
        if (selectedGroups["___all___"]) checkbox.setAttribute("checked", "true");
        allGroup.appendChild(checkbox);
        allGroup.appendChild(document.createTextNode("All"));
        
        let groupText = createDiv("groupText");
        groupText.appendChild(document.createTextNode(" (" + peopleStore.length + ")"));
        allGroup.appendChild(groupText);
        allGroup.setAttribute("class", "groupUnselected");
        allGroup.setAttribute("onclick", "toggleGroup('___all___')");
        results.appendChild(allGroup);
        
      }
    }
  }
};

function toggleGroup(tagID)
{
  let grp = document.getElementById('group-' + tagID);
  let grpTag = tagIDMap[tagID];
  if (selectedGroups[grpTag]) {
    selectedGroups[grpTag] = false;
    grp.setAttribute("class", "groupUnselected");
  } else {
    selectedGroups[grpTag] = true;
    grp.setAttribute("class", "groupSelected");  
  }
  checkEnableAccept();
}

function checkEnableAccept(){
  for each (let value in selectedGroups){
    if(value){
      window.parent.document.getElementById('disclosurePageLoader').getButton("accept").disabled = false;
      return
    }
  }
  window.parent.document.getElementById('disclosurePageLoader').getButton("accept").disabled = true;
}


function htmlescape(html) {
  if (html == null || html == undefined) return "";
  
  return html.
    replace(/&/gmi, '&amp;').
    replace(/"/gmi, '&quot;').
    replace(/>/gmi, '&gt;').
    replace(/</gmi, '&lt;')
}

$(document).ready(function() {
	Components.utils.import("resource://people/modules/people.js");
	window.parent.document.getElementById('disclosurePageLoader').getButton("accept").disabled = true;

	var targetURL  = window.top.arguments ? window.top.arguments[0].site : "This page";
	var targetFields  = window.top.arguments ? window.top.arguments[0].fields : undefined;
	remember  = window.top.arguments ? window.top.arguments[0].remember : undefined;
	selectedGroups = window.top.arguments ? window.top.arguments[0].selectedGroups : {};
	
	if (targetFields != undefined) {
		fieldList = targetFields;
		fieldActive = window.top.arguments[0].fieldsActive;
		for each (var f in fieldList) {
			fieldActive[f] = true;
		}
	}
	
	let titleText = document.getElementById("titleText");
	
	// TODO: DO a better job extracting the host name from the target URL
	if (targetURL != undefined) {
		if (("" + targetURL).indexOf("file:") == 0) {
			targetURL = "A file on your computer";
		}
	}
	titleText.innerHTML = "The web site <span class='siteid'>" + targetURL + "</span> wants to access your contact data:";

	let fields = document.getElementById("fieldselector");
	for each (let aField in fieldList) {
    let aLabel;
    if (fieldLabels[aField]) 
      aLabel = fieldLabels[aField];
    else
      aLabel = aField;
    
		let aLabelDiv = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
		aLabelDiv.innerHTML = aLabel;
		aLabelDiv.setAttribute("class", "fieldLabel");

		let aFieldCheckbox = document.createElementNS("http://www.w3.org/1999/xhtml", "input");
		aFieldCheckbox.id = "field-" + aField;
		aFieldCheckbox.setAttribute("type", "checkbox");
		aFieldCheckbox.setAttribute("onclick", "fieldActive['" + aField + "']=!fieldActive['" + aField + "']; PeopleDisclosure.render()");
		if (fieldActive[aField]) {
			aFieldCheckbox.setAttribute("checked", "true");
		}

		aLabelDiv.insertBefore(aFieldCheckbox, aLabelDiv.firstChild);
		fields.appendChild(aLabelDiv);
	}
	
	PeopleDisclosure.onLoad();
});

