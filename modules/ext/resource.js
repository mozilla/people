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
 * The Original Code is Bookmarks Sync.
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2007
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *  Dan Mills <thunder@mozilla.com>
 *  Anant Narayanan <anant@kix.in>
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

const EXPORTED_SYMBOLS = ["Resource"];

const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://people/modules/ext/Sync.js");
Cu.import("resource://people/modules/ext/log4moz.js");
Cu.import("resource://people/modules/utils.js");
Cu.import("resource://people/modules/ext/auth.js");

// = Resource =
//
// Represents a remote network resource, identified by a URI.
function Resource(uri) {
  this._init(uri);
}
Resource.prototype = {
  _logName: "Net.Resource",

  // ** {{{ Resource.authenticator }}} **
  //
  // Getter and setter for the authenticator module
  // responsible for this particular resource. The authenticator
  // module may modify the headers to perform authentication
  // while performing a request for the resource, for example.
  get authenticator() {
    if (this._authenticator)
      return this._authenticator;
    else
      return new NoOpAuthenticator();
        //return Auth.lookupAuthenticator(this.spec);
  },
  set authenticator(value) {
    this._authenticator = value;
  },

  // ** {{{ Resource.headers }}} **
  //
  // Getter for access to received headers after the request
  // for the resource has been made, setter for headers to be included
  // while making a request for the resource.
  get headers() {
    return this.authenticator.onRequest(this._headers);
  },
  set headers(value) {
    this._headers = value;
  },
  setHeader: function Res_setHeader() {
    if (arguments.length % 2)
      throw "setHeader only accepts arguments in multiples of 2";
    for (let i = 0; i < arguments.length; i += 2) {
      this._headers[arguments[i]] = arguments[i + 1];
    }
  },

  // ** {{{ Resource.uri }}} **
  //
  // URI representing this resource.
  get uri() {
    return this._uri;
  },
  set uri(value) {
    if (typeof value == 'string')
      this._uri = Utils.makeURI(value);
    else
      this._uri = value;
  },

  // ** {{{ Resource.spec }}} **
  //
  // Get the string representation of the URI.
  get spec() {
    if (this._uri)
      return this._uri.spec;
    return null;
  },

  // ** {{{ Resource.data }}} **
  //
  // Get and set the data encapulated in the resource.
  _data: null,
  get data() this._data,
  set data(value) {
    this._data = value;
  },

  _init: function Res__init(uri) {
    this._log = Log4Moz.repository.getLogger(this._logName);
    this._log.level = Log4Moz.Level.Info;
    
    //  Log4Moz.Level[Utils.prefs.getCharPref("log.logger.network.resources")];
    this.uri = uri;
    this._headers = {'Content-type': 'text/plain'};
  },

  // ** {{{ Resource._createRequest }}} **
  //
  // This method returns a new IO Channel for requests to be made
  // through. It is never called directly, only {{{_request}}} uses it
  // to obtain a request channel.
  //
  _createRequest: function Res__createRequest() {
    let channel = Services.io.newChannel(this.spec, null, null).
      QueryInterface(Ci.nsIRequest).QueryInterface(Ci.nsIHttpChannel);

    // Always validate the cache:
    channel.loadFlags |= Ci.nsIRequest.LOAD_BYPASS_CACHE;
    channel.loadFlags |= Ci.nsIRequest.INHIBIT_CACHING;

    // Setup a callback to handle bad HTTPS certificates.
    channel.notificationCallbacks = new badCertListener();

    // Avoid calling the authorizer more than once
    let headers = this.headers;
    for (let key in headers) {
      if (key == 'Authorization')
        this._log.trace("HTTP Header " + key + ": ***** (suppressed)");
      else
        this._log.trace("HTTP Header " + key + ": " + headers[key]);
      channel.setRequestHeader(key, headers[key], false);
    }
    return channel;
  },

  _onProgress: function Res__onProgress(channel) {},

  // ** {{{ Resource._request }}} **
  //
  // Perform a particular HTTP request on the resource. This method
  // is never called directly, but is used by the high-level
  // {{{get}}}, {{{put}}}, {{{post}}} and {{delete}} methods.
  _request: function Res__request(action, data) {
    let iter = 0;
    let channel = this._createRequest();

    if ("undefined" != typeof(data))
      this._data = data;

    // PUT and POST are trreated differently because
    // they have payload data.
    if ("PUT" == action || "POST" == action) {
      // Convert non-string bodies into JSON
      if (this._data.constructor.toString() != String)
        this._data = JSON.stringify(this._data);

      this._log.debug(action + " Length: " + this._data.length);
      // this._log.trace(action + " Body: " + this._data);

      let type = ('Content-Type' in this._headers)?
        this._headers['Content-Type'] : 'text/plain';

      let stream = Cc["@mozilla.org/io/string-input-stream;1"].
        createInstance(Ci.nsIStringInputStream);
      stream.setData(this._data, this._data.length);

      channel.QueryInterface(Ci.nsIUploadChannel);
      channel.setUploadStream(stream, type, this._data.length);
    }

    // Setup a channel listener so that the actual network operation
    // is performed asynchronously.
    let [chanOpen, chanCb] = Sync.withCb(channel.asyncOpen, channel);
    let listener = new ChannelListener(chanCb, this._onProgress, this._log);
    channel.requestMethod = action;

    // The channel listener might get a failure code
    try {
      this._data = chanOpen(listener, null);
    }
    catch(ex) {
      // Combine the channel stack with this request stack
      let error = Error(ex.message);
      let chanStack = ex.stack.trim().split(/\n/).slice(1);
      let requestStack = error.stack.split(/\n/).slice(1);

      // Strip out the args for the last 2 frames because they're usually HUGE!
      for (let i = 0; i <= 1; i++)
        requestStack[i] = requestStack[i].replace(/\(".*"\)@/, "(...)@");

      error.stack = chanStack.concat(requestStack).join("\n");
      throw error;
    }

    // Set some default values in-case there's no response header
    let headers = {};
    let status = 0;
    let success = true;
    try {
      // Read out the response headers if available
      channel.visitResponseHeaders({
        visitHeader: function visitHeader(header, value) {
          headers[header] = value;
        }
      });
      status = channel.responseStatus;
      success = channel.requestSucceeded;

      if (success) {
        this._log.debug(action + " success: " + status);
        if (this._log.level <= Log4Moz.Level.Trace)
          this._log.trace(action + " Body: " + this._data);
      }
      else {
        let log = "debug";
        let mesg = action + " fail: " + status;

        // Only log the full response body (may be HTML) when Trace logging
        if (this._log.level <= Log4Moz.Level.Trace) {
          log = "trace";
          mesg += " " + this._data;
        }

        this._log[log](mesg);
      }

    }
    // Got a response but no header; must be cached (use default values)
    catch(ex) {
      this._log.debug(action + " cached: " + status);
    }

    let ret = new String(this._data);
    ret.headers = headers;
    ret.status = status;
    ret.success = success;

    // Make a lazy getter to convert the json response into an object
    Utils.lazy2(ret, "obj", function() JSON.parse(ret));

    // lazy getter to convert XML to a DOM object
    Utils.lazy2(ret, "xmldom", Utils.bind2(function() {
      let DOMParser = new Components.Constructor("@mozilla.org/xmlextras/domparser;1", "nsIDOMParser");
      let parser = new DOMParser();
      parser.init(this.spec, this.spec, this.spec);
      return parser.parseFromString(ret, "text/xml");
    }));

    // lazy getter to convert HTML to a DOM object
    Utils.lazy2(ret, "dom", Utils.bind2(this, function() {
      return this._parse(this.uri, ret);
    }));

    return ret;
  },

  /**
   * Stole this code from nsMycrosummaryService.js, thanks Myk!
   * 
   * Parse a string of HTML text.  Used by _load() when it retrieves HTML.
   * We do this via hidden XUL iframes, which according to bz is the best way
   * to do it currently, since bug 102699 is hard to fix.
   * 
   * @param   uri
   *          nsIURI of the URI matching the content
   * @param   htmlText
   *          a string containing the HTML content
   *
   */
  _parse: function Res__parse(uri, htmlText) {
    this._log.debug("Parsing HTML");
    if (!uri) {
      this._log.error("Cannot parse HTML without a URI");
      return null;
    }
    // Find a window to stick our hidden iframe into.
    var windowMediator = Cc['@mozilla.org/appshell/window-mediator;1'].
      getService(Ci.nsIWindowMediator);
    var window = windowMediator.getMostRecentWindow(null);
    // XXX We can use other windows, too, so perhaps we should try to get
    // some other window if there's no browser window open.  Perhaps we should
    // even prefer other windows, since there's less chance of any browser
    // window machinery like throbbers treating our load like one initiated
    // by the user.
    if (!window) {
      this._log.error("Could not find a window to parse HTML in");
      return null;
    }
    var document = window.document;
    var rootElement = document.documentElement;

    // Create an iframe, make it hidden, and secure it against untrusted content.
    let iframe = document.createElement('iframe');
    iframe.setAttribute("collapsed", true);
    iframe.setAttribute("type", "content");

    // Insert the iframe into the window, creating the doc shell.
    rootElement.appendChild(iframe);

    // When we insert the iframe into the window, it immediately starts loading
    // about:blank, which we don't need and could even hurt us (for example
    // by triggering bugs like bug 344305), so cancel that load.
    var webNav = iframe.docShell.QueryInterface(Ci.nsIWebNavigation);
    webNav.stop(Ci.nsIWebNavigation.STOP_NETWORK);

    // Turn off JavaScript and auth dialogs for security and other things
    // to reduce network load.
    // XXX We should also turn off CSS.
    iframe.docShell.allowJavascript = false;
    iframe.docShell.allowAuth = false;
    iframe.docShell.allowPlugins = false;
    iframe.docShell.allowMetaRedirects = false;
    iframe.docShell.allowSubframes = false;
    iframe.docShell.allowImages = false;

    // Convert the HTML text into an input stream.
    var converter = Cc["@mozilla.org/intl/scriptableunicodeconverter"].
      createInstance(Ci.nsIScriptableUnicodeConverter);
    converter.charset = "UTF-8";
    var stream = converter.convertToInputStream(htmlText);

    // Set up a channel to load the input stream.
    var channel = Cc["@mozilla.org/network/input-stream-channel;1"].
      createInstance(Ci.nsIInputStreamChannel);
    channel.setURI(uri);
    channel.contentStream = stream;

    // Load in the background so we don't trigger web progress listeners.
    var request = channel.QueryInterface(Ci.nsIRequest);
    request.loadFlags |= Ci.nsIRequest.LOAD_BACKGROUND;

    // Specify the content type since we're not loading content from a server,
    // so it won't get specified for us, and if we don't specify it ourselves,
    // then Firefox will prompt the user to download content of "unknown type".
    var baseChannel = channel.QueryInterface(Ci.nsIChannel);
    baseChannel.contentType = "text/html";

    // Load as UTF-8, which it'll always be, because XMLHttpRequest converts
    // the text (i.e. XMLHTTPRequest.responseText) from its original charset
    // to UTF-16, then the string input stream component converts it to UTF-8.
    baseChannel.contentCharset = "UTF-8";

    // Create a sync version of the uri loader function and a callback
    // we can pass around to event listeners
    let uriLoader = Cc["@mozilla.org/uriloader;1"].getService(Ci.nsIURILoader);
    let [openURI, openCb] = Sync.withCb(uriLoader.openURI, uriLoader);

    // Register the parse handler as a load event listener.
    // Listen for "DOMContentLoaded" instead of "load" because background loads
    // don't fire "load" events.
    var parseHandler = {
      _self: this,
      handleEvent: function Res_parseHandler_handleEvent(event) {
        event.target.removeEventListener("DOMContentLoaded", this, false);
        try     { openCb(event); }
        catch (e) { dump("ERROR: " + e + "\n"); }
        finally { this._self = null; }
      }
    };
    iframe.addEventListener("DOMContentLoaded", parseHandler, true);

    // Start the load (sync/async), wrap in a try/catch just in case

    let ret = null;
    try {
      openURI(channel, true, iframe.docShell);
      ret = iframe.contentDocument;
    } catch (e) {
      this._log.error("Could not parse HTML: " + e);
    }

    return ret;
  },

  // ** {{{ Resource.get }}} **
  //
  // Perform an asynchronous HTTP GET for this resource.
  // onComplete will be called on completion of the request.
  get: function Res_get() {
    return this._request("GET");
  },

  // ** {{{ Resource.get }}} **
  //
  // Perform a HTTP PUT for this resource.
  put: function Res_put(data) {
    return this._request("PUT", data);
  },

  // ** {{{ Resource.post }}} **
  //
  // Perform a HTTP POST for this resource.
  post: function Res_post(data) {
    return this._request("POST", data);
  },

  // ** {{{ Resource.delete }}} **
  //
  // Perform a HTTP DELETE for this resource.
  delete: function Res_delete() {
    return this._request("DELETE");
  }
};

