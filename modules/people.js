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
 *  Dan Mills <thunder@mozilla.com>
 *  Justin Dolske <dolske@mozilla.com>
 *  Michael Hanson <mhanson@mozilla.com>
 *  Ruven Chu <rchu@mozilla.com>
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

let EXPORTED_SYMBOLS = ["People", "Person", "DiscoveryCoordinator", "PersonServiceFactory"];

const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

Cu.import("resource://gre/modules/Services.jsm");

const DB_VERSION = 4; // The database schema version
const SORT_WEIGHTS = {
  displayName:1,
  "name.formatted":2,
  nickname:3,
  "tags.value":4,
  "phoneNumbers.value":5,
  "addresses.formatted":6,
  "organizations.name":7,
  "emails.value":8,
  "ims.value":9,
  preferredUsername:10,
  "name.familyName":11,
  "name.givenName":12,
  "name.middleName":13,
  "addresses.country":14,
  "addresses.region":15,
  "addresses.streetAddress":16,
  "addresses.locality":17,
  "addresses.postalCode":18,
  "organizations.department":19,
  "organizations.title":20,
  "organizations.startDate":21,
  "organizations.endDate":22,
  "organizations.location":23,
  "organizations.description":24,
  "accounts.domain":25,
  "accounts.userid":26,
  "accounts.username":27,
  "photos.value":28,
  "relationships.value":29,
  "urls.value":30,
  gender:31,
  birthday:32,
  anniversary:33,
  published:34,
  updated:35,
  utcOffset:36,
  notes:37,
  "name.honorificPrefix":38,
  "name.honorificSuffix":39,
  "phoneNumbers.type":40,
  "addresses.type":41,
  "emails.type":42,
  "ims.type":43,
  "tags.type":44,
  "photos.type":45,
  "relationships.type":46,
  "urls.type":47,
  connected:48,
  id:49,
  "phoneNumbers.primary":50,
  "addresses.primary":50,
  "emails.primary":50,
  "ims.primary":50,
  "tags.primary":50,
  "photos.primary":50,
  "relationships.primary":50,
  "urls.primary":50,
  phoneNumbers:50,
  addresses:50,
  emails:50,
  ims:50,
  photos:50,
  tags: 50,
  relationships:50,
  urls:50
};

const ALL_GROUP_CONSTANT = "___all___";

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

Cu.import("resource://people/modules/utils.js");
Cu.import("resource://people/modules/ext/log4moz.js");
Cu.import("resource://people/modules/ext/Observers.js");


// If Activities is present, we will use it.
try {
  Cu.import("resource://activities/modules/activities.js");
} catch (e) {
}

var IO_SERVICE = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);

try {
  var HISTORY_SERVICE = Cc["@mozilla.org/browser/nav-history-service;1"].getService(Ci.nsINavHistoryService);
} catch (e) {
}

