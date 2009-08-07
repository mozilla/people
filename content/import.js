Components.utils.import("resource://people/modules/people.js");

/* People object
{
  // guid identifies this person, schema describes the wrapper object
  guid: "af24d-fe488-ab748-b947f",
  schema: "http://mozilla.com/schemas/people/1",

  // we pull out some fields for convenience.
  // we only index fields we pull out.
  firstname: "foo"
  lastname: "bar"

  documents: [
    {
      moz_schema: "http://portablecontacts.net/draft-spec.html",
      firstname: "foo",
      lastname: "bar",
      emails: [
        {value: "foo@gmail.com"},
        {value: "foo@yahoo.com"},
        {value: "bar@yahoo.com"}
      ]
    }
  ]
}
*/

function makePersonObject(name, email) {
  var firstname, lastname;
  if (name) {
    if (name.indexOf(" ") > -1) {
      var nameParts = name.split(" ");
      firstname = nameParts[0];
      lastname = nameParts[nameParts.length -1];
    } else {
      firstname = name; // entirely arbitrary assumption
      lastname = "";
    }
  } else {
    firstname = "";
    lastname = "";
  }

  return {
    schema: "http://mozilla.com/schemas/people/1",
    firstname: firstname,
    lastname: lastname,
    documents: [
      {
        moz_schema: "http://portablecontacts.net/draft-spec.html",
        firstname: firstname,
        lastname: lastname,
        emails: [
          {value: email}
        ]
      }
    ]
  };
}


function getYahooContacts( callback ){
  var url = "http://us.mg1.mail.yahoo.com/yab";
  //TODO: I have no idea what these params mean
  var params = {
    v: "XM",
    prog: "ymdc",
    tags: "short",
    attrs: "1",
    xf: "sf,mf"
  };

  var asyncRequest = jQuery.get(url, params, function(data) {

    var contacts = [];
    for each( var line in jQuery(data).find("ct") ){
      var name = jQuery(line).attr("yi");
      //accept it as as long as it is not undefined
      if(name){
        var contact = {};
        contact["name"] = name;
        //TODO: what about yahoo.co.uk or ymail?
        contact["email"] = name + "@yahoo.com";
        contacts.push(contact);
      }
    }

    callback(contacts);
  }, "text");

  return asyncRequest;
}

function getGmailContacts(callback) {
  var asyncRequest = jQuery.get(
    "https://mail.google.com/mail/contacts/data/export",
    {exportType: "ALL", out: "VCARD"},
    function(data) {
      var contacts = [], name = "";
      for each(var line in data.replace(/\r\n /g, '').split(/\r\n/)) {
        if(/^(FN|EMAIL).*?:(.*)/.test(line)){
          var {$1: key, $2: val} = RegExp;
          if(key === "FN")
            name = val;
          else
            contacts.push({name: name, email: val});
        }
      }
      callback(contacts);
    },
    "text");
  return asyncRequest;
}

function gmailAutoLogin() {
  // TODO
  // Use password manager to get gmail password, if available
}


function yahooAutoLogin() {
  // TODO
  // Use password manager to get yahoo password, if available
}

function debugImportList(contacts) {
  var span = document.getElementById("debug");
  var list = "";
  for each( var contact in contacts) {
    list += contact.name + ": " + contact.email + ", ";
  }

  span.innerHTML = list;
}

function storePeople(contacts) {
  var span = document.getElementById("debug");
  for each( var contact in contacts) {
    People.add(makePersonObject(contact.name, contact.email));
    span.innerHTML = "Importing " + contact.name + "...<br/>";
  }
}

function doGmailImport() {
  getGmailContacts(storePeople);
  var span = document.getElementById("debug");
  span.innerHTML = "Imported your GMail contacts.";
}

function doYahooImport() {
  getYahooContacts(debugImportList);
}