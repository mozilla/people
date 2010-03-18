const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

function _() {
/* uncomment for verbose logging.
  let msg = Array.join(arguments, " ");
  dump(msg + "\n");
  Cu.reportError(msg);
*/
}
_("?loaded");

__defineGetter__("FACS", function() {
  _("get FACS");
  delete this.FACS;
  return this.FACS = Components.classesByID["{895db6c7-dbdf-40ea-9f64-b175033243dc}"].
    getService(Ci.nsIAutoCompleteSearch);
});
__defineGetter__("People", function() {
  delete this.People;
  Cu.import("resource://people/modules/people.js");
  return People;
});
function PeopleAutoCompleteSearch() {
  _("new PACS");
}
PeopleAutoCompleteSearch.prototype = {
  classDescription: "People AutoComplete Search",
  contractID:       "@mozilla.org/autocomplete/search;1?name=form-history",
  classID:          Components.ID("{9ed95942-f031-436c-8540-8d5e222c6fe2}"),
  QueryInterface: XPCOMUtils.generateQI([
    Ci.nsIAutoCompleteSearch,
    Ci.nsIAutoCompleteSimpleResultListener
  ]),

  checkPeople: function checkPeople(param) {
    return param.search(/e-?mail/) != -1 || param.search(/recipients?/) != -1 || param.search(/^to$/) != -1;
  },

  findPeople: function findPeople(string, listener) {
    _("findPeople", Array.slice(arguments));
	
    let result = Cc["@mozilla.org/autocomplete/simple-result;1"].
      createInstance(Ci.nsIAutoCompleteSimpleResult);
    result.setSearchString(string);
    result.setListener(this);

    // Match the name and show the email for now..
    People.find({ displayName: string }).forEach(function(person) {
      // Might not have an email for some reason... ?
      try {
        let email = person.documents.default.emails[0].value;
        let data = JSON.stringify(person);
        data = person.displayName + " <" + email + ">";
				
				let img = null;
				if (person.documents.default.photos) {
					if (person.documents.default.photos[0] && person.documents.default.photos[0].value)	{
						img = person.documents.default.photos[0].value.replace(/\\:/g, ":");
					}
				}
				/*email = null;
				if (person.document.default.organizations) {
					if (person.documents.default.organizations[0] && person.documents.default.organizations[0].title) {
						email = person.documents.default.organizations[0].title;
					}
				}*/
        result.appendMatch(email, data, img, "people");
      }
      catch(ex) {
		    _("findPeople error", ex);
			}
    });

    let resultCode = result.matchCount ? "RESULT_SUCCESS" : "RESULT_NOMATCH";
    result.setSearchResult(Ci.nsIAutoCompleteResult[resultCode]);

    listener.onSearchResult(this, result);
  },

  startSearch: function(string, param, prev, listener) {
    _("start search", Array.slice(arguments));

    // Do people searches for certain queries
    if (this.checkPeople(param))
      return this.findPeople(string, listener);

    // Use the base form search for non-people searches
    let PACS = this;
    FACS.startSearch(string, param, prev, {
      onSearchResult: function(search, result) {
        _("on search result");
        listener.onSearchResult(PACS, result);
      }
    });
  },

  stopSearch: function() {
    _("stop search", Array.slice(arguments));
    FACS.stopSearch();
  }
};

let components = [PeopleAutoCompleteSearch];
function NSGetModule(compMgr, fileSpec) XPCOMUtils.generateModule(components);