function PeopleService() {
  this._initLogs();
  this._dbStmts = [];
  this._dbInit();
  this._log.info("People store initialized");
  this._sessionPermissions = {};  
}
PeopleService.prototype = {

  _initLogs: function _initLogs() {
    this._log = Log4Moz.repository.getLogger("People.Store");
    this._log.level = Log4Moz.Level["Trace"];

    let formatter = new Log4Moz.BasicFormatter();
    let root = Log4Moz.repository.rootLogger;

    let capp = new Log4Moz.ConsoleAppender(formatter);
    capp.level = Log4Moz.Level["Warn"];
    root.addAppender(capp);

    let dapp = new Log4Moz.DumpAppender(formatter);
    dapp.level = Log4Moz.Level["Trace"];
    root.addAppender(dapp);

    let logfile = Services.dirsvc.get("ProfD", Ci.nsIFile);
    logfile.QueryInterface(Ci.nsILocalFile);
    logfile.append("people-log.txt");
    if (!logfile.exists())
      logfile.create(logfile.NORMAL_FILE_TYPE, 0600);

    this._fileApp = new Log4Moz.RotatingFileAppender(logfile, formatter);
    this._fileApp.level = Log4Moz.Level["Debug"];
    root.addAppender(this._fileApp);
  },

  clearLogs: function WeaveSvc_clearLogs() {
    this._fileApp.clear();
  },

  // The current database schema.
  _dbSchema: {
    tables: {
      people: "id   INTEGER PRIMARY KEY, "  +
              "guid TEXT UNIQUE NOT NULL, " +
              "json TEXT NOT NULL, " +
              "modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
    },
    index_tables: ["displayName", "givenName", "familyName", "emails", "tags"],
    index_fields: ["displayName", "name/givenName", "name/familyName", "emails", "tags"]
  },

  get _dbFile() {
    let file = Services.dirsvc.get("ProfD", Components.interfaces.nsIFile);
    file.append("people.sqlite");
    this.__defineGetter__("_dbFile", function() file);
    return file;
  },

  get _db() {
    let dbConn = Services.storage.openDatabase(this._dbFile); // auto-creates file
    this.__defineGetter__("_db", function() dbConn);
    return dbConn;
  },

  /*
   * _dbInit
   *
   * Attempts to initialize the database. This creates the file if it doesn't
   * exist, performs any migrations, etc. Return if this is the first run.
   */
  _dbInit : function () {
      this._log.debug("Initializing Database");
      let isFirstRun = false;
      try {
        // Get the version of the schema in the file. It will be 0 if the
        // database has not been created yet.
        let version = this._db.schemaVersion;
        this._log.debug("db schemaVersion is "+version);
        if (version == 0) {
          isFirstRun = true;
          this._dbCreate();
        } else if (version != DB_VERSION) {
          this._dbMigrate(version);
        }
        
        this._db.executeSimpleSQL("PRAGMA synchronous=OFF");
      } catch (e if e.result == Components.results.NS_ERROR_FILE_CORRUPTED) {
          // Database is corrupted, so we backup the database, then throw
          // causing initialization to fail and a new db to be created next use
          this._dbCleanup(true);
          throw e;
      }
      return isFirstRun;
  },

  _dbCreate: function _dbCreate() {
    this._log.debug("Creating Database");

    this._log.debug("Creating Tables");
    for (let name in this._dbSchema.tables)
      this._db.createTable(name, this._dbSchema.tables[name]);
    
    this._db.executeSimpleSQL("CREATE TRIGGER people_modified AFTER UPDATE  ON people BEGIN UPDATE people SET modified = CURRENT_TIMESTAMP WHERE id = new.id; END;")

    this._log.debug("Creating Index Tables");
    for each (let index in this._dbSchema.index_tables) {
      this._log.debug("  creating table: "+index);
      this._db.createTable(index, "id INTEGER PRIMARY KEY, " +
        "person_id INTEGER NOT NULL, val TEXT NOT NULL COLLATE NOCASE");
      for each (let col in ["person_id", "val"])
        this._db.executeSimpleSQL("CREATE INDEX IF NOT EXISTS " + index +
          "_" + col + " ON " + index + " (" + col + ")");
    }

    this._db.createTable("site_permissions", "id INTEGER PRIMARY KEY, " +
      "url TEXT UNIQUE NOT NULL, fields TEXT NOT NULL, groups TEXT NOT NULL");
    this._db.executeSimpleSQL("CREATE INDEX IF NOT EXISTS site_permissions_url ON site_permissions (url)");

    this._db.createTable("service_metadata", "id INTEGER PRIMARY KEY, " +
      "servicename TEXT UNIQUE NOT NULL, refresh INTEGER NOT NULL");
    
    this._db.createTable("mergeHints", "id INTEGER PRIMARY KEY, " +
                          "person_id INTEGER NOT NULL, service TEXT NOT NULL COLLATE NOCASE, " +
                          "user TEXT NOT NULL COLLATE NOCASE, positive BOOLEAN NOT NULL," +
                          "UNIQUE(service, user, person_id) ON CONFLICT REPLACE");
    this._db.executeSimpleSQL("CREATE INDEX IF NOT EXISTS mergeHints_val ON mergeHints (service, user)");
    this._db.executeSimpleSQL("CREATE INDEX IF NOT EXISTS mergeHints_person_id ON mergeHints (person_id)");

    this._db.schemaVersion = DB_VERSION;
  },

  _dbMigrate : function (oldVersion) {
    this._log.debug("Attempting to migrate from version " + oldVersion);

    if (oldVersion > DB_VERSION) {
      this._log.debug("Downgrading to version " + DB_VERSION);
      // User's DB is newer. Sanity check that our expected columns are
      // present, and if so mark the lower version and merrily continue
      // on. If the columns are borked, something is wrong so blow away
      // the DB and start from scratch. [Future incompatible upgrades
      // should swtich to a different table or file.]

      if (!this._dbAreExpectedColumnsPresent())
        throw Components.Exception("DB is missing expected columns",
                                   Components.results.NS_ERROR_FILE_CORRUPTED);

      // Change the stored version to the current version. If the user
      // runs the newer code again, it will see the lower version number
      // and re-upgrade (to fixup any entries the old code added).
      this._db.schemaVersion = DB_VERSION;
      return;
    }

    // Upgrade to newer version...

    this._db.beginTransaction();

    try {
      for (let v = oldVersion + 1; v <= DB_VERSION; v++) {
        this._log.debug("Upgrading to version " + v + "...");
        let migrateFunction = "_dbMigrateToVersion" + v;
        this[migrateFunction]();
      }
    } catch (e) {
      this._log.debug("Migration failed: "  + e);
      this._db.rollbackTransaction();
      throw e;
    }

    this._db.schemaVersion = DB_VERSION;
    this._db.commitTransaction();
    this._log.debug("DB migration completed.");
  },

  _dbMigrateToVersion2 : function _dbMigrateToVersion2() {
    for each (var key in ["displayName", "emails", "familyName", "givenName"]) {
      for each (var idx in ["person_id", "val"]) {
        this._db.createStatement("DROP INDEX " + key + "_" + idx).execute();
      }
      this._db.createStatement("DROP TABLE " + key).execute();
    }
    this._db.createStatement("DROP TABLE people").execute();
    this._db.createStatement("DROP INDEX site_permissions_url").execute();
    this._db.createStatement("DROP TABLE site_permissions").execute();
    
    this._dbCreate();
  },
  
  _dbMigrateToVersion3: function _dbMigrateToVersion3() {
    this._db.createTable("tags", "id INTEGER PRIMARY KEY, " +
      "person_id INTEGER NOT NULL, val TEXT NOT NULL COLLATE NOCASE");
    this._db.executeSimpleSQL("CREATE INDEX IF NOT EXISTS tags_person_id ON tags(person_id)");
    this._db.executeSimpleSQL("CREATE INDEX IF NOT EXISTS tags_val ON tags(val)");
  },

  _dbMigrateToVersion4 : function _dbMigrateToVersion4() {
    for each (let key in this._dbSchema.index_tables) {
      for each (var idx in ["person_id", "val"]) {
        this._db.createStatement("DROP INDEX IF EXISTS " + key + "_" + idx).execute();
      }
      this._db.createStatement("DROP TABLE IF EXISTS " + key).execute();
    }
    this._db.createStatement("DROP TABLE IF EXISTS people").execute();
    this._db.createStatement("DROP TABLE IF EXISTS tags").execute();
    this._db.createStatement("DROP INDEX IF EXISTS site_permissions_url").execute();
    this._db.createStatement("DROP TABLE IF EXISTS site_permissions").execute();
    this._db.createStatement("DROP TABLE IF EXISTS service_metadata").execute();
    this._db.createStatement("DROP TABLE IF EXISTS mergeHints").execute();
    this._db.createStatement("DROP INDEX IF EXISTS mergeHints_val").execute();
    this._db.createStatement("DROP INDEX IF EXISTS mergeHints_person_id").execute();
    
    this._dbCreate();
  },


  /*
   * _dbAreExpectedColumnsPresent
   *
   * Sanity check to ensure that the columns this version of the code expects
   * are present in the DB we're using.
   */
  _dbAreExpectedColumnsPresent : function () {
    let check = function(query) {
      try {
        let stmt = this._db.createStatement(query);
        // (no need to execute statement, if it compiled we're good)
        stmt.finalize();
        return true;
      } catch (e) {
        return false;
      }
    };

    if (!check("SELECT id, guid, json FROM moz_people"))
      return false;
    for each (let index in this._dbSchema.index_tables)
      if (!check("SELECT person_id, val FROM " + index))
        return false;

    this._log.debug("verified that expected columns are present in DB.");
    return true;
  },

  /*
   * _dbCleanup
   *
   * Called when database creation fails. Finalizes database statements,
   * closes the database connection, deletes the database file.
   */
  _dbCleanup : function (backup) {
    this._log.debug("Cleaning up DB file - close & remove & backup=" + backup);

    // Create backup file
    if (backup) {
      let backupFile = this._dbFile.leafName + ".corrupt";
      Services.storage.backupDatabaseFile(this._dbFile, backupFile);
    }

    // Finalize all statements to free memory, avoid errors later
    for (let i = 0; i < this._dbStmts.length; i++)
      this._dbStmts[i].finalize();
    this._dbStmts = [];

    // Close the connection, ignore 'already closed' error
    try { this._db.close(); } catch(e) {}
    this._dbFile.remove(false);
  },

  /*
   * _dbVacuum
   *
   * Cleans up deleted records from the database.
   */
  _dbVacuum : function () {
    this._log.debug("Vacuuming DB file");
    let stmt;
    try {
      stmt = this._dbCreateStatement("vacuum");
      stmt.execute();
    } finally {
      if (stmt) stmt.reset();
    }
    this._log.debug("Finished vacuuming DB file");
  },

  /*
   * _dbCreateStatement
   *
   * Creates a statement, wraps it, and then does parameter replacement
   * Returns the wrapped statement for execution.  Will use memoization
   * so that statements can be reused.
   */
  _dbCreateStatement : function _dbCreateStatement(query, params) {
    let wrappedStmt = this._dbStmts[query];
    // Memoize the statements
    //if (!wrappedStmt) {
    //  let stmt = this._db.createStatement(query);
    //
    //  wrappedStmt = Cc["@mozilla.org/storage/statement-wrapper;1"].
    //    createInstance(Ci.mozIStorageStatementWrapper);
    //  wrappedStmt.initialize(stmt);
    //  this._dbStmts[query] = wrappedStmt;
    //}
    let stmt = this._db.createStatement(query);
    wrappedStmt = stmt;
    // Replace parameters, must be done 1 at a time
    if (params)
      for (let [param, val] in Iterator(params)) {
        // Escape params that start with /
        if (param[0] == "/") {
          param = param.slice(1);
          val = "%" + wrappedStmt.escapeStringForLIKE(val, "/") + "%";
        }
        wrappedStmt.params[param] = val;
      }
    return wrappedStmt;
  },
  
  
  //------------------------------------------------------------------------------------
  // Begin access methods:
  //------------------------------------------------------------------------------------

  changeGUID: function changeGUID(from, to) {
    let people = this.find({guid: from});
    if (people.length == 0)
      return false;

    let person = people[0];
    person.guid = to;

    let stmt;
    try {
      let query = "UPDATE PEOPLE SET guid = :to, json = :json WHERE guid = :from";
      let params = {
        from: from,
        to: to,
        json: JSON.stringify(person)
      };
      stmt = this._dbCreateStatement(query, params);
      stmt.execute();

      Observers.notify("people-guid-change", {from: from, to: to});
      return true;

    } catch (e) {
      this._log.warn("changeGUID failed: " + Utils.exceptionStr(e));
      return false;

    } finally {
      if (stmt)
        stmt.reset();
    }
  },

  _addIndexed: function _addIndexed(thing, prop, person_id) {
    if (Utils.isArray(thing))
      return Utils.mapCall(this, arguments, _addIndexed);

    let value = thing;
    if (typeof(thing) == "object")
      value = thing.value || thing.val || thing[prop];

    let stmt;
    try {
      let query = "INSERT INTO " + prop + " (person_id, val) VALUES (:person_id, :val)";
      let params = {
        person_id: person_id,
        val: value
      };
      stmt = this._dbCreateStatement(query, params);
      stmt.execute();

    } catch (e) {
      this._log.warn("add indexed field failed (for " + value + "; " + JSON.stringify(thing) + "): " + Utils.exceptionStr(e));
      throw "add indexed field failed: " + Utils.exceptionStr(e);

    } finally {
      if (stmt)
        stmt.reset();
    }

    return null;
  },

  _clearIndexed: function _clearIndexed(person_id, prop) {
    let stmt;
    try {
      let query = "DELETE FROM " + prop + " WHERE person_id = :person_id";
      let params = {
        person_id: person_id
      };
      stmt = this._dbCreateStatement(query, params);
      stmt.execute();

    } catch (e) {
      this._log.warn("clear indexed field failed: " + Utils.exceptionStr(e));
      throw "clear indexed field failed: " + Utils.exceptionStr(e);

    } finally {
      if (stmt)
        stmt.reset();
    }
  },
  
  /*
   * _updateMergeHintsIndexed
   *
   * This removes all mergehints that are indexed, and then readds them based on the contents
   * of the merge folder.
   */
  _updateMergeHintsIndexed: function _updateMergeHintsIndexed(person_id, person){
    this._clearIndexed(person_id, "mergeHints");
    for each (let mergeHint in Iterator(person.obj.merge)){
      let pair = Iterator(mergeHint[1]).next();
      this._addMergeHintsIndexed(person_id, mergeHint[0], pair[0], pair[1]);
    }  
  },
  _addMergeHintsIndexed: function _addMergeHintsIndexed(person_id, svcName, user, value){

    let stmt;
    try {
      let query = "INSERT INTO mergeHints (person_id, service, user, positive) VALUES (:person_id, :service, :user, :positive)";
      let params = {
        person_id: person_id,
        service: svcName,
        user: user,  
        positive: value
      };
      
      stmt = this._dbCreateStatement(query, params);
      stmt.execute();
    } catch (e) {
      this._log.warn("add mergetHints indexed field failed (for " + svcName + user + ": " + Utils.exceptionStr(e));
      throw "add mergeHints indexed field failed: " + Utils.exceptionStr(e);

    } finally {
      if (stmt)
        stmt.reset();
    }

    return null;
  },

  /** Note that person_id is the database person_id, not a GUID.
   * personObj must be a Person, not a raw document. */
  _updateIndexed: function _updateIndexed(person_id, personObj) {
    for (let idx in this._dbSchema.index_tables) {
      var tableIndex = this._dbSchema.index_tables[idx];
      var field = this._dbSchema.index_fields[idx];
      this._clearIndexed(person_id, tableIndex);
      let val = personObj.getProperty(field);
      if (val) {
        this._addIndexed(val, tableIndex, person_id);
      }
    }
  },
  
  deleteAll: function deleteAll() {
    let stmt = null;
    try {
      this._db.beginTransaction();
      for each (let idx in this._dbSchema.index_tables) {
        let query = "DELETE FROM " + idx;
        stmt = this._dbCreateStatement(query);
        stmt.execute();
      }
      let query = "DELETE FROM people";
      stmt = this._dbCreateStatement(query);
      stmt.execute();

      query = "DELETE FROM service_metadata";
      stmt = this._dbCreateStatement(query);
      stmt.execute();
      
      query = "DELETE FROM mergeHints";
      stmt = this._dbCreateStatement(query);
      stmt.execute();

      this._db.commitTransaction();

    } catch (e) {
      this._log.warn("deleteAll failed: " + Utils.exceptionStr(e));
      throw "deleteAll failed: " + Utils.exceptionStr(e);

    } finally {
      if (stmt)
        stmt.reset();
    }
    Observers.notify("people-remove", {info:"all"});
    this._dbVacuum();
  },
  
  /* Returns a map from service, primary key, and value to a list of records */
  getMergeHintLookups: function getMergeHintLookups(){
    let mergeHintLookup = {};
    let guidMergeHintLookup = {};
    var stmt = this._dbCreateStatement("SELECT guid, service, user, positive FROM people p JOIN mergeHints t0 ON t0.person_id = p.id");
    try{
      stmt.reset();
      while (stmt.step()) {  
        let guid = stmt.row.guid;  
        let service = stmt.row.service;
        let user = stmt.row.user;
        let positive = stmt.row.positive;
        let lookupKey = service.toLowerCase() + user.toLowerCase() + positive;
        if(!mergeHintLookup[lookupKey]) mergeHintLookup[lookupKey] = [];
        mergeHintLookup[lookupKey].push(guid);
        if(!guidMergeHintLookup[guid])guidMergeHintLookup[guid] = [];
        guidMergeHintLookup[guid].push({service:service, user:user, positive:positive});
      }
      return [mergeHintLookup, guidMergeHintLookup];
    } catch (e) {
      this._log.warn("Unable to perform mergeHints to GUID lookup: " + e);
    } finally {
      stmt.reset();
    }
  },

  /* Returns a map from lowercased email addresses to GUIDs for all records */
  getEmailToGUIDLookup: function getEmailToGUIDLookup() {
    emailLookup = {};
    var stmt = this._dbCreateStatement("SELECT guid, val FROM people p JOIN emails t0 ON t0.person_id = p.id");
    try{
      stmt.reset();
      while (stmt.step()) {  
        let guid = stmt.row.guid;  
        let val = stmt.row.val;  
        emailLookup[val.toLowerCase()] = guid;
      }
      return emailLookup;
    } catch (e) {
      this._log.warn("Unable to perform email to GUID lookup: " + e);
    } finally {
      stmt.reset();
    }
  },

  /* Returns a map from lowercased displayNames to GUIDs for all records */
  getDisplayNameToGUIDLookup: function getDisplayNameToGUIDLookup() {
    displayNameLookup = {};
    var stmt = this._dbCreateStatement("SELECT guid, val FROM people p JOIN displayName t0 ON t0.person_id = p.id");
    try{
      stmt.reset();
      while (stmt.step()) {  
        let guid = stmt.row.guid;  
        let val = stmt.row.val;  
        displayNameLookup[val.toLowerCase()] = guid;
      }
      return displayNameLookup;
    } catch (e) {
      this._log.warn("Unable to perform displayName to GUID lookup: " + e);
    } finally {
      stmt.reset();
    }
  },
  
  _searchForMergeTarget: function _searchForMergeTarget(personDoc, service) {
    // TODO: This is much slower than I would like.  Are the indices working properly?
    
    let match = this._findMergeHints(personDoc, service);
    if(match && match.length > 0 && match[0].positive == 1) return match[0].guid.toLowerCase();
    else if(match && match.length > 0 && match[0].positive == 0) return null;
    
    // Try all emails:
    if (personDoc.emails && personDoc.emails.length > 0) {
      for each (let anEmail in personDoc.emails) {
        if (anEmail.value) {
          match = this._find("guid", {emails: "=" + anEmail.value});
          if (match && match.length > 0) {
            return match[0];
          }
        }
      }
    }
    
    // Now try full name match:
    if (personDoc.displayName && personDoc.displayName != "undefined" && personDoc.displayName != "null") {
      match = this._find("guid", {displayName: "=" + personDoc.displayName});
      if (match && match.length > 0) {
        return match[0];
      }
    }
    
    return null;
  },
  
  _findMergeHints: function _findMergeHints(personDoc, service){
    
    let params = {};
    let query = "SELECT guid, positive, service, user FROM people p JOIN mergeHints m0 ON m0.person_id = p.id WHERE user = :user AND service = :service";
    params["service"] = service.name;
    params["user"] = service.getPrimaryKey(personDoc);
    let matches = [];
    let stmt = this._dbCreateStatement(query, params);
    try{
      while (stmt.step()) {  
        let ans = {};
        ans.guid = stmt.row.guid;
        ans.positive = stmt.row.positive;
        ans.user = stmt.row.user;
        ans.service = stmt.row.service;
        matches.push(ans);
      }
      return matches;
    } catch (e) {
      this._log.warn("Unable to search for mergeHints: " + e);
    } finally {
      stmt.reset();
    }
    result = matches;
    return result;
  },


  /** TODO: Need a way to specify a GUID on new person doc add *****/
  
  _createMergeFinder: function _createMergeFinder(sizeHint) {
    var finder = {
      people: this,
      
      findNegativeMerges: function findNegativeMerges(aPersonDoc, service) {
        if(this.mergeHintLookup){
          let lookupKey = service.name.toLowerCase() + service.getPrimaryKey(aPersonDoc).toLowerCase() + 0;
          if(this.mergeHintLookup[lookupKey])
            return(this.mergeHintLookup[lookupKey]);
          return [];
        }
        return null;
      },
      mergeHintsFromGUID: function mergeHintsFromGUID(guid){
        if(this.guidMergeHintLookup)
          return(this.guidMergeHintLookup[guid]);
        return null;
      },
      
      findMergeTarget: function findMergeTarget(aPersonDoc, service) {

        if (this.mergeHintLookup) {
          let lookupPrefix = service.name.toLowerCase() + service.getPrimaryKey(aPersonDoc).toLowerCase();
          if (this.mergeHintLookup[lookupPrefix + 1]) {
            return this.mergeHintLookup[lookupPrefix + 1][0];
          } else if(this.mergeHintLookup[lookupPrefix + 0]){
            //if we want to block merges, we return null
            return null;
          }
        }
      
        if (this.emailLookup) {
          for each (anEmail in aPersonDoc.emails) {
            if (this.emailLookup[anEmail.value.toLowerCase()]) {
              return emailLookup[anEmail.value.toLowerCase()];
            }
          }
        }

        if (this.displayNameLookup) {
          if (aPersonDoc.displayName && this.displayNameLookup[aPersonDoc.displayName.toLowerCase()]) {
            return this.displayNameLookup[aPersonDoc.displayName.toLowerCase()];
          }
          // If we have a lookup and we didn't find a match, don't fall
          // through to the database search; just return.
          return null;
        }
        
        return this.people._searchForMergeTarget(aPersonDoc, service);
      },
      
      addPerson: function addPerson(aPersonDoc, service, guid) {
        if (this.displayNameLookup && aPersonDoc.displayName) 
          this.displayNameLookup[aPersonDoc.displayName.toLowerCase()] = guid;

        if (this.emailLookup && aPersonDoc.emails) {
          for each (anEmail in aPersonDoc.emails) {
            if (anEmail.value) {
              this.emailLookup[anEmail.value.toLowerCase()] = guid;
            }
          }
        } 
        if(this.mergeHintLookup){
          let lookupKey = service.name.toLowerCase() + service.getPrimaryKey(aPersonDoc).toLowerCase() + 1;
          if(!this.mergeHintLookup[lookupKey])
            this.mergeHintLookup[lookupKey] = [];
          this.mergeHintLookup[lookupKey].push(guid);
        }
      }
    }
    if (sizeHint > 50) { // it's worth it to build a lookup table...
      finder.emailLookup = this.getEmailToGUIDLookup();
      finder.displayNameLookup = this.getDisplayNameToGUIDLookup();
      let mergeHintLookups = this.getMergeHintLookups();
      finder.mergeHintLookup = mergeHintLookups[0];
      finder.guidMergeHintLookup = mergeHintLookups[1];
    }
    return finder;
  },
  
  /* Merge two people based on GUIDs */
  mergePeople: function mergePeople(GUID1, GUID2){
    try {
      let target = (this._find("json", {guid:GUID1}).map(function(json) JSON.parse(json)))[0];
      let source = (this._find("json", {guid:GUID2}).map(function(json) JSON.parse(json)))[0];
      for each (let [provider, ids] in Iterator(source.documents)){
        if(!target.documents[provider]) target.documents[provider] = {};
        for each(let [id, document] in Iterator(ids)){
          if(target.documents[provider][id]) this.mergeDocuments(target.documents[provider][id], source.documents[provider][id]);
          else target.documents[provider][id] = document;
        }
      }
      for each (let [provider, id] in Iterator(source.merge)){
        for each(let [user, value] in Iterator(id)){
          if(!target.merge[provider]) target.merge[provider] = {};
          if(!target.merge[provider][user] || target.merge[provider][user] != true) target.merge[provider][user] = value;
        }
      }
  
      this._update(target);
      this.removeGUIDs([source.guid]);
      Observers.notify("people-update", {guid:target.guid}); // wonder if this should be add. probably not.
      Observers.notify("people-remove", {guid:source.guid});
    } catch (e) {
      this._log.warn("merge failed: " + Utils.exceptionStr(e));
    } 
  },
  _getDocumentsFromGUIDs: function _getDocumentsFromGUIDs(guids){
    let quoted = guids.map(function(guid){return "'" + guid + "'"});
    let query = "SELECT json, guid FROM people p WHERE guid IN (" + quoted.join(",") + ")";

    let matches = {};
    let stmt = this._dbCreateStatement(query);
    try{
      while (stmt.step()) {  
        let ans = {};
        matches[stmt.row.guid] = JSON.parse(stmt.row.json);
      }
      return matches;
    } catch (e) {
      this._log.warn("Unable to search for mergeHints: " + e);
      return [];
    } finally {
      stmt.reset();
    }
    result = matches;
    return result;
  },
  
  add: function add(document, service, progressFunction) {
    let docArray;
    if (Utils.isArray(arguments[0])) {
      docArray = arguments[0];
    } else {
      docArray = [document];
    }

    try {
      this._db.beginTransaction();

      let merges = [];
      this._log.debug("Beginning People.add");
      let mergeFinder = this._createMergeFinder(docArray.length);
      
      for (var i=0;i<docArray.length;i++) {
        if (progressFunction) {
          progressFunction("Adding; " + Math.floor(i * 100 / docArray.length) + "%");
        }

        try
        {
          var personDoc = docArray[i];
          this._log.debug("Adding person " + i + ": " + personDoc.displayName);
          
          // Check for merge:
          let mergeTargetGUID = mergeFinder.findMergeTarget(personDoc, service);
          if (mergeTargetGUID) {
            merges.push([personDoc, mergeTargetGUID]);
            continue;
          }

          // No, perform insert:
          let guid = Utils.makeGUID();

          let stmt;
          try {

            // Object as defined by https://wiki.mozilla.org/Labs/Weave/Contacts/SchemaV2
            let serviceDocuments = {};
            serviceDocuments[service.getPrimaryKey(personDoc)] = personDoc;
            let documents = {};
            documents[service.name] = serviceDocuments;
            let accounts = {};
            accounts[service.getPrimaryKey(personDoc)] = true;
            let mergehints = {};
            mergehints[service.name] = accounts;
          
            let query = "INSERT INTO people (guid, json) VALUES (:guid, :json)";
          
            let obj = {
              guid: guid,
              documents: documents,
              schema: "http://labs.mozilla.com/schemas/people/2",
              merge: mergehints
            };
            let params = {
              guid: guid,
              json: JSON.stringify(obj)
            };
            stmt = this._dbCreateStatement(query, params);
            stmt.execute();
            let person_id = this._db.lastInsertRowID;
            this._updateIndexed(person_id, new Person(obj));
            this._updateMergeHintsIndexed(person_id, new Person(obj));
            mergeFinder.addPerson(personDoc, service, guid);
            
          } catch (e) {
            this._log.warn("add failed: " + Utils.exceptionStr(e));
          } finally {
            if (stmt)
              stmt.reset();
          }
          Observers.notify("people-add", {guid:guid});
        } catch (e)
        {
          this._log.warn("add failed: " + Utils.exceptionStr(e));
        }
      }   

      progressFunction("Resolving merges");
      this._log.debug("Resolving merges");

      let mergeDocs = {};
      
      let mergeGuids = merges.map(function(i) {return i[1];});
      let mergeDocuments = this._getDocumentsFromGUIDs(mergeGuids);

      for each (aMerge in merges) {
        let personDoc = aMerge[0];
        let mergeTargetGUID = aMerge[1];
    
        let dupMatchTarget = mergeDocuments[mergeTargetGUID];

        this._log.info("Resolving merge " + mergeTargetGUID + " (" + personDoc.displayName + ")");

        // Blow away the existing service record?  Merging could be nice...

        // If we have information from existing service
        if (dupMatchTarget.documents[service.name] && dupMatchTarget.documents[service.name][service.getPrimaryKey(personDoc)]) {
          this.mergeDocuments(dupMatchTarget.documents[service.name][service.getPrimaryKey(personDoc)], personDoc);
          dupMatchTarget.merge[service.name][service.getPrimaryKey(personDoc)] = true;
        } else {
          if(!dupMatchTarget.documents[service.name]) dupMatchTarget.documents[service.name] = {};
          dupMatchTarget.documents[service.name][service.getPrimaryKey(personDoc)] = personDoc;
          if(!dupMatchTarget.merge[service.name]) dupMatchTarget.merge[service.name] = {};
          dupMatchTarget.merge[service.name][service.getPrimaryKey(personDoc)] = true;
        }

        // this.mergeIntoRecord(dupMatchTarget, personDoc, service);
        this._update(dupMatchTarget, false);
        Observers.notify("people-update", {guid:dupMatchTarget.guid});
      }
      
      this._db.commitTransaction();
      
    } catch (e) {
      this._log.warn("add failed: " + Utils.exceptionStr(e));
      this._db.rollbackTransaction();
      return {error: "fail", person: personDoc};
    }
    this._log.debug("Finished People.add");
    
    return null;
  },

  update: function update(guid, service, document) {
  
    let stmt;
    try {
      this._db.beginTransaction();

      let query = "SELECT * FROM people WHERE guid = :guid";
      let params = {
        guid: guid
      };
      stmt = this._dbCreateStatement(query, params);

      let oldJson, id;
      while (stmt.step()) {
        id = stmt.row.id;
        oldJson = stmt.row.json;
      }
      if (!oldJson)
        throw "no object for guid " + guid;
      stmt.reset();

      let person = JSON.parse(oldJson);
      if(!person.documents[service.name]) person.documents[service.name] = {};
      person.documents[service.name][service.getPrimaryKey(document)] = document;

      query = "UPDATE people SET json = :json WHERE id = :id";
      params = {
        id: id,
        json: JSON.stringify(person)
      };
      stmt = this._dbCreateStatement(query, params);
      stmt.execute();

      this._updateMergeHintsIndexed(id, new Person(person));
      this._updateIndexed(id, new Person(person));
      this._db.commitTransaction();

    } catch (e) {
      this._log.warn("update failure: " + Utils.exceptionStr(e));
      this._db.rollbackTransaction();
      return {error: e.message, person: person};

    } finally {
      if (stmt)
        stmt.reset();
    }

    Observers.notify("people-update", {guid:guid});
    return null;
  },
  
  /* Splits a document/person away from another */
  split: function split(oldGUID, serviceName, primaryKey){
  
    this._log.debug("Beginning People.split");
    let peopleList = this._find("json", {guid:oldGUID}).map(function(json) JSON.parse(json));
    let person = peopleList[0];
    
    let service = PeopleImporter.getBackend(serviceName);
  
    let guid = Utils.makeGUID();
    
    let stmt;
    
    try {
      this._db.beginTransaction();

      let setMergeHints = function (mergeHints, setting){
        for each (let hints in mergeHints){
          for (let hint in hints)
            hints[hint] = setting;
        }
      }
      
      let mergeMergeHints = function (dest, source){
        for each (let [service, hints] in Iterator(source)){
          if(!dest[service]) dest[service] = {};
          for each (let [hint, value] in Iterator(hints)){
            dest[service][hint] = value;
          }
        }
      }
          
      this._removeDiscoveryDataFromDocuments(person.documents);   
       
      //split the documents
      let documents = {};
      documents[serviceName] = {};
      documents[serviceName][primaryKey] = person.documents[serviceName][primaryKey];
      delete person.documents[serviceName][primaryKey];
      if([i for (i in person.documents[serviceName])].length == 0)
        delete person.documents[serviceName];
      
      //split the mergehints
      let mergehints = {};
      mergehints[serviceName] = {};
      mergehints[serviceName][primaryKey] = person.merge[serviceName][primaryKey];
      delete person.merge[serviceName][primaryKey];
      if([i for (i in person.merge[serviceName])].length == 0)
        delete person.merge[serviceName];

      //copy each other's mergehints
      let copyold = Utils.deepCopy(person.merge);
      let copynew = Utils.deepCopy(mergehints);
      //set them to false
      setMergeHints(copyold, false);
      setMergeHints(copynew, false);
      //put them in
      mergeMergeHints(mergehints, copyold);
      mergeMergeHints(person.merge, copynew);
      
      let query = "INSERT INTO people (guid, json) VALUES (:guid, :json)";
      
      let obj = {
        guid: guid,
        documents: documents,
        schema: "http://labs.mozilla.com/schemas/people/2",
        merge: mergehints
      };
      let params = {
        guid: guid,
        json: JSON.stringify(obj)
      };
      stmt = this._dbCreateStatement(query, params);
      stmt.execute();
      let person_id = this._db.lastInsertRowID;
      this._log.debug("Updating indexes for new person: " + person_id + "\n");
      this._updateIndexed(person_id, new Person(obj));
      this._updateMergeHintsIndexed(person_id, new Person(obj));
      
      //update old person
      this._log.debug("Updating indexes for old person:\n");
      this._update(person, false);
      this._db.commitTransaction();
      Observers.notify("people-add", {guid:guid});
      Observers.notify("people-update", {guid:oldGUID});
      
    } catch (e) {
      this._log.warn("split failed: " + Utils.exceptionStr(e));
    } finally {
      if (stmt)
      stmt.reset();
    }
    this._log.debug("Finished People.split");
    
    return null;
    
  },

  /** Given a raw person (object with documents slot), or array of same
   *objects, update the database so that all the entries in the DB whose
   * GUIDs match those of the given Person records have the
   * same JSON value. */
  _update: function _update(person, newTransaction) {
    if (Utils.isArray(arguments[0]))
      return Utils.mapCall(this, arguments, _update).filter(function(i) i != null);
      
    if(newTransaction == undefined) newTransaction = true;

    let stmt;
    try {
      if (!person.guid)
        throw "person object must contain a guid";

      if(newTransaction) this._db.beginTransaction();

      // Find the row ID for this person by searching on GUID
      let query = "SELECT * FROM people WHERE guid = :guid";
      let params = { guid: person.guid };
      stmt = this._dbCreateStatement(query, params);

      let id;
      while (stmt.step()) { id = stmt.row.id; }
      if (!id) throw "no object for guid " + person.guid;
      stmt.reset();

      query = "UPDATE people SET json = :json WHERE id = :id";
      params = {
        id: id,
        json: JSON.stringify(person)
      };
      stmt = this._dbCreateStatement(query, params);
      stmt.execute();

      this._updateMergeHintsIndexed(id, new Person(person));
      this._updateIndexed(id, new Person(person));
      if(newTransaction) this._db.commitTransaction();

    } catch (e) {
      this._log.warn("_update failure: " + Utils.exceptionStr(e));
      if(newTransaction) this._db.rollbackTransaction();
      return {error: e.message, person: person};

    } finally {
      if (stmt)
        stmt.reset();
    }

    Observers.notify("people-update", {guid:person.guid});
    return null;
  },

  // Merges two different documents
  mergeDocuments: function merge(destDocument, sourceDocument) {
    function objectEquals(obj1, obj2) {
        for (var i in obj1) {
            if (obj1.hasOwnProperty(i)) {
                if (!obj2.hasOwnProperty(i)) return false;
                if (obj1[i] != obj2[i]) return false;
            }
        }
        for (var i in obj2) {
            if (obj2.hasOwnProperty(i)) {
                if (!obj1.hasOwnProperty(i)) return false;
                if (obj1[i] != obj2[i]) return false;
            }
        }
        return true;
    }


    // TODO: Need to get more sensible approach to cardinality.
    // e.g. What if we get two displayNames?
    
    for (let attr in sourceDocument) {
      if (sourceDocument.hasOwnProperty(attr)) {
        var val = sourceDocument[attr];
        
        if (!destDocument.hasOwnProperty(attr)) {
          // TODO right now, first one wins.  Need a more sensible approach.
          destDocument[attr] = val;
        } 
        else
        {
          if (Utils.isArray(val))
          {
            if (Utils.isArray(destDocument[attr]))
            {
              // two arrays, and we need to check for object equality...
              for (index in val) {
                var newObj = val[index];

                // Are any of these objects equal?
                var equalObjs = destDocument[attr].filter(function(item, idx, array) {
                  if (item.hasOwnProperty("type") && item.hasOwnProperty("value") &&
                      newObj.hasOwnProperty("type") && newObj.hasOwnProperty("value"))
                  {
                    // special-case for type-value pairs.  If the value is identical,
                    // we may want to discard one of the types -- unless they have
                    // different rels.
                    if (newObj.value == item.value) {
                      if (newObj.type == item.type) {
                        if ((newObj.rel == undefined && item.rel == undefined) || (newObj.rel && newObj.rel == item.rel)) {
                          return true;
                        }
                      } else if (newObj.type == "internet" || newObj.type == "unlabeled") {// gross hack for Google, Yahoo, etc.
                        newObj.type = item.type;
                        return true;
                      } else if (item.type == "internet" || item.type == "unlabeled") {
                        item.type = newObj.type;
                        return true;
                      } else {
                        // Could, potentially, combine the types?
                        return false;
                      }
                    }
                  }
                  else
                  {
                    return objectEquals(item, newObj)}
                  }
                );
                if (equalObjs.length == 0) { // no match, go ahead...
                  destDocument[attr].push(val[index]);
                }
              }
            }
            else
            {
              // log oddity: one was list, one not
            }
          }
        }
      }
    }
  },

  // removes GUIDs with these attributes
  remove: function remove(attrs) {
    if (Utils.isArray(arguments[0]))
      return Utils.mapCall(this, arguments, remove);

    let guids = this._find("guid", attrs);
    this.removeGUIDs(guids);
    return guids.length;
  },
  
  removeGUIDs: function removeGUIDs(guids) {
    guids.forEach(function(guid) {
      let param = { guid: guid };
      Observers.notify("people-before-remove", {guid:guid});

      // Remove each indexed field
      for each (let index in this._dbSchema.index_tables)
        this._dbCreateStatement("DELETE FROM " + index + " WHERE person_id = " +
          "(SELECT id FROM people WHERE guid = :guid)", param).execute();
          
      this._dbCreateStatement("DELETE FROM mergeHints WHERE person_id = " +
          "(SELECT id FROM people WHERE guid = :guid)", param).execute();

      // Remove the people entry
      this._dbCreateStatement("DELETE FROM people WHERE guid = :guid", param).
        execute();

      Observers.notify("people-remove", {guid:guid});
    }, this);
    return guids.length;
  },  
  
  // Find used for external query -> navigator.service.contacts.find
  findExternal: function findExternal(fields, successCallback, failureCallback, options, groupList){
    
    let query = "SELECT json FROM people";
    
    if(!options) options = {};

    if(options.updatedSince){
      let date = Math.round((Date.parse(options.updatedSince))/1000);
      if(date) query += " WHERE modified > datetime(" + date + ", 'unixepoch')";
    }

    // Look up the results, filtering on indexed terms
    let result;
    try {
      result = Utils.getRows(this._dbCreateStatement(query));
    }
    catch(ex) {
      this._log.error("find failed during query: " + Utils.exceptionStr(ex));
      return [];
    }
    
    let limit = -1;
    if(options.multiple != undefined && options.multiple == false) limit = 1;
    else if(options.limit) limit = options.limit;
    
    let groupsIncludeAll = (groupList) ? groupList.indexOf(ALL_GROUP_CONSTANT) >= 0 : true;
    
    let outputSet = [];
    let hasPartialMatch;
    let regstring = (options.filter) ? options.filter : "";
    let re = new RegExp(".*" + regstring + ".*", "i");
      
    // test if it matches the filter
    let testMatch = function(thing, prefix) {
      if (typeof(thing) == 'string'){
        if(!options.filter || re.test(thing)) return [thing, prefix];
        return null;
      } else if (typeof(thing) != "object" || thing == null)
        return null;
      
      if(Utils.isArray(thing)) thing = thing[0];
      
      for each (let [key, value] in Iterator(thing)) {
        let tmp = testMatch(value, prefix + "." + key);
        if(tmp) return tmp;
      }
      return null;
    }
    
    for each (let obj in result) {
      let p = new Person(JSON.parse(obj));
      
      //filter out people with no documents
      if([i for (i in p.obj.documents)].length == 0) continue;
      
      let allowServices = false;
      let personTags = p.getProperty("tags");
      if (groupsIncludeAll || 
         (personTags && groupList.some(function(e,i,a) { return personTags.indexOf(e) >= 0;}))){
        let newPerson = {"__sortArr__":[]};
        hasPartialMatch = false;
      
        for each (f in fields) {
          if(f == "Services") {
            allowServices = true;
            continue;
          }
      
          let value = p.getProperty(f, ".");
      
          if (f.indexOf(".") > 0) {
            let terms = f.split(".");
            let obj = newPerson;
            for (var i=0;i<terms.length-1;i++) {
              if (!(terms[i] in obj)) {
                obj[terms[i]] = {};
              }
              obj = obj[terms[i]];
            }
            obj[terms[i]] = value;
          } else {
            newPerson[f] = value;
          }
        
          let check = testMatch(value, f)
          let matched = (check != null);
          hasPartialMatch = matched || hasPartialMatch;
        
          if(matched) 
            newPerson["__sortArr__"].push([SORT_WEIGHTS[check[1]], check[0]]);
        }
      
        if(hasPartialMatch){
          newPerson["__sortArr__"].sort(function(a,b){
            let weight_a = a[0];
            let weight_b = b[0];
            return weight_a > weight_b;
          });
          if(allowServices){
            newPerson.services = p.constructServices();
            newPerson.servicesByProvider = p.constructServicesByProvider();
          }
          outputSet.push(newPerson);
        } 

        if(limit > 0 && outputSet.length >= limit) break;
      }
    }
    
    let people = outputSet;
    people.sort(function(a,b) {
      try {
        let aindex = 0;
        let bindex = 0;
        let aarr = a["__sortArr__"];
        let barr = b["__sortArr__"];
       
        //advances one by one through the sort arrays, until one runs out, one is bigger than the other
        //by the sort algorithm
        while(true){
          if(aindex >= aarr.length && bindex >= barr.length) break;
          else if(bindex >= barr.length) return -1;
          else if(aindex >= aarr.length) return 1;
          if(aarr[aindex][0] != barr[bindex][0]) return (aarr[aindex][0] > barr[bindex][0]) ? 1 : -1;
          let comp = aarr[aindex][1].localeCompare(barr[bindex][1]);
          if(comp != 0) return comp;
          aindex++;
          bindex++;
       }
       return 0;
       
      } catch (e) {
        People._log.warn("Sort error: " + e);
        dump(e.stack + "\n");
        return -1;
      }
    });
    
    people.map(function(p) { delete p["__sortArr__"]; });
    
    try {
      if(successCallback) successCallback(people);
    } catch(ex) {
      Components.utils.reportError(ex);
    }
  },

  find: function find(attrs) {
    let results = this._find("json", attrs).map(function(json) {let p = JSON.parse(json); return new Person(p);});
    let matches = [];
    results.map(function(result){if([i for (i in result.obj.documents)].length > 0) matches.push(result)});
    return matches;
  },
  
  // Wrapper ofr find with a callback for internal functions
  findCallback: function findCallback(attrs, successCallback, errorCallback) {
    let people = this.find(attrs);
    try {
      if(successCallback) successCallback(people);
    } catch(ex) {
      if(errorCallback) errorCallback("Error occured during find.");
      Components.utils.reportError(ex);
    }
  },

  // Internal find using attributes
  _find: function _find(col, attrs) {
    attrs = attrs || {};

    let terms = 0;
    let joins = [];
    let wheres = [];
    let params = {};

    // Special case GUID finds
    if ("guid" in attrs) {
      wheres.push("guid = :guid");
      params.guid = attrs.guid;
    }

    // Build query parts for joined indexed terms
    let addTerm = function addTerm(val, table) {
      if (Utils.isArray(arguments[0]))
        return Utils.mapCall(this, arguments, addTerm);

      let alias = "t" + terms;
      joins.push("JOIN " + table + " " + alias + " ON " + alias +
        ".person_id = p.id");

      // val starting with '=' is equality; anything else is substring
      if (val.length > 1 && val[0] == '=') {
        wheres.push(alias + ".val = :p" + terms);      
        params["p" + terms] = val.slice(1);
      } else {
        wheres.push(alias + ".val LIKE :p" + terms + " ESCAPE '/'");
        params["/p" + terms] = val;
      }
      terms++;
    };

    // Add the index term for the ones we know about
    for each (let index in this._dbSchema.index_tables)
      if (index in attrs)
        addTerm.call(this, attrs[index], index);

    let query = "SELECT " + col + " FROM people p";
    if (joins.length > 0)
      query += " " + joins.join(" ");
    if (wheres.length > 0)
      query += " WHERE " + wheres.join(" AND ");

    // Look up the results, filtering on indexed terms
    let result;
    try {
      result = Utils.getRows(this._dbCreateStatement(query, params));
    }
    catch(ex) {
      this._log.error("find failed during query: " + Utils.exceptionStr(ex));
      return [];
    }

    // Post-process to do the find on non-indexed fields
    for (let attr in attrs) {
      if (attr == "guid" || this._dbSchema.index_tables.indexOf(attr) != -1)
        continue;
      let val = attrs[attr];

      let matchSet = []
      for each (let obj in result) {
        try {
          let parsed = JSON.parse(obj);
          for each (let svcs in parsed.documents) {
            for each(let d in svcs){
              if (d && d[attr] && d[attr] == val) {
                matchSet.push(obj);
                break;
              }
            }
          }
        } catch (e) {
          // silent fail on malformed records right now
        }
      }
      result = matchSet;
    }
    return result;
  },

  connectedServices : function connectedServices() {
    var svcs = {};
    var stmt = this._dbCreateStatement("SELECT * FROM service_metadata");
    try{
      stmt.reset();
      while (stmt.step()) {  
        let svcname = stmt.row.servicename;
        let refresh = stmt.row.refresh;  
        svcs[svcname] = { refresh: new Date(refresh) }
      }
      return svcs;
    } catch (e) {
      this._log.warn("Unable to perform service lookup: " + e);
    } finally {
      stmt.reset();
    }
  },

  // Connect a service
  connectService: function importFromService(svcName, completionCallback, progressFunction, window) {

    // note that this could cause an asynchronous call
    Cu.import("resource://people/modules/import.js");    
    let svc = PeopleImporter.getBackend(svcName);
    let that = this;
    if (svc) {
      svc.import(
        function(error) { 
          if (!error) that.markServiceRefreshTimestamp(svcName);
          completionCallback(error);
        }, progressFunction, window);
    }
    Observers.notify("people-connectService", {name:svcName});
  },
  
  // Disconnect a service
  disconnectService: function disconnectService(svcName) {
    Cu.import("resource://people/modules/import.js");    
    this._log.debug("Disconnecting " + svcName);
    
    try {
      let svc = PeopleImporter.getBackend(svcName);
      svc.disconnect();
    } catch (e) {
      this._log.debug("Error while disconnecting from " + svcName + ": " + e);    
    }
    this.removeServiceData(svcName);
    Observers.notify("people-disconnectService", {name:svcName});
  },
  
  removeServiceData: function removeServiceData(svcName) {
    let allPeople = this.find();
    this._db.beginTransaction();
    for each (let p in allPeople) {
      if (p.obj.documents[svcName]) {
        delete p.obj.documents[svcName];
        this._removeDiscoveryDataFromDocuments(p.obj.documents);
        this._log.debug("Removing " + svcName + " data from " + p.guid + "; updating");
        this._update(p.obj, false);
      }
    }
    this._db.commitTransaction();
    this.deleteServiceMetadata(svcName);
  },
  
  // Internal Helper Method
  _removeDiscoveryDataFromDocuments: function(documents){
    let any = false;
    for (let key in documents) {
      if (!PeopleImporter.isBackend(key))
      {
        this._log.debug("Removing " + key + " data");
        delete documents[key];
        any = true;
      }
    }
    return any;
  },
  
  // Removes all discovery data fromm a person
  _removeUserDiscoveryData: function(p){
    let any = this._removeDiscoveryDataFromDocuments(p.obj.documents);
    if (any)
    {
      this._log.debug("Removing found data from " + p.guid + "; updating");
       this._update(p.obj);
    }
  },

  // Remove all discovery data from everyone
  removeDiscoveryData: function () {
    let allPeople = this.find();
    for each (let p in allPeople) {
      this._removeUserDiscoveryData(p);
    }
  },

  markServiceRefreshTimestamp : function markServiceRefreshTimestamp(svcName) {
    try {
      let params = {
        svcname: svcName,
        refreshTime: new Date().getTime()
      }
      this._dbCreateStatement("INSERT OR REPLACE INTO service_metadata (servicename, refresh) VALUES (:svcname, :refreshTime)", params).
        execute();
    } catch (e) {
      this._log.warn("Error while saving service_metadata: " + e);
    }
  },

  deleteServiceMetadata : function deleteServiceMetadata(svcName) {
    try {
      let params = {
        svcname: svcName,
      }
      this._dbCreateStatement("DELETE FROM service_metadata WHERE servicename = :svcname", params).
        execute();
    } catch (e) {
      this._log.warn("Error while deleting service_metadata: " + e);
    }
  },

  refreshService: function refreshService(svcName, completionCallback, progressFunction, window) {
    Cu.import("resource://people/modules/import.js");    
    
    // This is not the most efficient way to do this.  What we're doing for now
    // is removing all the documents for the service, saving it back, and then
    // importing all the new records.
    
    // A better solution would be to load all the new records, merge them OVER the
    // existing records, and then delete all documents for the service that were
    // in records that were not just touched.
    this.removeServiceData(svcName);
    this.connectService(svcName, completionCallback, progressFunction, window);
  },
  
  doDiscovery: function doDiscovery(svcName, personGUID, completionCallback, progressFunction) {
    this._log.info("Running discovery.");
    Cu.import("resource://people/modules/import.js");    
    var personResultSet = this._find("json", {guid:personGUID}).map(function(json) {return new Person(JSON.parse(json));});
    
    let discoverer = PeopleImporter.getDiscoverer(svcName);
    let that = this;
    if (discoverer) {
      PeopleImporter.getDiscoverer(svcName).discover(
        personResultSet[0], 
        function(newDoc, error) {
          if (newDoc) {          
            that.update(personGUID, discoverer, newDoc);
          }
          completionCallback(error);
        },
        progressFunction);
    }
  },
  
  resetSavedPermissions : function resetSavedPermissions() {
    
    try {
      // first the permissions manager bit
      let permissionManager = Cc["@mozilla.org/permissionmanager;1"].
                              getService(Ci.nsIPermissionManager);
      for (var e = permissionManager.enumerator; e.hasMoreElements(); )
      {
        p = e.getNext().QueryInterface(Ci.nsIPermission);
        if (p.type == "people-find") {
          permissionManager.remove(p.host, p.type);
        }
      }
    } catch (e) {
      this._log.warn("reset site_permissions failed (" + e + ")");
      throw "reset site_permissions failed: " + Utils.exceptionStr(e);
    }
  
    let stmt = null;
    try {
      this._db.beginTransaction();
      stmt = this._dbCreateStatement("DELETE FROM site_permissions;");
      stmt.execute();
      this._db.commitTransaction();
    } catch (e) {
      this._log.warn("reset site_permissions failed (" + e + ")");
      throw "reset site_permissions failed: " + Utils.exceptionStr(e);
    } finally {
      if (stmt) stmt.reset();
    }
    return null;
  },
  
  storeSitePermissions: function storeSiteFieldPermissions(site, permissionList, groupList) {
    let stmt = null;
    try {

      this._db.beginTransaction();
      let params = {
        url: site,
        fields: "" + permissionList, // convert to string if necessary
        groups: "" + groupList
      };
      stmt = this._dbCreateStatement("INSERT OR REPLACE INTO site_permissions (url, fields, groups) VALUES (:url, :fields, :groups)", params);
      stmt.execute();
      this._db.commitTransaction();
      
    } catch (e) {
      this._log.warn("add site_permissions failed (" + e + ")");
      throw "add site_permissions failed: " + Utils.exceptionStr(e);
    } finally {
      if (stmt) stmt.reset();
    }
    return null;
  },
  
  setSessionSitePermissions: function(site, fields, groups) {
    this._sessionPermissions[site] = {
      fields:fields, groups:groups
    };
  },
  
  removeSessionSitePermissions: function(site){
    delete this._sessionPermissions[site];
  },
  
  /** Given a URL, return an object with 'fields' and 'groups'
   * properties, which are both lists of strings. */
  getSitePermissions: function getSitePermissions(site) {
    let stmt = null;
    let result = null;
    try {
      // First check session permissions:
      if (this._sessionPermissions[site])
      {
        return this._sessionPermissions[site];
      }

      let query = "SELECT fields,groups FROM site_permissions WHERE url = :url";

      // Look up the results, filtering on indexed terms
      try {
        let params = {url:site};
        stmt = this._dbCreateStatement(query, params);
        if (stmt.step()) {
          result = {fields:stmt.row.fields.split(','), groups:stmt.row.groups.split(',')};
        }
      }
      catch(ex) {
        this._log.error("getSiteFieldPermissions failed during query: " + Utils.exceptionStr(ex));
        return null;
      }
      
    } catch (e) {
      this._log.warn("get site_permissions failed");
      throw "get site_permissions failed: " + Utils.exceptionStr(e);
    } finally {
      if (stmt) stmt.reset();
    }
    return result;
  },
  
  getAllPermissions: function getAllPermissions() {
    let stmt = null;
    var ret = [];
    try {
      let query = "SELECT url,fields,groups FROM site_permissions";
      
      try {
        stmt = this._dbCreateStatement(query);
        stmt.reset();
        while (stmt.step()) {
          ret.push({url:stmt.row.url, fields:stmt.row.fields, groups:stmt.row.groups});
        } 
        stmt.reset();
      }
      catch(ex) {
        this._log.error("getAllPermissions failed during query: " + Utils.exceptionStr(ex));
        return null;
      }
      
    } catch (e) {
      this._log.warn("getAllPermissions failed");
      throw "getAllPermissions failed: " + Utils.exceptionStr(e);
    } finally {
      if (stmt) stmt.reset();
    }
    return ret;
  }
  
};

