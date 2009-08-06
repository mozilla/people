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
 *   Myk Melez <myk@mozilla.org>
 *   Justin Dolske <dolske@mozilla.com>
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

/* Inject the People content API into window.navigator objects. */
/* Partly based on code in the Geode extension. */

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://people/modules/ext/URI.js");
Cu.import("resource://people/modules/people.js");

let PeopleInjector = {
  get _docSvc() {
    delete this._docSvc;
    return this._docSvc = Cc["@mozilla.org/docloaderservice;1"].
                          getService(Ci.nsIWebProgress);
  },

  onLoad: function() {
    // WebProgressListener for getting notification of new doc loads.
    // XXX Ugh. Since we're a chrome overlay, it would be nice to just
    // use gBrowser.addProgressListener(). But that isn't sending
    // STATE_TRANSFERRING, and the earliest we can get at the page is
    // STATE_STOP (which is onload, and is inconveniently late).
    // We'll use the doc loader service instead, but that means we need to
    // filter out loads for other windows.
    this._docSvc.addProgressListener(this,
                                     Ci.nsIWebProgress.NOTIFY_STATE_DOCUMENT);
  },

  onUnload: function() {
    this._docSvc.removeProgressListener(this);
  },


  //**************************************************************************//
  // nsISupports

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIWebProgressListener,
                                         Ci.nsISupportsWeakReference]),


  //**************************************************************************//
  // nsIWebProgressListener

  onStateChange: function(aWebProgress, aRequest, aStateFlags,  aStatus) {
    // STATE_START is too early, doc is still the old page.
    // STATE_STOP is inconveniently late (it's onload).
    if (!(aStateFlags & Ci.nsIWebProgressListener.STATE_TRANSFERRING))
      return;

    var domWindow = aWebProgress.DOMWindow;
    var chromeWin = domWindow
                        .QueryInterface(Ci.nsIInterfaceRequestor)
                        .getInterface(Ci.nsIWebNavigation)
                        .QueryInterface(Ci.nsIDocShellTreeItem)
                        .rootTreeItem
                        .QueryInterface(Ci.nsIInterfaceRequestor)
                        .getInterface(Ci.nsIDOMWindow)
                        .QueryInterface(Ci.nsIDOMChromeWindow);
    if (chromeWin != window)
      return;

    this._inject(domWindow);
  },

  // Stubs for the nsIWebProgressListener interfaces that we don't use.
  onProgressChange: function() {},
  onLocationChange: function() {},
  onStatusChange:   function() {},
  onSecurityChange: function() {},


  //**************************************************************************//
  // 

  SCRIPT_TO_INJECT_URI: "resource://people/content/injected.js",

  get _scriptToInject() {
    delete this._scriptToInject;

    let uri = new URI(this.SCRIPT_TO_INJECT_URI).QueryInterface(Ci.nsIFileURL);

    // Slurp the contents of the file into a string.
    let inputStream = Cc["@mozilla.org/network/file-input-stream;1"].
                      createInstance(Ci.nsIFileInputStream);
    inputStream.init(uri.file, 0x01, -1, null); // RD_ONLY
    let lineStream = inputStream.QueryInterface(Ci.nsILineInputStream);
    let line = { value: "" }, hasMore, scriptToInject = "";
    do {
        hasMore = lineStream.readLine(line);
        scriptToInject += line.value + "\n";
    } while (hasMore);
    lineStream.close();

    return this._scriptToInject = scriptToInject;
  },

  /*
   * _inject
   *
   * Injects the content API into the specified DOM window.
   */
  _inject: function(win) {
    let sandbox = new Cu.Sandbox(win);
    sandbox.importFunction(this._getFindFunction(), "find");
    sandbox.window = win.wrappedJSObject;
    Cu.evalInSandbox(this._scriptToInject, sandbox, "1.8",
                     this.SCRIPT_TO_INJECT_URI, 1);
  },

  _getFindFunction: function() {
    return function(win, attrs, successCallback, failureCallback) {
      win = XPCSafeJSObjectWrapper(win);
      attrs = XPCSafeJSObjectWrapper(attrs);
      successCallback = XPCSafeJSObjectWrapper(successCallback);
      failureCallback = XPCSafeJSObjectWrapper(failureCallback);

      function onAllow() {
        let people = People.find(attrs);
        // FIXME: detect errors finding people and call the error callback.
        successCallback(people);
      }

      function onDeny() {
        let error = { message: "permission denied" };
        failureCallback(error);
      }

      function getNotificationBox() {
        let notificationBox;

        // Get topmost window, in case we're in a frame.
        let doc = win.top.document;

        // Find the <browser> that contains the document by looking through
        // all the open windows and their <tabbrowser>s.
        let wm = Cc["@mozilla.org/appshell/window-mediator;1"].
                 getService(Ci.nsIWindowMediator);
        let enumerator = wm.getEnumerator("navigator:browser");
        let tabBrowser = null;
        let foundBrowser = null;
        while (!foundBrowser && enumerator.hasMoreElements()) {
          tabBrowser = enumerator.getNext().getBrowser();
          foundBrowser = tabBrowser.getBrowserForDocument(doc);
        }
        if (foundBrowser)
          notificationBox = tabBrowser.getNotificationBox(foundBrowser);
    
        return notificationBox;
      }

      let site = win.location.host || win.location;
      let promptText = "The page at " + site + " wants to access your people.";
      let buttons = [
        {
          label:     "No Way",
          accessKey: "n",
          popup:     null,
          callback:  function(bar) onDeny()
        },
        {
          label:     "Way",
          accessKey: "w",
          popup:     null,
          callback:  function(bar) onAllow()
        },
      ];

      let box = getNotificationBox();
      let oldBar = box.getNotificationWithValue("moz-people-find");
      let newBar = box.appendNotification(promptText,
                                          "moz-people-find",
                                          null,
                                          box.PRIORITY_INFO_MEDIUM,
                                          buttons);

      let checkbox = document.createElementNS(
        "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
        "checkbox"
      );
      checkbox.setAttribute("id", "rememberDecision");
      checkbox.setAttribute("label", "Remember for " + site);
      newBar.appendChild(checkbox);

      if (oldBar)
        box.removeNotification(oldBar);
    }
  }

};

window.addEventListener("load",   function() PeopleInjector.onLoad(),   false);
window.addEventListener("unload", function() PeopleInjector.onUnload(), false);
