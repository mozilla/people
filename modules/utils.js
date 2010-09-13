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

Cu.import("resource://people/modules/ext/Sync.js");
Cu.import("resource://people/modules/ext/log4moz.js");

let Utils = {
  getRows: function getRows(stmt) {
    let rows = [];
    let [execute, onComplete] = Sync.withCb(stmt.executeAsync, stmt);
    execute({
      handleResult: function(results) {
        let row;
        while ((row = results.getNextRow()) != null) {
          rows.push(row.getResultByIndex(0));
        }
      },
      handleCompletion: onComplete,
      handleError: onComplete.throw
    });
    return rows;
  },

	deepCopy: function Weave_deepCopy(thing, noSort) {
    if (typeof(thing) != "object" || thing == null)
      return thing;
    let ret;

    if (Utils.isArray(thing)) {
      ret = [];
      for (let i = 0; i < thing.length; i++)
        ret.push(Utils.deepCopy(thing[i], noSort));

    } else {
      ret = {};
      let props = [p for (p in thing)];
      if (!noSort)
        props = props.sort();
      props.forEach(function(k) ret[k] = Utils.deepCopy(thing[k], noSort));
    }

    return ret;
  },

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
  // like lazy, but rather than new'ing the 3rd arg we use its return value
  lazy2: function Weave_lazy2(dest, prop, fn) {
    delete dest[prop];
    dest.__defineGetter__(prop, Utils.lazyCb2(dest, prop, fn));
  },
  lazyCb2: function Weave_lazyCb2(dest, prop, fn) {
    return function() {
      delete dest[prop];
      return dest[prop] = fn();
    };
  },


  mapCall: function mapCall(self, args, func) {
    let array = args[0];
    //let func = mapCall.caller;
    let extra = Array.slice(args, 1);
    return array.map(function(item) func.apply(self, [item].concat(extra)));
  },

  makeGUID: function makeGUID() {
    return Svc.UUIDGen.generateUUID().toString().slice(1, 37);
  },

  // Works on frames or exceptions, munges file:// URIs to shorten the paths
  // FIXME: filename munging is sort of hackish, might be confusing if
  // there are multiple extensions with similar filenames
  formatFrame: function Utils_formatFrame(frame) {
    let tmp = "<file:unknown>";

    let file = frame.filename || frame.fileName;
    if (file)
      tmp = file.replace(/^(?:chrome|file):.*?([^\/\.]+\.\w+)$/, "$1");

    if (frame.lineNumber)
      tmp += ":" + frame.lineNumber;
    if (frame.name)
      tmp = frame.name + "()@" + tmp;

    return tmp;
  },

  exceptionStr: function Weave_exceptionStr(e) {
    let message = e.message ? e.message : e;
    return message + " " + Utils.stackTrace(e);
 },

  stackTraceFromFrame: function Weave_stackTraceFromFrame(frame) {
    let output = [];
    while (frame) {
      let str = Utils.formatFrame(frame);
      if (str)
        output.push(str);
      frame = frame.caller;
    }
    return output.join(" < ");
  },

  stackTrace: function Weave_stackTrace(e) {
    // Wrapped nsIException
    if (e.location)
      return "Stack trace: " + Utils.stackTraceFromFrame(e.location);

    // Standard JS exception
    if (e.stack)
      return "JS Stack trace: " + e.stack.trim().replace(/\n/g, " < ").
        replace(/@(?:chrome|file):.*?([^\/\.]+\.\w+:)/g, "@$1");

    return "No traceback available";
  },

  makeURI: function Weave_makeURI(URIString) {
    if (!URIString)
      return null;
    try {
      return Svc.IO.newURI(URIString, null, null);
    } catch (e) {
      let log = Log4Moz.repository.getLogger("Service.Util");
      log.debug("Could not create URI (" + URIString + "): " + Utils.exceptionStr(e));
      return null;
    }
  },

  makeURL: function Weave_makeURL(URIString) {
    let url = Utils.makeURI(URIString);
    url.QueryInterface(Ci.nsIURL);
    return url;
  },
	
  xpath: function Weave_xpath(xmlDoc, xpathString) {
    let root = xmlDoc.ownerDocument == null ?
      xmlDoc.documentElement : xmlDoc.ownerDocument.documentElement;
    let nsResolver = xmlDoc.createNSResolver(root);

    return xmlDoc.evaluate(xpathString, xmlDoc, nsResolver,
                           Ci.nsIDOMXPathResult.ANY_TYPE, null);
  },

  // return the text value of the first node matched by an xpath expression
  // works with attributes, text nodes, and HTML elements (using .innerHTML)
  xpathText: function(doc, expr) {
    try {
      let iter = Utils.xpath(doc, expr);
      let foo = iter.iterateNext();
      return foo.nodeValue? foo.nodeValue :
        (foo.innerText? foo.innerText : foo.innerHTML);
    } catch (e) {
      return undefined;
    }
  },
  bind2: function Async_bind2(object, method) {
    return function innerBind() { return method.apply(object, arguments); };
  },

};

let Svc = {};
[["Directory", "file/directory_service", "nsIProperties"],
 ["IO", "network/io-service", "nsIIOService"],
 ["Observer", "observer-service", "nsIObserverService"],
 ["Storage", "storage/service", "mozIStorageService"],
 ["UUIDGen", "uuid-generator", "nsIUUIDGenerator"]
].forEach(function([prop, cid, iface]) Utils.lazy(Svc, prop, function()
  Cc["@mozilla.org/" + cid + ";1"].getService(Ci[iface])));
