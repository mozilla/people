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
 *  Jono DiCarlo <jdicarlo@mozilla.com>
 *  Dan Mills <thunder@mozilla.com>
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


let EXPORTED_SYMBOLS = ["PeopleImporter"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://people/modules/utils.js");
Cu.import("resource://people/modules/ext/log4moz.js");
Cu.import("resource://people/modules/ext/md5.js");
Cu.import("resource://people/modules/people.js");

function PeopleImporterSvc() {
  this._backends = {};
  this._liveBackends = {};
  this._discoverers = {};
  this._liveDiscoverers = {};
  this._log = Log4Moz.repository.getLogger("People.Importer");
  this._log.debug("Importer service initialized");
}
PeopleImporterSvc.prototype = {
  getBackend: function ImporterSvc_getBackend(name) {
    if (!this._liveBackends[name])
      this._liveBackends[name] = new this._backends[name]();
    return this._liveBackends[name];
  },
  registerBackend: function ImporterSvc_register(backend) {
    this._log.debug("Registering importer backend for " + backend.prototype.name);
    this._backends[backend.prototype.name] = backend;
  },
	getBackends: function ImporterSvc_getBackends() {
		return this._backends;
	},
  
  getDiscoverer: function ImporterSvc_getDiscoverer(name) {
    if (!this._liveDiscoverers[name])
      this._liveDiscoverers[name] = new this._discoverers[name]();
    return this._liveDiscoverers[name];
  },
  registerDiscoverer: function ImporterSvc_registerDiscoverer(disco) {
    this._log.debug("Registering discoverer for " + disco.prototype.name);
    this._discoverers[disco.prototype.name] = disco;
  },
	getDiscoverers: function ImporterSvc_getDiscoverers() {
		return this._discoverers;
	}
};
let PeopleImporter = new PeopleImporterSvc();

function ImporterBackend() {
  this._log = Log4Moz.repository.getLogger("People.ImporterBackend");
  this._log.debug("Initializing importer backend for " + this.displayName);
}
ImporterBackend.prototype = {
  get name() "example",
  get displayName() "Example Contacts",
  import: function Backend_import() {
    this._log.debug("ImporterBackend.import() invoked, base class does nothing");
  }
};

function DiscovererBackend() {
  this._log = Log4Moz.repository.getLogger("People.DiscovererBackend");
  this._log.debug("Initializing discovery backend for " + this.displayName);
}
DiscovererBackend.prototype = {
  get name() "example",
  get displayName() "Example Discoverer",
  discover: function Discoverer_discover(person) {
    this._log.debug("DiscovererBackend.import() invoked, base class does nothing");
  }
};

//-------------------------------------------------------
// Implementations Follow
// We should move these into another file or files.
//-------------------------------------------------------

function GmailImporter() {
  this._log = Log4Moz.repository.getLogger("People.GmailImporter");
  this._log.debug("Initializing importer backend for " + this.displayName);
}
GmailImporter.prototype = {
  __proto__: ImporterBackend.prototype,
  get name() "gmail",
  get displayName() "Gmail Contacts",
	get iconURL() "chrome://people/content/images/gmail.png",

  beginTest: function t0(l) { return /^begin:vcard$/i.test(l); },
  tests: [
    function t1(l) { return /^end:vcard$/i.test(l); },
    function t2(l) { return /^version:/i.test(l); },
    function t3(l, o) {
      if (/^fn:(.*)$/i.test(l)) {
        o.displayName = RegExp.$1;
        return true;
      }
      return false;
    },
    function t4(l, o) {
      if (/^n:([^;]*);([^;]*);([^;]*);([^;]*);(.*)$/i.test(l)) {

        let family = RegExp.$1, given = RegExp.$2, additional = RegExp.$3,
            honorific = RegExp.$4, honorificSuf = RegExp.$5;

        if (!o.displayName) {
          o.displayName = given;
          if (additional)
            o.displayName += " " + additional;
          if (family)
            o.displayName += " " + family;
          if (honorific)
            o.displayName = honorific + " " + disp;
          if (honorificSuf)
            o.displayName += ", " + honorificSuf;
        }

        o.name = { givenName: given };
        if (additional)
          o.name.middleName = additional;
        if (family)
          o.name.familyName = family;
        if (honorific)
          o.name.honorificPrefix = honorific;
        if (honorificSuf)
          o.name.honorificSuffix = honorificSuf;

        return true;
      }
      return false;
    },
    function t5(l, o) {
      if (/^email;type=([^;]+);type=([^:]+):(.*)$/i.test(l) ||
          /^email;type=([^;]+):(.*)$/i.test(l)) {

        let type = RegExp.$1, value = RegExp.$2;
        if (RegExp.$3) {
          type = RegExp.$2;
          value = RegExp.$3;
        }

        if (!o.emails)
          o.emails = [];
        o.emails.push({value: value, type: type.toLowerCase()});

        return true;
      }
      return false;
    },
    function t6(l, o) {
      if (/^tel;type=([^:]+):(.*)$/i.test(l)) {

        let type = RegExp.$1.toLowerCase(),
            value = RegExp.$2;
        if ("cell" == type)
          type = "mobile";

        if (!o.phoneNumbers)
          o.phoneNumbers = [];
        o.phoneNumbers.push({value: value, type: type});

        return true;
      }
      return false;
    },
    // fixme: loses work/home type information
    function t7(l, o) {
      if (/^x-(aim|msn|yahoo);type=([^:]+):(.*)$/i.test(l)) {
        if (!o.ims)
          o.ims = [];
        o.ims.push({value: RegExp.$2, type: RegExp.$1.toLowerCase()});
        return true;
      }
      return false;
    },
    function t7(l, o) {
      if (/^bday:(.*)$/i.test(l)) {
        o.birthday = RegExp.$1;
        return true;
      }
      return false;
    },
    function t8(l, o) {
      if (/^org:(.*)/i.test(l)) {

        if (!o.organizations)
          o.organizations = [{}];
        o.organizations[0].name = RegExp.$1;

        return true;
      }
      return false;
    },
    function t9(l, o) {
      if (/^title:(.*)/i.test(l)) {

        if (!o.organizations)
          o.organizations = [{}];
        o.organizations[0].title = RegExp.$1;

        return true;
      }
      return false;
    },
    // FIXME: how to map these?
    function t10(l, o) {
      if (/adr;type=([^:;]*):([^;]*);([^;]*);([^;]*);([^;]*);([^;]*);([^;]*);([^;]*)/i.test(l)) {
        let type = RegExp.$1,
            pobox = RegExp.$2, extendedAddr = RegExp.$3, street = RegExp.$4,
            locality = RegExp.$5, region = RegExp.$6, code = RegExp.$7,
            country = RegExp.$8;
        if (!o.addresses)
          o.addresses = [];
        o.addresses.push({type: type, formatted: extendedAddr,
                          streetAddress: street,
                          locality: locality, region: region,
                          postalCode: code, country: country});
        return true;
      }
      return false;
    },
    function t11(l, o) {
      if (/url;type=([^:]*):(.*)$/i.test(l)) {
        if (!o.urls)
          o.urls = [];
        o.urls.push({type: RegExp.$1, value: RegExp.$2});
        return true;
      }
      return false;
    }
  ],

  import: function GmailImporter_import(completionCallback, progressFunction) {
    this._log.debug("Importing Gmail contacts into People store");

    let req = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
      .createInstance(Components.interfaces.nsIXMLHttpRequest);
    req.open('GET', 'https://mail.google.com/mail/contacts/data/export?' +
             'exportType=GROUP&groupToExport=^Mine&out=VCARD', false);
    req.send(null);

    if (req.status != 200) {
      this._log.warn("Could not download contacts from Google " +
                     "(status " + req.status + ")");
      throw {error:"Unable to get contacts from Google", 
						 message:"Could not download contacts from Google: please make sure you are <a href='https://mail.google.com'>logged in to Gmail</a>"};
    }

    this._log.debug("Contact list downloaded, parsing");
    progressFunction(0.25);

    let people = [], cur = {}, fencepost = true;
    for each (let line in req.responseText.split('\r\n')) {
      progressFunction(0.50);
      if (this.beginTest(line)) {
        if (fencepost) {
          fencepost = !fencepost;
          continue;
        } else {
          people.push(new PoCoPerson(cur).obj);
          cur = {};
          continue;
        }
      }
      let parsed = false;
      for each (let t in this.tests) {
        if (t(line, cur)) {
          parsed = true;
          continue;
        }
      }
      if (!parsed)
        this._log.debug("Could not parse line: " + line);
    }

    this._log.info("Adding " + people.length + " Gmail contacts to People store");
    People.add(people, this, progressFunction);
    progressFunction(0.75);
		completionCallback(null);
  }
};

function NativeAddressBookImporter() {
  this._log = Log4Moz.repository.getLogger("People.NativeAddressBookImporter");
  this._log.debug("Initializing importer backend for " + this.displayName);
};

NativeAddressBookImporter.prototype = {
  __proto__: ImporterBackend.prototype,
  get name() "native",
  get displayName() "Native Address Book (on your computer)",
	get iconURL() "chrome://people/content/images/macaddrbook.png",


  import: function NativeAddressBookImporter_import(completionCallback, progressFunction) {
    this._log.debug("Importing Native address book contacts into People store");

		try
		{
			let nativeAddrBook = Components.classes["@labs.mozilla.com/NativeAddressBook;1"].getService(Components.interfaces["INativeAddressBook"]);
			let allCards = nativeAddrBook.getCards({});
			
			let people = [];
			for (i=0;i<allCards.length;i++) {
        progressFunction(Math.floor( i * 100.0 / allCards.length ));
        
				person = {}
				let fname = allCards[i].getProperty("firstName");
				let lname = allCards[i].getProperty("lastName");
				// let email = allCards[i].getProperty("email");
				
				if (!fname && !lname) continue; // skip anonymous cards for now
				
				if (fname && lname) {
					person.displayName = fname + " " + lname;
				} else if (lname) {
					person.displayName = lname;			
				} else if (fname) {
					person.displayName = fname;
				}
				person.name = {}
				person.name.givenName = fname;
				person.name.familyName = lname;

				person.emails = []
				let emailLabels = allCards[i].getPropertyListLabels("email", []);
				let emailValues = allCards[i].getPropertyListValues("email", []);
				for (let j=0;j<emailLabels.length;j++) {
					person.emails.push({value:emailValues[j], type:emailLabels[j]});
				}
				person.phoneNumbers = []
				let phoneLabels = allCards[i].getPropertyListLabels("phone", []);
				let phoneValues = allCards[i].getPropertyListValues("phone", []);
				for (let j=0;j<phoneLabels.length;j++) {
					person.phoneNumbers.push({value:phoneValues[j], type:phoneLabels[j]});
				}

	/*			person.links = []
				let urlLabels = allCards[i].getPropertyListLabels("urls", []);
				let urlValues = allCards[i].getPropertyListValues("urls", []);
				for (let j=0;j<urlLabels.length;j++) {
					person.links.push({value:urlValues[j], type:urlLabels[j]});
				}
	*/

				people.push(new PoCoPerson(person).obj);
			}
			this._log.info("Adding " + people.length + " Native address book contacts to People store");
      People.add(people, this, progressFunction);
			completionCallback(null);
		} catch (e) {
      if ((""+e).indexOf("NativeAddressBook;1'] is undefined") >= 0) {
        completionCallback({error:"Access Error",message:"Sorry, native address book support isn't done for this platform yet."});
      } else {
        this._log.info("Unable to access native address book importer: " + e);
        completionCallback({error:"Access Error",message:"Unable to access native address book importer: " + e});
      }
		}
	}
};


function TwitterAddressBookImporter() {
  this._log = Log4Moz.repository.getLogger("People.TwitterAddressBookImporter");
  this._log.debug("Initializing importer backend for " + this.displayName);
};

TwitterAddressBookImporter.prototype = {
  __proto__: ImporterBackend.prototype,
  get name() "twitter",
  get displayName() "Twitter Address Book",
	get iconURL() "chrome://people/content/images/twitter.png",

  import: function NativeAddressBookImporter_import(completionCallback, progressFunction) {
    this._log.debug("Importing Twitter address book contacts into People store");

		// Look up saved twitter password; if we don't have one, log and bail out
		login = Cc["@mozilla.org/login-manager;1"].getService(Ci.nsILoginManager);
		let potentialURLs = ["https://twitter.com", "https://www.twitter.com", "http://twitter.com", "http://www.twitter.com"];

		let logins = null;
		for each (var u in potentialURLs) {
			logins = login.findLogins({}, u, "https://twitter.com", null);
      this._log.error("Checking for saved password at " + u +": found " + logins + " (length " + logins.length + ")");
			if (logins && logins.length > 0) break;
		}
		if (!logins || logins.length == 0) {
			this._log.error("No saved twitter.com login information: can't import Twitter address book");
			throw {error:"Unable to get contacts from Twitter", 
						 message:"Could not download contacts from Twitter: please visit <a href='https://twitter.com'>Twitter.com</a> and save your password."};
		}

		// Okay, if there's more than one... which username should we use?
		let aLogin = logins[0];
		if (logins.length>1) {
			this._log.info("More than one saved twitter.com login!  Using the first one.");
		}

    let twitLoad = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
      .createInstance(Components.interfaces.nsIXMLHttpRequest);
		twitLoad.open('GET', "http://twitter.com/statuses/friends.json", true, aLogin.username, aLogin.password);

		let that = this;
		twitLoad.onreadystatechange = function (aEvt) {  
			if (twitLoad.readyState == 4) {  
				that._log.info("Twitter readystate change " + twitLoad.status + "\n");

				if (twitLoad.status == 401) {
					that._log.error("Twitter login failed.");
					completionCallback({error:"login failed", message:"Unable to log into Twitter with saved username/password"});

				} else if (twitLoad.status != 200) {
					that._log.error("Error " + twitLoad.status + " while accessing Twitter.");
					completionCallback({error:"login failed", message:"Unable to log into Twitter with saved username/password (error " + twitLoad.status + ")"});
				} else {
					let result = JSON.parse(twitLoad.responseText);
					that._log.info("Twitter discovery got " + result.length + " persons");

					let people = [];
					for (var i=0; i< result.length;i++) 
					{
            progressFunction(Math.floor( i * 100.0 / result.length ));
            
						var p = result[i];
						if (typeof p.screen_name != 'undefined')
						{
							that._log.info(" Constructing person for " + p.screen_name + "; display " + p.name);
							try {
								person = {}
								person.accounts = [{type:"twitter", value:p.screen_name}]

								if (p.name) {
									person.displayName = p.name;
									
									// For now, let's assume European-style givenName familyName+
									let split = p.name.split(" ");
									person.name = {};
									person.name.givenName = split[0];
									person.name.familyName = split.splice(1, 1).join(" ");
								}
								if (p.profile_image_url) 
									person.photos = [{type:"thumbnail", value:p.profile_image_url}];
								if (p.location) 
									person.location = [{type:"Location", value:p.location}] //???
								if (p.url) 
									person.links = [{type:"URL", value:p.url}]
								
								people.push(new PoCoPerson(person).obj);
								
							} catch (e) {
								that._log.error("Twitter import error " + e + "\n");
							}
						}
					}
					that._log.info("Adding " + people.length + " Twitter address book contacts to People store");
					People.add(people, that, progressFunction);
					completionCallback(null);
				}
			}
		}
		twitLoad.send(null);
	}
}



function GravatarImageImporter() {
  this._log = Log4Moz.repository.getLogger("People.GravatarImageImporter");
  this._log.debug("Initializing importer backend for " + this.displayName);
};

GravatarImageImporter.prototype = {
  __proto__: ImporterBackend.prototype,
  get name() "Gravatar",
  get displayName() "Gravatar Avatar Images",
	get iconURL() "chrome://people/content/images/gravatar.png",

  import: function NativeAddressBookImporter_import(completionCallback, progressFunction) {
    this._log.debug("Scanning current People store for Gravatar icons.");

    let emailMap = People.getEmailToGUIDLookup();
    if (emailMap.__count__ == 0) {
      progressFunction("You have no contacts with email addresses.  Import some first!");
      return;
    }
    
    let count = 0;
    let people = [];
    for (let email in emailMap)
    {
      progressFunction("Scanning -- " + (Math.floor(count * 100.0 / emailMap.__count__)) + "% complete");

      let md5 = hex_md5(email);
      let gravLoad = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);
      gravLoad.open('GET', "http://www.gravatar.com/avatar/" + md5 + "?d=404&s=1", false);
      gravLoad.send(null);
      if (gravLoad.status == 200) {
        person = {}
        person.photos = [{type:"thumbnail", value:"http://www.gravatar.com/avatar/" + md5}];
        var aPerson = new PoCoPerson(person);
        aPerson.obj.guid = emailMap[email]; // obviously need to fix this API.
        people.push(aPerson.obj);
        this._log.info("Checked " + email + ": found a Gravatar");
      } else {
        this._log.info("Checked " + email + ": no Gravatar");
      }
      count = count + 1;
    }
    this._log.info("Found " + people.length + " Gravatar icons");
    progressFunction("Complete.  Found " + people.length + " icons.");
    People.add(people, this, progressFunction);
    completionCallback(null);
	}
}

