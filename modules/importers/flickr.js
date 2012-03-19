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
 *  Michael Hanson <mhanson@mozilla.com>
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

let EXPORTED_SYMBOLS = [];


const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://people/modules/utils.js");
Cu.import("resource://people/modules/ext/log4moz.js");
Cu.import("resource://people/modules/ext/md5.js");
Cu.import("resource://people/modules/people.js");
Cu.import("resource://people/modules/import.js");
let IO_SERVICE = Cc["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);

let flickrKey = "c0727ed63fc7eef37d8b46c57eec4b2e";
    

function FlickrAccountDiscoverer() {
  this._log = Log4Moz.repository.getLogger("People.FlickrAccountDiscoverer");
  this._log.debug("Initializing importer backend for " + this.displayName);
};

FlickrAccountDiscoverer.prototype = {
  __proto__: DiscovererBackend.prototype,
  get name() "Flickr",
  get displayName() "Flickr Account",
  get iconURL() "",
  get description() "Searches Flickr for a public profile that belongs to each of the e-mail addresses associated with a contact.",

  discover: function FlickrAccountDiscoverer_person(forPerson, completionCallback, progressFunction) {

    for each (let email in forPerson.getProperty("emails")) {
      let discoveryToken = "Flickr:" + email.value;
      try {
        progressFunction({initiate:discoveryToken, msg:"Checking " + email.value + " at Flickr."});
        this._log.debug("Checking address " + email.value + " with Flickr.");
        let load = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);
        load.open('GET', "http://api.flickr.com/services/rest/?method=flickr.people.findByEmail&api_key=" + flickrKey + "&find_email=" + encodeURIComponent(email.value), true);

        load.onreadystatechange = function (aEvt) {
          let myDiscoveryToken = discoveryToken;
          let newPerson = {"_refreshDate":new Date().getTime()}; 
          if (load.readyState == 4) {
            if (load.status == 200) {
              let dom = load.responseXML;
              
              /* success is <rsp stat="ok"><user id="76283545@N00" nsid="76283545@N00"><username>foo</username></user></rsp>
              failure is <rsp stat="fail"><err code="1" msg="User not found" /></rsp> */
              if (dom.documentElement.attributes.stat.value == "ok")
              {
                let user = dom.documentElement.getElementsByTagName("user")[0];
                let nsID = user.attributes.nsid.value;
                getFlickrUserDetails(nsID, newPerson, function() {
                  completionCallback(newPerson, myDiscoveryToken);
                });
              } else {
                completionCallback(newPerson, myDiscoveryToken);
              }
            } else {
              this._log.warn("Address check with flickr returned status code " + load.status + "\n" + load.responseText);
            }
          }
        }
        load.send(null);
      } catch (e) {
        if (e != "DuplicatedDiscovery") {
          this._log.info("Flickr error: " + e);
        }
      }
    }
    
    for each (let url in forPerson.getProperty("urls")) {
      try {
        let parsedURI = IO_SERVICE.newURI(url.value, null, null);
        if (parsedURI.host == "flickr.com" || parsedURI.host == "www.flickr.com")
        {
          let id = getFlickrUsernameFromURL(url.value);
          let discoveryToken = "Flickr:username:" + id;
          try {
            progressFunction({initiate:discoveryToken, msg:"Checking " + id + " at Flickr."});
            this._log.debug("Checking username " + id + " with Flickr.");
            let load = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);
            load.open('GET', "http://api.flickr.com/services/rest/?method=flickr.people.findByUsername&api_key=" + flickrKey + "&username=" + encodeURIComponent(id), true);

            load.onreadystatechange = function (aEvt) {
              let myDiscoveryToken = discoveryToken;
              let newPerson = {"_refreshDate":new Date().getTime()}; 
              if (load.readyState == 4) {
                if (load.status == 200) {
                  let dom = load.responseXML;
                  if (dom.documentElement.attributes.stat.value == "ok")
                  {
                    let user = dom.documentElement.getElementsByTagName("user")[0];
                    let nsID = user.attributes.nsid.value;
                    getFlickrUserDetails(nsID, newPerson, function() {
                      completionCallback(newPerson, myDiscoveryToken);
                    });
                  } else {
                    completionCallback(newPerson, myDiscoveryToken);
                  }
                }
              }
            }
            load.send(null);
          } catch (e) {
            if (e != "DuplicatedDiscovery") {
              this._log.info("Flickr error: " + e);
            }
          }
        }
      } catch (e) {
        this._log.info("Flickr error: " + e);      
      }
    }
  }
}