// Method to bind to person objects after they are pulled from the database:
// See https://wiki.mozilla.org/Labs/Sprints/People for schema
function Person(obj) {
  this._init(obj);
}
Person.prototype = {

  _init: function Person__init(obj) {
    this.obj = obj;
    this.guid = obj.guid;
    this.displayName = this.getProperty("displayName");
  },
  
  // Traverse all the documents of this person,
  // collecting values of aProperty.
  
  // The value of aProperty may contain limited XPath-like
  // syntax.  Specifically, it may contain:
  // * slashes, to indicate subproperties, e.g. "name/givenName"
  // * NOT IMPLEMENTED: [<test>], to indicate subfield selection, e.g. "accounts[domain='twitter.com']"  

  getProperty: function getProperty(aProperty, delimeter) {
    if(delimeter == undefined) delimeter = '/';
    let terms = aProperty.split(delimeter);
    
    let currentSet = [];
    for each (let ids in this.obj.documents) {
      for each (let d in ids) currentSet.push(d);
    }
    
    if (terms.length == 1) { // easy cases
      return this._searchCollection(aProperty, currentSet, "");
    }
    
    let currentPrefix = "";
    for each (let term in terms)
    {
      if (!Utils.isArray(currentSet)) currentSet = [currentSet];
      currentSet = this._searchCollection(term, currentSet, currentPrefix);
      if (currentSet == null) break;
      currentPrefix = currentPrefix + delimeter + term;
    }
    return currentSet;
  },
  constructServicesByProvider: function constructServicesByProvider(){
    let urls = this.getProperty("urls");
    
    // We'll first construct arrays of all the services,
    // and then, if there's more than one, create multiplexing
    // wrapper methods for them.
    let serviceIdentifiersMap = {};

    function addServiceToMap(s) {
      if (!serviceIdentifiersMap[s.methodName]) serviceIdentifiersMap[s.methodName] = {};
      if (!serviceIdentifiersMap[s.methodName][s.domain]) serviceIdentifiersMap[s.methodName][s.domain] = s.method;
    }

    for each (let url in urls)
    {
      if (url.rel)
      {
        let svc = PersonServiceFactory.constructLinkServices(url);
        if (svc) {
          for each (let s in svc) {
            addServiceToMap(s);
          }
        }
      }
      else if (url.feed)
      {
        addServiceToMap(PersonServiceFactory.constructFeedService(url));
      }
    }

    let accounts = this.getProperty("accounts");
    for each (let account in accounts)
    {
      let svc = PersonServiceFactory.constructAccountServices(account);
      if (svc) {
        for each (let s in svc) {
          addServiceToMap(s);
        }
      }
    }

    return serviceIdentifiersMap;
  },

  constructServices: function constructServices()
  {
    let urls = this.getProperty("urls");
    
    // We'll first construct arrays of all the services,
    // and then, if there's more than one, create multiplexing
    // wrapper methods for them.
    let serviceIdentifiersMap = {};

    function addServiceToMap(s) {
      if (!serviceIdentifiersMap[s.methodName]) serviceIdentifiersMap[s.methodName] = {};
      if (!serviceIdentifiersMap[s.methodName][s.identifier]) serviceIdentifiersMap[s.methodName][s.identifier] = s;
    }

    for each (let url in urls)
    {
      if (url.rel)
      {
        let svc = PersonServiceFactory.constructLinkServices(url);
        if (svc) {
          for each (let s in svc) {
            addServiceToMap(s);
          }
        }
      }
      else if (url.feed)
      {
        addServiceToMap(PersonServiceFactory.constructFeedService(url));
      }
    }

    let accounts = this.getProperty("accounts");
    for each (let account in accounts)
    {
      let svc = PersonServiceFactory.constructAccountServices(account);
      if (svc) {
        for each (let s in svc) {
          addServiceToMap(s);
        }
      }
    }
    
    // Now flatten it out
    let services = {};
    for (let key in serviceIdentifiersMap) {
      let idMap = serviceIdentifiersMap[key];
      let count = 0;
      let s;
      for (id in idMap) {
        s = idMap[id];
        count += 1;
      }
      if (count == 1) {
        services[key] = s.method;
      } else {
        services[key] = function() {
          for each (let s in idMap) {
            s.method.apply(null, arguments);
          }
        }
      }
    }

    return services;
  },

  // Internal function: given an array of field-addressible objects,
  // searches for the given property in all of them.
  _searchCollection: function _searchCollection(property, collection, propertyNameContext)
  {
    let returnValue = null;
    for (anIndex in collection)
    {
      let anObject = collection[anIndex];
      if (anObject[property]) {
        if (returnValue) {
          returnValue = this._mergeFields(propertyNameContext + property, returnValue, anObject[property]);
        } else {
          if (Utils.isArray(anObject[property])) {
            // need to make a shallow copy of the array, so we can merge into it later...
            returnValue = anObject[property].slice(0);
          } else {
            returnValue = anObject[property];
          }
        }
      }
    }
    return returnValue;  
  },
  
  // Given two values, returns their union according to the rules of <fieldName>.
  _mergeFields: function mergeFields(fieldName, currentValue, newValue) {
    // TODO: We should be prescriptive about cardinality here.
    // For now we just merge lists.
    if (Utils.isArray(currentValue))
    {
      if (Utils.isArray(newValue))
      {
        // two arrays, and we need to check for object equality...
        for (index in newValue) {
          var newObj = newValue[index];

          // Do any of the objects in newValue match newObj?
          var equalObjs = currentValue.filter(function(item, idx, array) 
          {
            if (item.hasOwnProperty("type") && item.hasOwnProperty("value") &&
                newObj.hasOwnProperty("type") && newObj.hasOwnProperty("value"))
            {
              // special-case for type-value pairs.  If the value is identical,
              // we may want to discard one of the types -- unless they have
              // different rels.
              if (newObj.value == item.value) {
                if (newObj.type == item.type) {
                  if (newObj.rel && item.rel) {
                    return (newObj['rel'] == item.rel);
                  } else {
                    return true;
                  }
                } else if (newObj.type == "internet") {// gross hack for VCard email
                  newObj.type = item.type;
                  return true;
                } else if (item.type == "internet") {
                  item.type = newObj.type;
                  return true;
                } else {
                  // Could, potentially, combine the types?
                  return false;
                }
              }
            }
            else
            {
              return objectEquals(item, newObj)}
            }
          );

          if (equalObjs.length == 0) { // no match, go ahead...
            currentValue.push(newObj);
          } else {
            // yes, merge values into equalObjs[0]...
            this._mergeObject(equalObjs[0], newObj);
          }
        }
      }
      else
      {
        People._log.info("Cardinality error: property " + fieldName + " is a list in one document, and a field in another");
      }
    }
    
    // If it's not a list, first one wins.  TODO: Do better than that.
    return currentValue;
  },
  
  _mergeObject: function(to, from) {
    // existing values win.
    for (let key in from) {
      if (!to[key]) to[key] = from[key];
    }
  },
  
  // If Activities is present, register this user's activity streams with it
  follow: function(progressCallback) {
    if (Activities)
    {
      let progressCounter = 0;
      let progressFn = function(result) {
        progressCounter -= 1;
        if (result.success && result.id) {
          let theSource = Activities.getSourceByID(result.id);
          if (theSource) theSource.update(progressCallback); // kick off a refresh right away
        }
        progressCallback(progressCounter);
      }
      var urls = this.getProperty("urls");
      for each (url in urls) {
        if (url.atom) {
          progressCounter += 1;
          Activities.addSource("person:" + this.guid, "atom", url.value, progressFn);
        } else if (url.rss) {
          progressCounter += 1;
          Activities.addSource("person:" + this.guid, "rss", url.value, progressFn);
        } else if (url.value.indexOf("http") == 0) {
          progressCounter += 1;
          Activities.addSource("person:" + this.guid, null, url.value, progressFn);
        }
      }
    }
  }
  
  
};

