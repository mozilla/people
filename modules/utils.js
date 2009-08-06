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
 * The Original Code is Util.
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *  Edward Lee <edilee@mozilla.com>
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

let EXPORTED_SYMBOLS = ["Utils", "Svc"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

let Utils = {
  isArray: function isArray(obj) {
    return obj != null && obj.constructor.toString() == Array;
  },

  lazy: function lazy(dest, prop, func) {
    delete dest[prop];
    dest.__defineGetter__(prop, function() {
      delete dest[prop];
      return dest[prop] = func.call(dest);
    });
  },

  mapCall: function mapCall(self, args) {
    let array = args[0];
    let func = mapCall.caller;
    let extra = Array.slice(args, 1);
    return array.map(function(item) func.apply(self, [item].concat(extra)));
  },

  makeGUID: function makeGUID() {
    return Svc.UUIDGen.generateUUID().toString().replace(/[{}]/g, '');
  }
};

let Svc = {};
[["Directory", "file/directory_service", "nsIProperties"],
 ["Observer", "observer-service", "nsIObserverService"],
 ["Storage", "storage/service", "mozIStorageService"],
 ["UUIDGen", "uuid-generator", "nsIUUIDGenerator"]
].forEach(function([prop, cid, iface]) Utils.lazy(Svc, prop, function()
  Cc["@mozilla.org/" + cid + ";1"].getService(Ci[iface])));
