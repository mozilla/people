const Cc = Components.classes;
const Ci = Components.interfaces;

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

function FormHistoryOverride() {
  
}

FormHistoryOverride.prototype = {
  // XPCOM registration
  classDescription: "Override",
  contractID:       "@mozilla.org/satchel/form-fill-controller;1",
  classID:          Components.ID("{106471bb-b86a-4659-9d37-dca54019f6e2}"),

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIFormFillController,
                                         Ci.nsIObserver,
                                         Ci.nsISupportsWeakReference]),

  attachToBrowser: function (docShell, popup) {
    dump("attachToBrowser called\n");
    originalImpls.mainFFImpl.attachToBrowser(docShell, popup);
  },
  
  detachFromBrowser: function (docShell) {
    originalImpls.mainFFImpl.detachFromBrowser(docShell);
  },
   
  markAsLoginManagerField: function (input) {
    originalImpls.mainFFImpl.markAsLoginManagerField(input);
  }
}

var originalImpls = {
  _mainFFImpl: null,
  get mainFFImpl() {
    if (!this._mainFFImpl)
      this._mainFFImpl = Components.classesByID[Components.ID('{895DB6C7-DBDF-40ea-9F64-B175033243DC}')]
                                    .getService(Ci.nsIFormFillController);
    return this._mainFFImpl;
  },
  
  _mainACImpl: null,
  get mainACImpl() {
    if (!this._mainACImpl)
      this._mainACImpl = Components.classesByID[Components.ID('{895DB6C7-DBDF-40ea-9F64-B175033243DC}')]
                                    .getService(Ci.nsIAutoCompleteSearch);

    return this._mainACImpl;
  }
}

function FormAutoCompleteOverride() {

}

FormAutoCompleteOverride.prototype = {
  // XPCOM registration
  classDescription: "Override FH AC",
  contractID:       "@mozilla.org/autocomplete/search;1?name=form-history",
  classID:          Components.ID("{9ed95942-f031-436c-8540-8d5e222c6fe2}"),

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIAutoCompleteSearch]),


  _isEmailSearch: function(param) {
    return false;
  },

  startSearch: function (searchString, searchParam, prevResult, listener) {
    dump("startSearch called\n");
    if (this._isEmailSearch(searchParam)) {
      dump("doing email search: " + searchString + "\n");
      var input = Cc["@mozilla.org/satchel/form-fill-controller;1"]
      var FAC = Components.classes["@mozilla.org/satchel/form-autocomplete;1"].getService(Ci.nsIFormAutoComplete);
      var result = FAC.autoCompleteSearch(searchParam, searchString, originalImpls.mainFFImpl.input, prevResult);
      listener.onSearchResult(this, result);
    }
    else
      originalImpls.mainACImpl.startSearch(searchString, searchParam, prevResult, listener);
  },
  
  stopSearch: function () {
    originalImpls.mainACImpl.stopSearch();
  },

}

var components = [FormHistoryOverride, FormAutoCompleteOverride];

function NSGetModule(compMgr, fileSpec)
  XPCOMUtils.generateModule(components);