function objectEquals(obj1, obj2) {
  for (var i in obj1) {
      if (obj1.hasOwnProperty(i)) {
          if (!obj2.hasOwnProperty(i)) return false;
          if (obj1[i] != obj2[i]) return false;
      }
  }
  for (var i in obj2) {
      if (obj2.hasOwnProperty(i)) {
          if (!obj1.hasOwnProperty(i)) return false;
          if (obj1[i] != obj2[i]) return false;
      }
  }
  return true;
}

function PersonServiceFactoryService() {
  this._relTable = {};
  this._domainTable = {};
  this._defaultUI = {};
}
PersonServiceFactoryService.prototype = {
  registerLinkService: function register(rel, constructor) {
    if (this._relTable[rel]) this._relTable[rel].push(constructor);
    else this._relTable[rel] = [constructor];
  },

  registerAccountService: function register(domain, constructor) {
    if (this._domainTable[domain]) this._domainTable[domain].push(constructor);
    else this._domainTable[domain] = [constructor];
  },

  registerServiceDefaultUI: function registerServiceDefaultUI(methodName, uiHandler) {
    this._defaultUI[methodName] = uiHandler;
  },
  
  constructLinkServices: function constructService(urlObject) {
    // urlObject has 'rel', 'type', and 'value' fields (at least)
    let constructors = this._relTable[urlObject.rel];
    if (constructors) {
      let ret = []
      for each (let c in constructors) {
        let object = c(acctObject);
        if(!object.domain) object.domain = acctObject.domain;
        ret.push(object);
      }
      return ret;
    } else {
      return null;
    }
  },

  constructAccountServices: function constructService(acctObject) {
    // acctObject has 'domain', 'username', and maybe a  'userid' field
    let constructors = this._domainTable[acctObject.domain];
    if (constructors) {
      let ret = []
      for each (let c in constructors) {
        let object = c(acctObject);
        if(!object.domain) object.domain = acctObject.domain;
        ret.push(object);
      }
      return ret
    } else {
      return null;
    }
  },
  
  // Feeds are a special case since they don't need any per-importer logic.
  constructFeedService: function constructFeedService(urlObject) {
    return {
      identifier: "feed:updates:" + urlObject.feed,
      methodName: "updates",
      method: function(callback) {
        try {
          let url = urlObject.feed;
          let xhr = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);  
          xhr.open('GET', url, true);
          xhr.onreadystatechange = function(aEvt) {
            if (xhr.readyState == 4) {
              if (xhr.status == 200) {
                let parser = Components.classes["@mozilla.org/feed-processor;1"].createInstance(Components.interfaces.nsIFeedProcessor);

                let theURI = IO_SERVICE.newURI(urlObject.value, null, null);
                let pageTitle, title;
                try {
                  pageTitle = HISTORY_SERVICE.getPageTitle(theURI);
                } catch(e) {}
                if (pageTitle && pageTitle.length > 0 && pageTitle[0] != '/') {
                  title = pageTitle;
                } else {
                  title = theURI.spec;
                }

                try {
                  parser.listener = {
                  
                    handleResult: function(result) {
                      var feed = result.doc;
                      feed.QueryInterface(Components.interfaces.nsIFeed);
                      let updates = [];
                      for (i=0; i<feed.items.length; i++) {
                        try {
                          let update = {};
                          var theEntry = feed.items.queryElementAt(i, Components.interfaces.nsIFeedEntry);
                          var date = theEntry.updated ? theEntry.updated : (theEntry.published ? theEntry.published : null);
                          if (date) {
                            update.time = new Date(date);
                          }
                          update.text = theEntry.title.plainText();
                          update.source = title;
                          update.sourceLink = url.value;
                          if (theEntry.link) update.link = theEntry.link;
                          updates.push(update);
                        } catch (e) {
                          People._log.error(e);
                        }
                      }
                      callback(updates);
                    }
                  };
                  parser.parseFromString(xhr.responseText, IO_SERVICE.newURI(urlObject.value, null, null));
                } catch (e) {
                  People._log.error("feed import error: " + e);
                }
              }
            }
          };
          xhr.send(null);
        } catch (e) {
          People._log.error("feed service error: " + e);
        }
      }
    };
  },
  
  getServiceDefaultUI: function getServiceDefaultUI(serviceMethod) {
    return this._defaultUI[serviceMethod];
  }
}
let PersonServiceFactory = new PersonServiceFactoryService();


