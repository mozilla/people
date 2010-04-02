const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

function _() {
  return; // comment out for verbose debugging
  let msg = Array.join(arguments, " ");
  dump(msg + "\n");
  Cu.reportError(msg);
}
_("?loaded");

__defineGetter__("FAC", function() {
  _("get FAC");
  delete this.FAC;
  return this.FAC = Components.classesByID["{c11c21b2-71c9-4f87-a0f8-5e13f50495fd}"].
    getService(Ci.nsIFormAutoComplete);
});
__defineGetter__("People", function() {
  delete this.People;
  Cu.import("resource://people/modules/people.js");
  return People;
});
function PeopleAutoComplete() {
  _("new PAC");
}
PeopleAutoComplete.prototype = {
  classDescription: "People AutoComplete",
  contractID: "@mozilla.org/satchel/form-autocomplete;1",
  classID: Components.ID("{545c79b1-1c45-4f5e-b6bb-98ce9e9fbd12}"),
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIFormAutoComplete]),

  checkPeople: function checkPeople(name, field) {
    // If we have an input field of type email, we definitely want it
    if (field != null && field.getAttribute("type") == "email")
      return true;

    // Grab attributes to check for people inputs
    let props = [name];
    if (field != null) {
      let attributes = ["class", "id", "rel"];
      attributes.forEach(function(attr) props.push(field.getAttribute(attr)));
    }

    // Check these properties for people-like values
    let peopleLike = /^(?:.*(?:e-?mail|recipients?).*|to)$/i;
    return props.some(function(prop) prop.search(peopleLike) != -1);
  },

  findPeople: function findPeople(query) {
    _("findPeople", Array.slice(arguments));

    let result = Cc["@mozilla.org/autocomplete/simple-result;1"].
      createInstance(Ci.nsIAutoCompleteSimpleResult);
    result.setSearchString(query);

    // Match the name and show the email for now..
    People.find({ displayName: query }).forEach(function(person) {
      // Might not have an email for some reason... ?
      try {
          _("findPeople", "Person " + person.getProperty("displayName"));

        let emails = person.getProperty("emails");
        let photos = person.getProperty("photos");
        let thumb;

        for each (let photo in photos)
        {
          if (photo.type == "thumbnail") {
            thumb = photo.value;
            break;
          }
        }

        let dupCheck = {};
        for each (let email in emails)
        {
          if (dupCheck[email.value]) continue;
          dupCheck[email.value] = 1;

          data = person.displayName + " <" + email.value + ">";
          result.appendMatch(email.value, data, thumb, "people");
        }
      }
      catch(ex) {
        _("findPeople error", ex);
      }
    });

    let resultCode = result.matchCount ? "RESULT_SUCCESS" : "RESULT_NOMATCH";
    result.setSearchResult(Ci.nsIAutoCompleteResult[resultCode]);
    return result;
  },

  autoCompleteSearch: function autoCompleteSearch(name, query, field, prev) {
    _("autocomplete search", Array.slice(arguments));

    // Do people searches for certain input fields
    if (this.checkPeople(name, field))
      return this.findPeople(query);

    // Use the base form autocomplete for non-people searches
    return FAC.autoCompleteSearch(name, query, field, prev);
  }
};

let components = [PeopleAutoComplete];
function NSGetModule(compMgr, fileSpec) XPCOMUtils.generateModule(components);