function getFlickrUserDetails(nsID, newPerson, callback)
{
  let load = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);
  load.open('GET', "http://api.flickr.com/services/rest/?method=flickr.people.getInfo&api_key=" + flickrKey +
    "&user_id=" + encodeURIComponent(nsID), false);
  load.send(null);

  let detail = load.responseXML;
  if (detail.documentElement.attributes.stat.value == "ok") 
  {
    let personDOM = detail.documentElement.getElementsByTagName("person")[0];
    let username = personDOM.getElementsByTagName("username")[0];
    let location = personDOM.getElementsByTagName("location")[0];
    let photosurl = personDOM.getElementsByTagName("photosurl")[0];
    let realname = personDOM.getElementsByTagName("realname")[0];
    // let profileurl = personDOM.getElementsByTagName("profileurl")[0];

    if (!newPerson) newPerson = {};
    if (username) {
      if (!newPerson.accounts) newPerson.accounts = [];
      newPerson.accounts.push({domain:"flickr.com", type:"Flickr", username:username.textContent, userid:nsID});
    }
    if (location && location.textContent.length > 0) {
      if (!newPerson.location) newPerson.location = [];
      newPerson.location.push({type:"Location", value:location.textContent});
    }
    if (photosurl) {
      if (!newPerson.urls) newPerson.urls = [];
      newPerson.urls.push({type:"Flickr", value:photosurl.textContent, title:"Flickr Photo Page"});
    }
    if (realname) {
      var n = realname.textContent;
      newPerson.displayName = n;
          
      // For now, let's assume European-style givenName familyName+
      let split = n.split(" ", 1);
      if (split.len == 2 && split[0].length > 0 && split[1].length > 0) {
        newPerson.name = {};
        newPerson.name.givenName = split[0];
        newPerson.name.familyName = split.splice(1, 1).join(" ");
      }
    }
  }
  callback();
}


function getFlickrUsernameFromURL(url)
{
  let re = RegExp("http://(www\\.)?flickr.com/(people/|photos/|)([^/]*)(/)?", "gi"); 
  let result = re.exec(url);
  if (result) {
    return result[3];
  }
  return null;
}

function postProcessFlickrPhotoList(photoset)
{
  for each (let photo in photoset.photo) 
  {
    photo.photoThumbnailURL = photo.url_s;
    photo.photoFullURL = photo.url_l;
    photo.name = photo.title;
    try {
      photo.created_time = photo.datetaken.replace(" ", "T");
      photo.created_time_norm = new Date(photo.created_time);
    } catch (e) {}
    if (photoset.owner) {
      photo.homeURL = "http://www.flickr.com/photos/" + photoset.owner + "/" + photo.id;
    }
  }
}

function constructFlickrPicturesOfService(account) {
  return {
    identifier: "flickr:picturesOf:" + account.userid,
    methodName: "picturesOf",

    method: function(callback) {
      People._log.debug("Making call to flickr.people.getPhotosOf for " + account.userid);
      let load = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);
      load.open('GET', 
        "http://api.flickr.com/services/rest/?method=flickr.people.getPhotosOf&api_key=" + flickrKey + "&user_id=" + 
        encodeURIComponent(account.userid) + "&extras=description,date_upload,date_taken,geo,tags,media,url_s,url_m,url_l&format=json&nojsoncallback=1", 
        false);
      load.send(null);
      let response = JSON.parse(load.responseText);      
      for each (var photo in response.photos.photo)
      {
        photo.homeURL = "http://www.flickr.com/photos/" + photo.owner + "/" + photo.id;
      }
      postProcessFlickrPhotoList(response.photos);
      callback(response.photos.photo);
    }
  };
}

function constructFlickrPicturesByService(account) {
  return {
    identifier: "flickr:pictureCollectionsBy:" + account.userid,
    methodName: "pictureCollectionsBy",

    method: function(callback) {
      People._log.debug("Making call to flickr.photosets.getList for " + account.userid);
      let load = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);
      load.open('GET', 
        "http://api.flickr.com/services/rest/?method=flickr.photosets.getList&api_key=" + flickrKey + "&user_id=" + 
        encodeURIComponent(account.userid) + "&format=json&nojsoncallback=1", 
        true);
        
      load.onreadystatechange = function() {
        try {
          if (load.readyState == 4) {
            if (load.status == 200) {
              processPhotosetsGetList(load, account,  callback);
            }
          }
        } catch (e) {
          People._log.error("Flickr HTTP error: " + e);
        }
      };
      load.send(null);
    }
  };
}