function constructDataVaultGetService(url) {
  return {
    methodName: "getData",

    method: function(dataKey, callback) {
      let load = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);
      load.open('GET', url.value + "/" + dataKey, false);
      load.send(null);
      let response = JSON.parse(load.responseText);
      callback(response);
    }
  };
}

function constructDataVaultPostService(url) {
  return {
    methodName: "addData",
    method: function(dataKey, data, callback) {
      let load = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);
      load.open('POST', url.value + "/" + dataKey, false);
      load.send("data=" + escape(JSON.stringify(data)));
      callback();
    }
  };
}

function constructDataVaultPostAuthenticatedService(url) {
  return {
    methodName: "addDataAuth",
    method: function(dataKey, data, accessKey, callback) {
      let load = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);
      load.open('POST', url.value + "/" + dataKey, false);
      load.send("accesskey=" + escape(accessKey) + "&data=" + escape(JSON.stringify(data)));
      callback();
    }
  };
}


PersonServiceFactory.registerLinkService("http://mozillalabs.com/experimental/data_vault_1", constructDataVaultGetService);
PersonServiceFactory.registerLinkService("http://mozillalabs.com/experimental/data_vault_1", constructDataVaultPostService);
PersonServiceFactory.registerLinkService("http://mozillalabs.com/experimental/data_vault_1", constructDataVaultPostAuthenticatedService);