function FlickrAccountDiscoverer() {
  this._log = Log4Moz.repository.getLogger("People.FlickrAccountDiscoverer");
  this._log.debug("Initializing importer backend for " + this.displayName);
};

FlickrAccountDiscoverer.prototype = {
  __proto__: ImporterBackend.prototype,
  get name() "Flickr",
  get displayName() "Flickr Account",
	get iconURL() "",

  discover: function FlickrAccountDiscoverer_person(person, completionCallback, progressFunction) {
    let flickrKey = "c0727ed63fc7eef37d8b46c57eec4b2e";
    
    for (let email in person.emails) {
      progressFunction("Checking address with Flickr.");
      let load = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);
      load.open('GET', "http://api.flickr.com/services/rest/?method=flickr.people.findByEmail&api_key=" + flickrKey + "&find_email=" + encodeURIComponent(email.value), false);
      load.send(null);
      if (load.status == 200) {
        let dom = load.responseXML;
        
        /* success is <rsp stat="ok"><user id="76283545@N00" nsid="76283545@N00"><username>foo</username></user></rsp>
        failure is <rsp stat="fail"><err code="1" msg="User not found" /></rsp> */
        if (dom.documentElement.attributes.stat.value == "ok")
        {
          let user = dom.documentElement.getElementsByTagName("user")[0];
          let nsID = user.attributes.nsid.value;

          progressFunction("Resolving details with Flickr.");
          load.open('GET', "http://api.flickr.com/services/rest/?method=flickr.people.getInfo&api_key=" + flickrKey + "&user_id=" + encodeURIComponent(nsID), false);
          load.send(null);
          let detail = load.responseXML;
          if (detail.documentElement.attributes.stat.value == "ok") 
          {
            let person = dom.documentElement.getElementsByTagName("person")[0];
            let username = user.getElementsByTagName("username")[0];
            let location = user.getElementsByTagName("location")[0];
            let photosurl = user.getElementsByTagName("photosurl")[0];
            let realname = user.getElementsByTagName("realname")[0];
            // let profileurl = user.getElementsByTagName("profileurl")[0];

            person = {};
            if (username) person.accounts = [{type:"Flickr", value:username.textContent}]
            if (location) person.location = [{type:"Location", value:location.textContent}]
            if (photosurl) person.links = [{type:"Flickr", value:photosurl.textContent}]
            if (realname) {
              var n = realname.textContent;
              person.displayName = n;
									
              // For now, let's assume European-style givenName familyName+
              let split = n.split(" ");
              person.name = {};
              person.name.givenName = split[0];
              person.name.familyName = split.splice(1, 1).join(" ");
            }
          
            var aPerson = new PoCoPerson(person);
            aPerson.obj.guid = person.guid;
            People.add(people, this, progressFunction);
          }
        }
      }
    }
    completionCallback(null);
  }
}


