let EXPORTED_SYMBOLS = [];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cm = Components.manager;
const Cu = Components.utils;
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://people/modules/people.js");

// nsIAutoCompleteSearch to put keyword results from the db into autocomplete
let showKeywords = let (T = {
  startSearch: function(searchString, searchParam, previous, listener) {
    // First word is the keyword and everything else is parameters
    let [, keyword, params] = searchString.match(/^\s*([^ ]*) ?(.*?)\s*$/);

    var peopleResults = People.find({displayName:keyword});
    var peopleResultsEmail = People.find({emails:keyword});

    // De-dupe:
    var finalResults = peopleResults;
    for each (var p in peopleResultsEmail) {
      var already = false;
      for each (var check in finalResults) {
        if (check.guid == p.guid) {already=true;break;}
      }
      if (!already) finalResults.push(p);
    }
    peopleResults = finalResults;

    // nsIAutoCompleteResult object to give the autocomplete controller
    let result = {
      get searchString() searchString,
      searchResult: Ci.nsIAutoCompleteResult.RESULT_SUCCESS,
      get matchCount() peopleResults.length,
      getValueAt: function(i) {
        var emails = peopleResults[i].getProperty("emails");
        if (emails && emails.length>0) return "person:" + emails[0].value;
        else return "person:" + peopleResults[i].displayName;
      },
      getCommentAt: function(i) {
        return peopleResults[i].displayName;
      },
      getImageAt: function(i) {
        var photos = peopleResults[i].getProperty("photos");
        if (photos && photos.length>0) return photos[0].value;
        else return null;
      },
      getStyleAt: function() "people",
      removeValueAt: function() {},
      QueryInterface: XPCOMUtils.generateQI([Ci.nsIAutoCompleteResult])
    };

    // Inform the listener of the result
    let done = function() listener.onSearchResult(T, result);

    // If we got a search engine, inform the listener right away
    if (true)
      done();
    // No matches, so wait a little to prevent other searches from stopping
    else {
      T.stopSearch();
      result.searchResult = Ci.nsIAutoCompleteResult.RESULT_NOMATCH;
      T.timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
      T.timer.initWithCallback({ notify: done }, 500, T.timer.TYPE_ONE_SHOT);
    }
  },

  // Cancel the nomatch timer if it hasn't triggered yet
  stopSearch: function() {
    if (T.timer == null)
      return;
    T.timer.cancel();
    T.timer = null;
  },

  createInstance: function(outer, iid) showKeywords.QueryInterface(iid),
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIFactory, Ci.nsIAutoCompleteSearch])
}) T;

// Register the keywords autocomplete search engine
Cm.QueryInterface(Ci.nsIComponentRegistrar).registerFactory(
  Cc["@mozilla.org/uuid-generator;1"].getService(Ci.nsIUUIDGenerator).
  generateUUID(), "People AutoCompleteSearch",
  "@mozilla.org/autocomplete/search;1?name=people", showKeywords);