PersonServiceFactory.registerServiceDefaultUI("pictureCollectionsBy", function(person, container) {
  container.innerHTML = "";
  if (person.services.pictureCollectionsBy) {
    let collectionArray = [];
    //dump("invoking person.services.pictureCollectionsBy\n");
    
    let thumbnailRetrievalQueue = [];
    person.services.pictureCollectionsBy(function(collections) {
      collectionArray = collectionArray.concat(collections);
      container.innerHTML = "";
      for each (let c in collectionArray)
      {
        let d= container.ownerDocument.createElement("div");

        d.setAttribute("class", "picture_collection");
        d.setAttribute("style", "display: inline-block; width: 180px; text-align: center; vertical-align: top;margin-bottom:6px");

        let link = container.ownerDocument.createElement("a");
        link.setAttribute("href", c.homeURL);
        link.setAttribute("target", "_blank");
        link.setAttribute("style", "color:black; text-decoration:none");
        d.appendChild(link);

        let thumbnailDiv = container.ownerDocument.createElement("div");
        thumbnailDiv.setAttribute("style", "height:80px; width: 80px; text-align: center; margin: auto auto 4px; -moz-border-radius: 6px; border: 1px solid #D0D0D0; padding: 6px");
        let thumbnail = container.ownerDocument.createElement("img");

        if (c.primaryPhotoThumbnailURL) thumbnail.src = c.primaryPhotoThumbnailURL;
        else {
          thumbnailRetrievalQueue.push({img:thumbnail, collection:c});
        }
        thumbnail.setAttribute("border", "0");
        thumbnail.setAttribute("style", "background-color:#E0D8D8;max-width:75px;max-height:75px");
        thumbnailDiv.appendChild(thumbnail);
        link.appendChild(thumbnailDiv);

        let nameDiv = container.ownerDocument.createElement("div");
        nameDiv.appendChild(container.ownerDocument.createTextNode(c.name));
        link.appendChild(nameDiv);
        
        if (c.location) {
          let locDiv = container.ownerDocument.createElement("div");
          locDiv.appendChild(container.ownerDocument.createTextNode(c.location));
          link.appendChild(nameDiv);
        }
        container.appendChild(d);
      }
      
      if (thumbnailRetrievalQueue.length > 0) 
      {
        for each (let thumb in thumbnailRetrievalQueue)
        {
          let targetImg = thumb.img;
          thumb.collection.getPhotos(function render(photos) {
            targetImg.src = photos[0].photoThumbnailURL;
          });
        }
      }
    });
  }
});

