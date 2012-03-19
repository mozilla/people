
let EXPORTED_SYMBOLS = ['OAuthBaseImporter'];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://people/modules/utils.js");
Cu.import("resource://people/modules/ext/log4moz.js");
Cu.import("resource://people/modules/people.js");
Cu.import("resource://people/modules/import.js");
Cu.import("resource://oauthorizer/modules/oauth.js");
Cu.import("resource://oauthorizer/modules/oauthconsumer.js");

function OAuthBaseImporter() {
  this._log = Log4Moz.repository.getLogger("People.OAuthBaseImporter");
  this._log.debug("Initializing oauth importer backend");
};

OAuthBaseImporter.prototype = {
  __proto__: ImporterBackend.prototype,
  completionCallback: null,
  progressCallback: null,
  oauthHandler: null,
  authParams: null,
  consumerToken: null,
  consumerSecret: null,
  redirectURL: null,
  message: {
    action: null,
    method: "GET",
    parameters: {}
  },

  import: function OAuthBaseImporter_import(completionCallback, progressCallback) {
    this._log.debug("Importing "+this.name+" contacts into People store");
    this.completionCallback = completionCallback;
    this.progressCallback = progressCallback;

    let self = this;
    this.oauthHandler = OAuthConsumer.authorize(
                                    this.name,
                                    this.consumerToken,
                                    this.consumerSecret,
                                    this.redirectURL,
                                    function doImport(svc) { self.doImport(svc); },
                                    this.authParams,
                                    "contacts@labs.mozilla");
  },

  disconnect : function OAuthBaseImporter_disconect()
  {
    // XXX refresh causes a disconnect, it shouldn't, since that causes the
    // dialog to reappear
    OAuthConsumer.resetAccess(this.name,
                              this.consumerToken,
                              this.consumerSecret);
  },

  doImport: function(svc) {
    let self = this;
    OAuthConsumer.call(svc, this.message, function OAuthBaseImporterCallHandler(req) {
      self.handleResponse(req, svc);
    });
  },
  
  handleResponse: function OAuthBaseImporter_handleResponse(req) {
    throw new Error("NOT IMPLEMENTED");
  }
}

