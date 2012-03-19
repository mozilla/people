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
 * The Original Code is Mozilla.
 *
 * The Initial Developer of the Original Code is IBM Corporation.
 * Portions created by IBM Corporation are Copyright (C) 2004
 * IBM Corporation. All Rights Reserved.
 *
 * Contributor(s):
 *   Darin Fisher <darin@meer.net>
 *   Doron Rosenberg <doronr@us.ibm.com>
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

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

const nsIProtocolHandler = Components.interfaces.nsIProtocolHandler;

function PersonProtocol()
{
}

PersonProtocol.prototype =
{
  classDescription: "Person Protocol",  
  contractID: "@mozilla.org/network/protocol;1?name=person",  
  classID: Components.ID("b6e1d39c-b39c-4b1f-a088-e2fbb4cff9a6"),
  QueryInterface: XPCOMUtils.generateQI([nsIProtocolHandler]),

  scheme: "person",
  defaultPort: -1,
  protocolFlags: nsIProtocolHandler.URI_NORELATIVE |
                 nsIProtocolHandler.URI_NOAUTH,
  
  allowPort: function(port, scheme)
  {
    return false;
  },

  newURI: function(spec, charset, baseURI)
  {
    var uri = Components.classes["@mozilla.org/network/simple-uri;1"]
                        .createInstance(Components.interfaces.nsIURI);
    uri.spec = spec;
    return uri;
  },

  newChannel: function(aURI)
  {
    // XXX why is this done here?
    Components.utils.import("resource://people/modules/people.js");
    Components.utils.import("resource://people/modules/import.js");    

    // aURI is a nsIUri, so get a string from it using .spec
    var ios = Components.classes["@mozilla.org/network/io-service;1"]
                        .getService(Components.interfaces.nsIIOService);
    var term = aURI.spec.slice(7);
    let uri;
    if (term.indexOf("group:") == 0) {
      uri = ios.newURI("chrome://people/content/group.xhtml?input=" + term.slice(6), null, null);    
    } else {
      uri = ios.newURI("chrome://people/content/person.xhtml?input=" + term, null, null);
    }
    return ios.newChannelFromURI(uri);
  }
}

var components = [PersonProtocol];
if (XPCOMUtils.generateNSGetFactory)
    var NSGetFactory = XPCOMUtils.generateNSGetFactory(components);
else
    var NSGetModule = XPCOMUtils.generateNSGetModule(components);