PersonServiceFactory.registerServiceDefaultUI("picturesOf", function(person, container) {
  container.innerHTML = "";
  if (person.services.picturesOf) {
    let pictureArray = [];
    //dump("invoking person.services.picturesOf\n");
    person.services.picturesOf(function(pictures) {
      pictureArray = pictureArray.concat(pictures);
      container.innerHTML = "";
      for each (let pic in pictureArray)
      {
        //dump("Got pic: " + JSON.stringify(pic) + "\n");
      
        let d= container.ownerDocument.createElement("div");

        d.setAttribute("class", "pictures");
        d.setAttribute("style", "display: inline-block; width: 180px; text-align: center; vertical-align: top;margin-bottom:6px");

        let link = container.ownerDocument.createElement("a");
        link.setAttribute("href", pic.homeURL);
        link.setAttribute("target", "_blank");
        link.setAttribute("style", "color:black; text-decoration:none");
        d.appendChild(link);

        let thumbnailDiv = container.ownerDocument.createElement("div");
        thumbnailDiv.setAttribute("style", "height:80px; width: 80px; text-align: center; margin: auto auto 4px; -moz-border-radius: 6px; border: 1px solid #D0D0D0; padding: 6px");
        let thumbnail = container.ownerDocument.createElement("img");

        if (pic.photoThumbnailURL) thumbnail.src = pic.photoThumbnailURL;
        thumbnail.setAttribute("border", "0");
        thumbnail.setAttribute("style", "background-color:#E0D8D8;max-width:75px;max-height:75px");
        thumbnailDiv.appendChild(thumbnail);
        link.appendChild(thumbnailDiv);

        if (pic.name) {
          let nameDiv = container.ownerDocument.createElement("div");
          nameDiv.appendChild(container.ownerDocument.createTextNode(pic.name));
          link.appendChild(nameDiv);
        }
        
        if (pic.location) {
          let locDiv = container.ownerDocument.createElement("div");
          locDiv.appendChild(container.ownerDocument.createTextNode(pic.location));
          link.appendChild(nameDiv);
        }
        container.appendChild(d);
      }
    });
  }
});