// = ChannelListener =
//
// This object implements the {{{nsIStreamListener}}} interface
// and is called as the network operation proceeds.
function ChannelListener(onComplete, onProgress, logger) {
  this._onComplete = onComplete;
  this._onProgress = onProgress;
  this._log = logger;
}
ChannelListener.prototype = {
  onStartRequest: function Channel_onStartRequest(channel) {
    // XXX Bug 482179 Some reason xpconnect makes |channel| only nsIRequest
    channel.QueryInterface(Ci.nsIHttpChannel);

    let log = "trace";
    let mesg = channel.requestMethod + " request for " + channel.URI.spec;
    // Only log a part of the uri for logs higher than trace
    if (this._log.level > Log4Moz.Level.Trace) {
      log = "debug";
      if (mesg.length > 200)
        mesg = mesg.substr(0, 200) + "...";
    }
    this._log[log](mesg);

    this._data = '';
  },

  onStopRequest: function Channel_onStopRequest(channel, context, status) {
    if (this._data == '')
      this._data = null;

    // Throw the failure code name (and stop execution)
    if (!Components.isSuccessCode(status))
      this._onComplete.throw(Error(Components.Exception("", status).name));

    this._onComplete(this._data);
  },

  onDataAvailable: function Channel_onDataAvail(req, cb, stream, off, count) {
    let siStream = Cc["@mozilla.org/scriptableinputstream;1"].
      createInstance(Ci.nsIScriptableInputStream);
    siStream.init(stream);

    this._data += siStream.read(count);
    this._onProgress();
  }
};

// = badCertListener =
//
// We use this listener to ignore bad HTTPS
// certificates and continue a request on a network
// channel. Probably not a very smart thing to do,
// but greatly simplifies debugging and is just very
// convenient.
function badCertListener() {
}
badCertListener.prototype = {
  getInterface: function(aIID) {
    return this.QueryInterface(aIID);
  },

  QueryInterface: function(aIID) {
    if (aIID.equals(Components.interfaces.nsIBadCertListener2) ||
        aIID.equals(Components.interfaces.nsIInterfaceRequestor) ||
        aIID.equals(Components.interfaces.nsISupports))
      return this;

    throw Components.results.NS_ERROR_NO_INTERFACE;
  },

  notifyCertProblem: function certProblem(socketInfo, sslStatus, targetHost) {
    // Silently ignore?
    let log = Log4Moz.repository.getLogger("Service.CertListener");
    //log.level =
     // Log4Moz.Level[Utils.prefs.getCharPref("log.logger.network.resources")];
    log.debug("Invalid HTTPS certificate encountered, ignoring!");

    return true;
  }
};
