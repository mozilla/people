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
_("?loaded CONTACTS");

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
  contractID: "@labs.mozilla.com/contacts/form-autocomplete;1",
  classID: Components.ID("{7bc6728f-9ecf-de44-9fc9-8ce679f7529d}"),
  _xpcom_categories: [{category: "form-autocomplete-handler",
                       entry: "contacts-addon"}],
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIFormAutoComplete]),

  // Specify the html5 types that we want and some values to guess
  peopleTypes: {
    email: /^(?:.*(?:e-?mail|recipients?).*|(send_)?to(_b?cc)?)$/i,
    tel: /^(?:tel(?:ephone)?|.*phone.*)$/i,
  },

  checkPeopleType: function checkPeopleType(name, field) {
    // If we have an input field with the desired html5 type, take it!
    if (field != null) {
      let type = field.getAttribute("type");
      if (this.peopleTypes[type] != null)
        return type;
    }

    // Grab attributes to check for people inputs
    let props = [name];
    if (field != null) {
      let attributes = ["class", "id", "rel"];
      attributes.forEach(function(attr) {
        if (field.hasAttribute(attr))
          props.push(field.getAttribute(attr));
      });
    }

    // Check the gathered properties for people-like values
    for (let [type, regex] in Iterator(this.peopleTypes)) {
      if (props.some(function(prop) prop.search(regex) != -1))
        return type;
    }
  },

  findPeople: function findPeople(query, type) {
    _("findPeople", Array.slice(arguments));

    let result = Cc["@mozilla.org/autocomplete/simple-result;1"].
      createInstance(Ci.nsIAutoCompleteSimpleResult);
    result.setSearchString(query);

    // Match the name and show the email for now..
    People.find({ displayName: query }).forEach(function(person) {
      // Might not have an email for some reason... ?
      try {
          _("findPeople", "Person " + person.getProperty("displayName"));

        let photos = person.getProperty("photos");
        let thumb;

        for each (let photo in photos)
        {
          if (photo.type == "thumbnail") {
            thumb = photo.value;
            break;
          }
        }

        let suggestions;
        switch (type) {
          case "email":
            suggestions = person.getProperty("emails");
            break;
          case "tel":
            suggestions = person.getProperty("phoneNumbers");
            break;
          default:
            _("unknown type!", type);
            return;
        }

        let dupCheck = {};
        for each (let suggestion in suggestions)
        {
          if (dupCheck[suggestion.value]) continue;
          dupCheck[suggestion.value] = 1;

          data = person.displayName + " <" + suggestion.value + ">";
          _("appending match for " + person.displayName);
          result.appendMatch(suggestion.value, data, thumb, "people");
        }
      }
      catch(ex) {
        _("findPeople error", ex);
      }
    });

    let resultCode = result.matchCount ? "RESULT_SUCCESS" : "RESULT_NOMATCH";
    _("returning autocomplete " +resultCode+ " result with " + result.matchCount + " items");
    result.setSearchResult(Ci.nsIAutoCompleteResult[resultCode]);
    return result;
  },

  autoCompleteSearch: function autoCompleteSearch(name, query, field, prev) {
    _("autocomplete search", Array.slice(arguments));

    // Do people searches for certain input fields

    let type = this.checkPeopleType(name, field);
    if (type != null)
      return this.findPeople(query, type);

    return null;
  }
};

let components = [PeopleAutoComplete];
if (XPCOMUtils.generateNSGetFactory)
    var NSGetFactory = XPCOMUtils.generateNSGetFactory(components);
else
    var NSGetModule = XPCOMUtils.generateNSGetModule(components);