function processPhotosetsGetList(load, account, callback)
{
  try {
  let name = (account.username ? account.username : account.userid);
  
  let response = JSON.parse(load.responseText);

  // Decorate each photoset with a getPhotos method
  let result = [];  
  result.push(
    {
      name:"Photostream",
      homeURL:"http://www.flickr.com/photos/" + account.userid ,
      getPhotos:function(getPhotostreamCallback) {
        try {
          let photostreamLoad = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);
          photostreamLoad.open('GET', 
            "http://api.flickr.com/services/rest/?method=flickr.people.getPublicPhotos&api_key=" + flickrKey + "&user_id=" + 
            encodeURIComponent(account.userid) + "&extras=description,date_upload,date_taken,geo,tags,media,url_s,url_m,url_l&format=json&nojsoncallback=1", 
            true);
          photostreamLoad.onreadystatechange = function() {
            if (photostreamLoad.readyState == 4) {
              if (photostreamLoad.status == 200) {
                try {
                  let response = JSON.parse(photostreamLoad.responseText);
                  response.photos.owner = account.userid;
                  postProcessFlickrPhotoList(response.photos);          
                  getPhotostreamCallback(response.photos.photo);
                } catch (e) {
                  People._log.error("Flickr Photostream error: " + e);
                }
              }
            }
          }
          photostreamLoad.send(null);
        } catch (e) {
          People._log.error("Flickr HTTP error: " + e);
        }
      }
    }
  );
  for each (let coll in response.photosets.photoset)
  {
    let collID = coll.id;
    let primaryID = coll.primary;
    coll.name = coll.title._content;
    coll.location = null;
    coll.created_time = null;
    coll.primaryPhotoURL = "http://farm" + coll.farm + ".static.flickr.com/" + coll.server + "/" + coll.primary + "_" + coll.secret + ".jpg";
    coll.primaryPhotoThumbnailURL = "http://farm" + coll.farm + ".static.flickr.com/" + coll.server + "/" + coll.primary + "_" + coll.secret + "_s.jpg";
    coll.homeURL = "http://www.flickr.com/photos/" + account.userid + "/sets/" + coll.id + "/";
    
    
    let targetColl = coll;
    coll.getPhotos = function(getPhotoCallback) {
      let getPhotoLoad = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);
      getPhotoLoad.open('GET', 
        "http://api.flickr.com/services/rest/?method=flickr.photosets.getPhotos&photoset_id=" + collID + "&api_key=" + flickrKey + "&user_id=" + 
        encodeURIComponent(account.userid) + "&extras=description,date_upload,date_taken,geo,tags,media,url_s,url_m,url_l&format=json&nojsoncallback=1", 
        true);
      getPhotoLoad.onreadystatechange = function() {
        try {
          if (getPhotoLoad.readyState == 4) {
            if (getPhotoLoad.status == 200) {
              processPhotosetsGetPhotos(getPhotoLoad, targetColl, getPhotoCallback);
            }
          }
        } catch (e) {
          People._log.error("Flickr HTTP error: " + e);
        }
      };
      getPhotoLoad.send(null);
    }
  }
  result = result.concat(response.photosets.photoset)

  callback(result);
  } catch (e) {
    People._log.error("Flickr HTTP error: " + e);
  }
}

function processPhotosetsGetPhotos(getPhotoLoad, collection, callback)
{
  let response = JSON.parse(getPhotoLoad.responseText);
  ////dump("Photo list " + getPhotoLoad.responseText + "\n");
  postProcessFlickrPhotoList(response.photoset);          

  ////dump("Timestamp is " + response.photoset.photo[0].datetaken + "\n");
  var latest = null;
  for each (var p in response.photoset.photo) {
    try {
      let d = new Date(p.created_time);
      if (!latest || d > latest) latest = d;
    } catch (e) {}
  }
  if (latest) { // this is an encapsulation violation - fix the canonical types, please!
    collection.created_time_norm = latest;
    collection.created_time = "" + latest;
  }
  callback(response.photoset.photo);

}

/*
        try {
          //dump("readystatechange " + load.readyState + "\n");
          if (load.readyState == 4) {
            //dump("Call returned; status is " + load.status + "\n");
            if (load.status == 200) {
              //dump("The result is " + load.responseText + "\n");
    
              let response = JSON.parse(load.responseText);
              callback(response.photos.photo);
            }
          }
        } catch (e) {
          //dump(e + "\n");
        }
*/



PeopleImporter.registerDiscoverer(FlickrAccountDiscoverer);
PersonServiceFactory.registerAccountService("flickr.com", constructFlickrPicturesOfService);
PersonServiceFactory.registerAccountService("flickr.com", constructFlickrPicturesByService);