PeopleImporter.registerBackend(NativeAddressBookImporter);
PeopleImporter.registerBackend(GmailImporter);
PeopleImporter.registerBackend(TwitterAddressBookImporter);
PeopleImporter.registerBackend(GravatarImageImporter);

PeopleImporter.registerDiscoverer(FlickrAccountDiscoverer);



// See https://wiki.mozilla.org/Labs/Sprints/People for schema
function Person() {
  this._init();
}
Person.prototype = {
  get obj() this._obj,
  get json() JSON.stringify(this._obj),
  _init: function Person__init() {
    this._obj = {
      schema: "http://labs.mozilla.com/schemas/people/1",
      documents: {},
      documentSchemas: {}
    };
  }
};

function PoCoPerson(contact) {
  this._init();
  if (contact)
    this.setPoCo(contact);
}
PoCoPerson.prototype = {
  __proto__: Person.prototype,
	
  setPoCo: function setPoCo(contact) {
    this._obj.documents.default = contact;
    this._obj.documentSchemas = "http://portablecontacts.net/draft-spec.html";

    let doc = this._obj.documents.default;

    if (doc.displayName)
      this._obj.displayName = doc.displayName;

    if (doc.name) {
      if (doc.name.givenName)
        this._obj.givenName = doc.name.givenName;
      if (doc.name.familyName)
        this._obj.familyName = doc.name.familyName;
    }

    for each (let e in doc.emails) {
      if (!this._obj.emails)
        this._obj.emails = [];
      this._obj.emails.push({value: e.value, type: e.type});
    }
  }
	
};

//function getYahooContacts( callback ){
//  var url = "http://us.mg1.mail.yahoo.com/yab";
//  //TODO: I have no idea what these params mean
//  var params = {
//    v: "XM",
//    prog: "ymdc",
//    tags: "short",
//    attrs: "1",
//    xf: "sf,mf"
//  };
//
//  var asyncRequest = jQuery.get(url, params, function(data) {
//
//    var contacts = [];
//    for each( var line in jQuery(data).find("ct") ){
//      var name = jQuery(line).attr("yi");
//      //accept it as as long as it is not undefined
//      if(name){
//        var contact = {};
//        contact["name"] = name;
//        //TODO: what about yahoo.co.uk or ymail?
//        contact["email"] = name + "@yahoo.com";
//        contacts.push(contact);
//      }
//    }
//
//    callback(contacts);
//  }, "text");
//
//  return asyncRequest;
//}