PersonServiceFactory.registerServiceDefaultUI("updates", function(person, container) {
    container.innerHTML = "";
    if (person.services.updates) {
      let updateArray = [];
      dump("invoking person.services.updates\n");
      person.services.updates(function(updates) {
        for each (let update in updates){
          update.source = [update.source];
          if(update.sourceLink) update.sourceLink = [update.sourceLink];
          else update.sourceLink = [""];
        }
        updateArray = updateArray.concat(updates);
        container.innerHTML = "";
        
        updateArray.sort(function timeCompare(a,b) {
          if (a.time && b.time) {
            return b.time - a.time;
          } else if (a.time) {
            return -1;
          } else if (b.time) {
            return 1;
          } else {
            return a.text.localeCompare(b.text);
          }
        });
        for(let i = 0; i < updateArray.length;i++){
          if(i + 1 < updateArray.length &&updateArray[i].text.substring(0,97) == updateArray[i + 1].text.substring(0,97)){
          dump("merging entry " + i + "\n");
          updateArray[i].source.push(updateArray[i+1].source[0]);
          updateArray[i].sourceLink.push(updateArray[i+1].sourceLink[0]);
          if(updateArray[i].text.length < updateArray[i+1].text.length)
            updateArray[i].text = updateArray[i+1].text;
          updateArray.splice(i + 1, 1);
          i--;
          }
        }
        for each (let upd in updateArray)
        {
        
          dump("" + JSON.stringify(upd) + "\n");
        
          let d= container.ownerDocument.createElement("div");
          d.setAttribute("class", "update");
          d.setAttribute("style", "font:caption;padding-top:4px;padding-bottom:4px;border:1px dotted #E0E0E0;width:90%;");

          if ((upd.type == "photo" || upd.type == "music") && upd.picture) {
            let photo = container.ownerDocument.createElement("div");
            photo.setAttribute("style", "display:inline-block;padding-right:8px");
            let img = container.ownerDocument.createElement("img");
            img.setAttribute("src", upd.picture)
            if(upd.type == "music") img.setAttribute("style", "width:64px;");
            photo.appendChild(img);
            d.appendChild(photo);
          }

          let textDiv = container.ownerDocument.createElement("div");
          textDiv.setAttribute("style", "display:inline-block; vertical-align:top");
          if (upd.link) {
            let titleLink = container.ownerDocument.createElement("a");
            if (upd.link.spec) {
              titleLink.setAttribute("href", upd.link.spec);
            } else {
              titleLink.setAttribute("href", upd.link);
            }
            titleLink.setAttribute("target", "_blank");
            titleLink.setAttribute("style", "color:black;text-decoration:none");
            titleLink.appendChild(container.ownerDocument.createTextNode(upd.text));
            textDiv.appendChild(titleLink);
          } else {  
            textDiv.appendChild(container.ownerDocument.createTextNode(upd.text));
          }
          
          let timestamp = container.ownerDocument.createElement("span");
          timestamp.setAttribute("style", "padding-left:8px;font:caption;font-size:90%;color:#909090");
          timestamp.appendChild(container.ownerDocument.createTextNode(formatDate(upd.time)));
          textDiv.appendChild(timestamp);
          
          let src = container.ownerDocument.createElement("span");
          src.setAttribute("style", "font:caption;font-size:90%;color:#909090");
          src.appendChild(container.ownerDocument.createTextNode(" from "));
          
          for(let i = 0; i < upd.source.length;i++){
            
            if(i>0) src.appendChild(container.ownerDocument.createTextNode(", "));
            
            if(upd.sourceLink[i] != ""){
            
              let srcLink = container.ownerDocument.createElement("a");
              srcLink.setAttribute("href", upd.sourceLink[i]);
              srcLink.setAttribute("target", "_blank");
              srcLink.setAttribute("style", "color:#909090");
      
              srcLink.appendChild(container.ownerDocument.createTextNode(upd.source[i]));
              
              src.appendChild(srcLink);
            
            } else {
              src.appendChild(container.ownerDocument.createTextNode(upd.source[i]));
            }
          }
          
          textDiv.appendChild(src);
          
          d.appendChild(textDiv);
          container.appendChild(d);
        }
      });
    }
  });

PersonServiceFactory.registerServiceDefaultUI("sendPrivateMessageTo", function(person, container) {
  container.innerHTML = "";
  if(person.servicesByProvider.sendPrivateMessageTo){
    let form = container.ownerDocument.createElement("form");
    let input = container.ownerDocument.createElement("input");
    input.setAttribute("id", "sendPrivateMessageTo_default_input_text");
    input.setAttribute("type", "text");
    let select = container.ownerDocument.createElement("select");
    select.setAttribute("id", "sendPrivateMessageTo_domain_select");
    let count = 0;
    for each (let domain in Iterator(person.servicesByProvider.sendPrivateMessageTo)){
      let option = container.ownerDocument.createElement("option");
      option.innerHTML = domain[0];
      option.setAttribute("value", domain[0]);
      select.appendChild(option);
      count++;
    }
    if(count == 1) select.setAttribute("disabled", "disabled");
    let button = container.ownerDocument.createElement("input");
    button.setAttribute("type", "button");
    button.setAttribute("value", "Send Message");
    let br = container.ownerDocument.createElement("br");
    let resultArea = container.ownerDocument.createElement("div");
    form.appendChild(input);
    form.appendChild(select);
    form.appendChild(button);
    form.appendChild(br);
    form.appendChild(resultArea);
    container.appendChild(form);

    button.onclick = function() {
      person.servicesByProvider.sendPrivateMessageTo[select.value](input.value, function(status) {
        if(status.status == "ok") resultArea.innerHTML = "Message sent.";
        else resultArea.innerHTML = status.reason;
      });
    }
  }
});
PersonServiceFactory.registerServiceDefaultUI("sendPublicMessageTo", function(person, container) {
  container.innerHTML = "";
  if(person.servicesByProvider.sendPublicMessageTo){
    let form = container.ownerDocument.createElement("form");
    let input = container.ownerDocument.createElement("input");
    input.setAttribute("id", "sendPublicMessageTo_default_input_text");
    input.setAttribute("type", "text");
    let select = container.ownerDocument.createElement("select");
    select.setAttribute("id", "sendPublicMessageTo_domain_select");
    let count = 0;
    for each (let domain in Iterator(person.servicesByProvider.sendPublicMessageTo)){
      let option = container.ownerDocument.createElement("option");
      option.innerHTML = domain[0];
      option.setAttribute("value", domain[0]);
      select.appendChild(option);
      count++;
    }
    if(count == 1) select.setAttribute("disabled", "disabled");
    let button = container.ownerDocument.createElement("input");
    button.setAttribute("type", "button");
    button.setAttribute("value", "Send Message");
    let br = container.ownerDocument.createElement("br");
    let resultArea = container.ownerDocument.createElement("div");
    form.appendChild(input);
    form.appendChild(select);
    form.appendChild(button);
    form.appendChild(br);
    form.appendChild(resultArea);
    container.appendChild(form);

    button.onclick = function() {
      person.servicesByProvider.sendPublicMessageTo[select.value](input.value, function(status) {
        if(status.status == "ok") resultArea.innerHTML = "Message sent.";
        else resultArea.innerHTML = status.reason;
      });
    }
  }
});


function formatDate(dateStr)
{
  if (!dateStr) return "null";
  
  var now = new Date();
  var then = new Date(dateStr);

  if (then.getDate() != now.getDate())
  {
     var dayDelta = (new Date().getTime() - then.getTime() ) / 1000 / 60 / 60 / 24 // hours
     if (dayDelta < 2) str = "yesterday";
     else if (dayDelta < 7) str = Math.floor(dayDelta) + " days ago";
     else if (dayDelta < 14) str = "last week";
     else if (dayDelta < 30) str = Math.floor(dayDelta) + " days ago";
     else str = Math.floor(dayDelta /30)  + " month" + ((dayDelta/30>2)?"s":"") + " ago";
  } else {
      var str;
      var hrs = then.getHours();
      var mins = then.getMinutes();
      
      var hr = Math.floor(Math.floor(hrs) % 12);
      if (hr == 0) hr =12;
      var mins = Math.floor(mins);
      str = hr + ":" + (mins < 10 ? "0" : "") + Math.floor(mins) + " " + (hrs >= 12 ? "P.M." : "A.M.");
  }
  return str;
}



function DiscoveryCoordinator(person, persist, personUpdatedFn, progressFn, completedFn) {
  this._person = person;
  this._pendingDiscoveryCount = 0;
  this._pendingDiscoveryMap = {};
  this._completedDiscoveryMap = {};
  this._persist = persist;
  this._personUpdatedFn = personUpdatedFn;
  this._progressFn = progressFn;
  this._completedFn = completedFn;
  this._personShouldUpdate = true;
}

/** DiscoveryCoordinator is responsible for invoking discovery
 * engines until we've completed a full spanning walk of the
 * connection graph.
 *
 * The current scheme is as follows:
 *
 *   When start() is called, every engine is invoked on
 * the current person record.  Each engine is responsible 
 * for calling the progressFunction with an an object that
 * has an "initiate" property containing a unique discoveryToken for
 * the discovery task, and a "msg" property containing a human-
 * readable progress message.
 *
 *  If the "initiate" property has been seen before, DiscoveryCoordinator
 * will throw "DuplicatedDiscovery".  Discovery engines are
 * required to watch for and catch this exception silently.
 *
 *  Otherwise the engine may proceed as necessary.  When
 * discovery is complete, the engine is required to call the
 * completionFunction with the new person data and the 
 * same discoveryToken provided in "initiate".
 *
 *  The coordinator will re-initiate discovery when every engine has
 * had a chance to run; this leads to a breadth-first walk through
 * the discovery graph.
*/
DiscoveryCoordinator.prototype = {
  anyPending: function() {
    return this._pendingDiscoveryCount > 0;
  },
  
  setShouldUpdate: function setShouldUpdate(setting) {
    this._personShouldUpdate = setting;
  },
  
  start: function() {
    var discoverers = PeopleImporter.getDiscoverers();
    var that = this;
    if(!this._personShouldUpdate) return;
    for (var d in discoverers) {
      let discoverer = PeopleImporter.getDiscoverer(d);
      if (discoverer) {
        let engine = d;
        try {
          discoverer.discover(this._person, 
            function completion(newDoc, discoveryToken) {
              if(!that._personShouldUpdate) return;
              
              that._pendingDiscoveryCount -= 1;
              if (!discoveryToken) discoveryToken = engine;
              that._completedDiscoveryMap[discoveryToken] = 1;
              
              delete that._pendingDiscoveryMap[discoveryToken];
              if (newDoc) {
                if(!that._person.obj.documents[discoveryToken]) that._person.obj.documents[discoveryToken] = {};
                that._person.obj.documents[discoveryToken][discoverer.getPrimaryKey(newDoc)] = newDoc;
                if (that._persist) {
                  People._update(that._person.obj);
                }
                that._personUpdatedFn(that);
              }
              that._progressFn();
              
              // If we've finished everything, go look again.  Repeat until we start nothing.
              if (that._pendingDiscoveryCount == 0) {
                that._progressFn();
                that.start();
                if (that._pendingDiscoveryCount == 0) {
                  that._completedFn();
                }
              }
            },
            function progress(msg) {
              if(!that._personShouldUpdate) return;
              if (msg.initiate) {
                if (that._completedDiscoveryMap[msg.initiate] ||
                    that._pendingDiscoveryMap[msg.initiate]) throw "DuplicatedDiscovery";

                // Check for a saved discovery: we could potentially put a freshness date on this
                if (that._person.obj.documents[msg.initiate]) {
                  throw "DuplicatedDiscovery";
                }

                that._pendingDiscoveryCount += 1;
                that._pendingDiscoveryMap[msg.initiate] = msg.msg;
                that._progressFn();
              }
            }
          );
        } catch (e) {
          People._log.error("discovery coordinator error: " + e);
        }
      }
    }
  }
};

let People = new PeopleService();
Cu.import("resource://people/modules/import.js");
