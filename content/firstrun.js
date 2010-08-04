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

//--------------------------------------------------------
// First Run implementation:
//--------------------------------------------------------

try {
Components.utils.import("resource://gre/modules/AddonManager.jsm");
} catch(e) {
  
}

var Prefs = Components.classes["@mozilla.org/preferences-service;1"]
                   .getService(Components.interfaces.nsIPrefService);
Prefs = Prefs.getBranch("extensions.mozillalabs.contacts.");
var Overlay = {
  init: function(){
    window.removeEventListener("load", Overlay.init, true);
    if (typeof(AddonManager) != 'undefined') {
      var self = this;
      AddonManager.getAddonByID("contacts@labs.mozilla.com", function(addon) {
	self._finalize_init(addon.version);
      });
      return;
    }
    var gExtensionManager = Components.classes["@mozilla.org/extensions/manager;1"]
                            .getService(Components.interfaces.nsIExtensionManager);
    var current = gExtensionManager.getItemForID("contacts@labs.mozilla.com").version;
    //gets the version number.
    this._finalize_init(current);
  },
  _finalize_init: function(version) {
    alert(version);
    var ver = -1, firstrun = true;
    try{
      ver = Prefs.getCharPref("version");
      firstrun = Prefs.getBoolPref("firstrun");
    }catch(e){
      //nothing
    }finally{
      if (firstrun){
        Prefs.setBoolPref("firstrun",false);
        Prefs.setCharPref("version",current);
	
        window.setTimeout(function(){
          gBrowser.selectedTab = gBrowser.addTab("http://mozillalabs.com/conceptseries/identity/contacts/");
        }, 1500); //Firefox 2 fix - or else tab will get closed
				
      }		
      
      if (ver!=current && !firstrun){ // !firstrun ensures that this section does not get loaded if its a first run.
        Prefs.setCharPref("version",current);
        
        // Insert code if version is different here => upgrade
        window.setTimeout(function(){
          gBrowser.selectedTab = gBrowser.addTab("chrome://people/content/upgrade.xhtml");          
        }, 1500); //Firefox 2 fix - or else tab will get closed
      }
    }
  }
};
window.addEventListener("load", Overlay.init, true);
