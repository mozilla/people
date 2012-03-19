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
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *  Ruven Chu <rchu@mozilla.com>
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

Components.utils.import("resource://people/modules/people.js");
let IO_SERVICE = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);

SendLinkMethods = {
  gPerson: null,
  showSendWindow: function (object){
    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator);
    var win = wm.getMostRecentWindow(null);
    /*var callbackFunc = function(token){
      win.setTimeout(afterAuthCallback, 0, requestData, token);
    };*/
    win.openDialog("chrome://people/content/sendLink.xul",
        "people_send_link",
        "chrome,centerscreen,modal,dialog=yes", object);
  },
  checkName: function(){
    this.gPerson = this.findPerson(document.getElementById("contact-name").value);
    if(this.gPerson == null) return;
    
    let choices = [];
    if(this.gPerson.services.sendPublicMessageTo){
      for each (let [name,svc] in Iterator(this.gPerson.servicesByProvider.sendPublicMessageTo)){
        choices.push("public: " + name);
      }  
    }
    if(this.gPerson.services.sendPrivateMessageTo){
      for each (let [name,svc] in Iterator(this.gPerson.servicesByProvider.sendPrivateMessageTo)){
        choices.push("private: " + name);
      }  
    }
    let menulist = document.getElementById("contact-menulist");
    menulist.disabled = false;
    menulist.removeAllItems();
    
    for each (let choice in choices){
      menulist.appendItem(choice, choice);
    }
    
    menulist.selectedIndex = 0;
      
    let button = document.getElementById("send-link");
    button.disabled = false;
    window.sizeToContent();

  },
  findPerson: function(name){
    let p = People.find({displayName:name})[0];
    dump(p.displayName + ":\n");
    dump(name + ":\n");
    if (p.displayName != name) return null;
    p.services = p.constructServices();
    p.servicesByProvider = p.constructServicesByProvider();
    return p;
  },
  sendLink: function(){
    
    let menulist = document.getElementById("contact-menulist");
    let value = menulist.selectedItem.value;
    let publicprivate = value.substring(0,6);
    
    if(publicprivate == "public"){
      var provider = value.substring(8);
    } else {
      var provider = value.substring(9);
    }
    
    let owner = window.arguments[0].ownerDocument;
    let text = "";
    
    if(window.arguments[0].localName == 'a'){
      text += window.arguments[0].href;
    } else if (window.arguments[0].localName == 'img'){
      text += window.arguments[0].src;
    } else {
      text += owner.location;
    }
    let baseURI = owner.documentURIObject;
    let targetURI = IO_SERVICE.newURI(text, null, baseURI);
    dump(this.handleResponse + "\n");
    if (publicprivate == "public") this.gPerson.servicesByProvider.sendPublicMessageTo[provider](text, this.handleResponse);
    else this.gPerson.servicesByProvider.sendPrivateMessageTo[provider](text, this.handleResponse);
    
  },
  handleResponse: function(status){
    if(status.status != "ok") alert("Sorry, could not send!");
    window.close();
  },
  sendEnter : function(status){
    if(this.gPerson != null) this.sendLink();
  },
  disableButtons: function(){
    let menulist = document.getElementById("contact-menulist");
    menulist.disabled = true;
    let button = document.getElementById("send-link");
    button.disabled = true;
    gPerson = null;
  }

};