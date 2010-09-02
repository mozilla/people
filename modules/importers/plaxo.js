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
 *  Michael Hanson <mhanson@mozilla.com>
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

let EXPORTED_SYMBOLS = ["PlaxoImporter"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://people/modules/utils.js");
Cu.import("resource://people/modules/ext/log4moz.js");
Cu.import("resource://people/modules/people.js");
Cu.import("resource://people/modules/import.js");
Cu.import("resource://people/modules/ext/resource.js");
Cu.import("resource://people/modules/importers/genericpoco.js");


function PlaxoImporter() {
  this._log = Log4Moz.repository.getLogger("People.PlaxoImporter");
  this._log.debug("Initializing importer backend for " + this.displayName);
}
PlaxoImporter.prototype = {
  __proto__: GenericPoCoImporter.prototype,
  get name() "Plaxo",
  get displayName() "Plaxo Contacts",
  get iconURL() "chrome://people/content/images/plaxo.png",
  get provider() "http://www.plaxo.com",

  // a fake url we catch on redirect to it, allowing us to catch the
  // access token
  get redirectURL() "http://thunderbird.local/access.xhtml",
  
  // these are retreived by XRDS, however for services not supporting
  // discovery they can be set here
  consumerToken: "anonymous",
  consumerSecret: ""
};



PeopleImporter.registerBackend(PlaxoImporter);
