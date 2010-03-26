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

let EXPORTED_SYMBOLS = ["People"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

const DB_VERSION = 1; // The database schema version

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

Cu.import("resource://people/modules/utils.js");
Cu.import("resource://people/modules/ext/log4moz.js");
Cu.import("resource://people/modules/ext/Observers.js");

function PeopleService() {
  this._initLogs();
  this._dbStmts = [];
  this._dbInit();
  this._log.info("People store initialized");
  
  this.findDupTime = 0;
  this.addTime = 0;
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

    let logfile = Svc.Directory.get("ProfD", Ci.nsIFile);
    logfile.QueryInterface(Ci.nsILocalFile);
    logfile.append("people-log.txt");
    if (!logfile.exists())
      logfile.create(logfile.NORMAL_FILE_TYPE, 600);

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
              "json TEXT NOT NULL"
    },
    index_tables: ["displayName", "givenName", "familyName", "emails"],
    index_fields: ["displayName", "name/givenName", "name/familyName", "emails"]
  },

  get _dbFile() {
    let file = Svc.Directory.get("ProfD", Components.interfaces.nsIFile);
    file.append("people.sqlite");
    this.__defineGetter__("_dbFile", function() file);
    return file;
  },

  get _db() {
    let dbConn = Svc.Storage.openDatabase(this._dbFile); // auto-creates file
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

    this._log.debug("Creating Index Tables");
    for each (let index in this._dbSchema.index_tables) {
      this._db.createTable(index, "id INTEGER PRIMARY KEY, " +
        "person_id INTEGER NOT NULL, val TEXT NOT NULL COLLATE NOCASE");
      for each (let col in ["person_id", "val"])
        this._db.executeSimpleSQL("CREATE INDEX IF NOT EXISTS " + index +
          "_" + col + " ON " + index + " (" + col + ")");
    }

		this._db.createTable("site_permissions", "id INTEGER PRIMARY KEY, " +
			"url TEXT NOT NULL, fields TEXT NOT NULL");
		this._db.executeSimpleSQL("CREATE INDEX IF NOT EXISTS site_permissions_url ON site_permissions (url)");
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
      Svc.Storage.backupDatabaseFile(this._dbFile, backupFile);
    }

    // Finalize all statements to free memory, avoid errors later
    for (let i = 0; i < this._dbStmts.length; i++)
      this._dbStmts[i].statement.finalize();
    this._dbStmts = [];

    // Close the connection, ignore 'already closed' error
    try { this._db.close(); } catch(e) {}
    this._dbFile.remove(false);
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
    if (!wrappedStmt) {
      let stmt = this._db.createStatement(query);

      wrappedStmt = Cc["@mozilla.org/storage/statement-wrapper;1"].
        createInstance(Ci.mozIStorageStatementWrapper);
      wrappedStmt.initialize(stmt);
      this._dbStmts[query] = wrappedStmt;
    }
    // Replace parameters, must be done 1 at a time
    if (params)
      for (let [param, val] in Iterator(params)) {
        // Escape params that start with /
        if (param[0] == "/") {
          param = param.slice(1);
          val = "%" + wrappedStmt.statement.escapeStringForLIKE(val, "/") + "%";
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
      return Utils.mapCall(this, arguments);

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
      this._db.commitTransaction();

    } catch (e) {
      this._log.warn("deleteAll failed: " + Utils.exceptionStr(e));
      throw "deleteAll failed: " + Utils.exceptionStr(e);

    } finally {
      if (stmt)
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
  
	_searchForMergeTarget: function _searchForMergeTarget(personDoc) {
    // TODO: This is much slower than I would like.  Are the indices working properly?
    
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


  /** TODO: Need a way to specify a GUID on new person doc add *****/
  
  _createMergeFinder: function _createMergeFinder(sizeHint) {
    var finder = {
      people: this,
      
      findMergeTarget: function findMergeTarget(aPersonDoc) {

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
        return this.people._searchForMergeTarget(aPersonDoc);
      },
      
      addPerson: function addPerson(aPersonDoc, guid) {
        if (this.displayNameLookup && aPersonDoc.displayName) 
          this.displayNameLookup[aPersonDoc.displayName.toLowerCase()] = guid;

        if (this.emailLookup && aPersonDoc.emails) {
          for each (anEmail in aPersonDoc.emails) {
            if (anEmail.value) {
              this.emailLookup[anEmail.value.toLowerCase()] = guid;
            }
          }
        }      
      }
    }
    if (sizeHint > 50) { // it's worth it to build a lookup table...
      finder.emailLookup = this.getEmailToGUIDLookup();
      finder.displayNameLookup = this.getDisplayNameToGUIDLookup();
    }
    return finder;
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

      merges = []
      this._log.debug("Beginning People.add");
      let mergeFinder = this._createMergeFinder(docArray.length);
      
      for (var i=0;i<docArray.length;i++) {
        if (progressFunction) {
          progressFunction("Adding; " + Math.floor(i * 100 / docArray.length) + "%");
        }

        var personDoc = docArray[i];
        this._log.debug("Adding person " + i + ": " + personDoc.displayName);
        
        // Check for merge:
        let mergeTargetGUID = mergeFinder.findMergeTarget(personDoc);
        if (mergeTargetGUID) {
          merges.push([personDoc, mergeTargetGUID]);
          continue;
        }

        // No, perform insert:
        let guid = Utils.makeGUID();

        let stmt;
        try {
          let query = "INSERT INTO people (guid, json) VALUES (:guid, :json)";

          // Object as defined by https://wiki.mozilla.org/Labs/Weave/Contacts/SchemaV2
          let documents = {};
          documents[service.name] = personDoc;
          let obj = {
            guid: guid,
            documents: documents,
            schema: "http://labs.mozilla.com/schemas/people/2"
          };
          let params = {
            guid: guid,
            json: JSON.stringify(obj)
          };
          stmt = this._dbCreateStatement(query, params);
          stmt.execute();
          this._updateIndexed(this._db.lastInsertRowID, new Person(obj));
          mergeFinder.addPerson(personDoc, guid);
          
        } catch (e) {
          this._log.warn("add failed: " + Utils.exceptionStr(e));
        } finally {
          if (stmt)
            stmt.reset();
        }
        Observers.notify("people-add", guid);
      }
      this._db.commitTransaction();

      progressFunction("Resolving merges");
      this._log.debug("Resolving merges");

      for each (aMerge in merges) {
        personDoc = aMerge[0];
        mergeTargetGUID = aMerge[1];
        
        let dupMatchTargetList = this._find("json", {guid:mergeTargetGUID}).map(function(json) JSON.parse(json));
        let dupMatchTarget = dupMatchTargetList[0];

        this._log.info("Resolving merge " + mergeTargetGUID + " (" + personDoc.displayName + ")");

        // Blow away the existing service record?  Merging could be nice...
        if (dupMatchTarget.documents[service.name]) {
          this.mergeDocuments(dupMatchTarget.documents[service.name], personDoc);
        } else {
          dupMatchTarget.documents[service.name] = personDoc;
        }

        // this.mergeIntoRecord(dupMatchTarget, personDoc, service);
        this._update(dupMatchTarget);
        Observers.notify("people-update", dupMatchTarget.guid); // wonder if this should be add. probably not.
      }
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
      person.documents[service.name] = document;

      query = "UPDATE people SET json = :json WHERE id = :id";
      params = {
        id: id,
        json: JSON.stringify(person)
      };
      stmt = this._dbCreateStatement(query, params);
      stmt.execute();

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

    Observers.notify("people-update", guid);
    return null;
  },

  _update: function _update(person) {
    if (Utils.isArray(arguments[0]))
      return Utils.mapCall(this, arguments).filter(function(i) i != null);

    let stmt;
    try {
      if (!person.guid)
        throw "person object must contain a guid";

      this._db.beginTransaction();

      let query = "SELECT * FROM people WHERE guid = :guid";
      let params = {
        guid: person.guid
      };
      stmt = this._dbCreateStatement(query, params);

      let id;
      while (stmt.step()) {
        id = stmt.row.id;
      }
      if (!id)
        throw "no object for guid " + person.guid;
      stmt.reset();

      query = "UPDATE people SET json = :json WHERE id = :id";
      params = {
        id: id,
        json: JSON.stringify(person)
      };
      stmt = this._dbCreateStatement(query, params);
      stmt.execute();

      this._updateIndexed(id, new Person(person));

      this._db.commitTransaction();

    } catch (e) {
      this._log.warn("_update failure: " + Utils.exceptionStr(e));
      this._db.rollbackTransaction();
      return {error: e.message, person: person};

    } finally {
      if (stmt)
        stmt.reset();
    }

    Observers.notify("people-update", person.guid);
    return null;
  },

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
        return Utils.mapCall(this, arguments);

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
    try {
      result = Utils.getRows(this._dbCreateStatement(query, params).statement);
    }
    catch(ex) {
      this._log.error("find failed during query: " + Utils.exceptionStr(ex));
      return [];
    }

    // Post-process to do the find on non-indexed fields
    for (let [attr, val] in Iterator(attrs)) {
      if (attr == "guid" || this._dbSchema.index_tables.indexOf(attr) != -1)
        continue;
			
			let matchSet = []
			for (let obj in result) {

        //////// TODO: Need to traverse all documents here
				if (obj.attr == val) {
					matchSet.push(obj);
				}
			}
			result = matchSet;
    }
		return result;
  },

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
                        if (newObj.rel == item.rel) {
                          return true;
                        }
                      } else if (newObj.type == "internet") {// gross hack for Google email
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


  remove: function remove(attrs) {
    if (Utils.isArray(arguments[0]))
      return Utils.mapCall(this, arguments);

    let guids = this._find("guid", attrs);
    guids.forEach(function(guid) {
      let param = { guid: guid };
      Observers.notify("people-before-remove", guid);

      // Remove each indexed field
      for each (let index in this._dbSchema.index_tables)
        this._dbCreateStatement("DELETE FROM " + index + " WHERE person_id = " +
          "(SELECT id FROM people WHERE guid = :guid)", param).execute();

      // Remove the people entry
      this._dbCreateStatement("DELETE FROM people WHERE guid = :guid", param).
        execute();

      Observers.notify("people-remove", guid);
    }, this);
    return guids.length;
  },

  find: function find(attrs) {
    return this._find("json", attrs).map(function(json) {let p = JSON.parse(json); return new Person(p);});
  },
	

	importFromService: function importFromService(svcName, completionCallback, progressFunction) {

		// note that this could cause an asynchronous call
		Cu.import("resource://people/modules/import.js");    
		PeopleImporter.getBackend(svcName).import(completionCallback, progressFunction);

	},
  
  doDiscovery: function doDiscovery(svcName, personGUID, completionCallback, progressFunction) {
		Cu.import("resource://people/modules/import.js");    
    var personResultSet = this._find("json", {guid:personGUID}).map(function(json) {return new Person(JSON.parse(json));});
    this._log.warn("Performing discovery on GUID " + personGUID);
    
    let discoverer = PeopleImporter.getDiscoverer(svcName);
    if (discoverer) {
      let newDoc = PeopleImporter.getDiscoverer(svcName).discover(personResultSet[0], completionCallback, progressFunction);
      if (newDoc) this.update(personGUID, discoverer, newDoc);
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
	
	storeSiteFieldPermissions: function storeSiteFieldPermissions(site, permissionList) {
		let stmt = null;
		try {

      this._db.beginTransaction();
      let params = {
        url: site,
        fields: "" + permissionList // convert to string if necessary
      };
			People._log.warn("Saving permissions: INSERT OR REPLACE INTO site_permissions (url, fields) VALUES ('" + site + "', '" + permissionList + "')");
			stmt = this._dbCreateStatement("INSERT OR REPLACE INTO site_permissions (url, fields) VALUES (:url, :fields)", params);
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
	
	getSiteFieldPermissions: function getSiteFieldPermissions(site) {
		let stmt = null;
		try {

			let query = "SELECT fields FROM site_permissions WHERE url = :url";

			// Look up the results, filtering on indexed terms
			try {
				let params = {url:site};
				stmt = this._dbCreateStatement(query, params);
				result = Utils.getRows(stmt.statement);
				if (result && result.length>0) {
					return result[0].split(',');
				} else {
					return null;
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
	},
  
  getAllPermissions: function getAllPermissions() {
    let stmt = null;
    var ret = [];
    try {
      let query = "SELECT url,fields FROM site_permissions";
      
      try {
        stmt = this._dbCreateStatement(query);
        stmt.reset();
        while (stmt.step()) {
          ret.push({url:stmt.row.url, fields:stmt.row.fields});
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

  getProperty: function getProperty(aProperty) {
    let terms = aProperty.split('/');
    if (terms.length == 1) { // easy case
      return this._searchCollection(aProperty, this.obj.documents, "");
    }
    
    let currentSet = [];
    for each (let d in this.obj.documents) currentSet.push(d);
    let currentPrefix = "";
    for each (let term in terms)
    {
      if (!Utils.isArray(currentSet)) currentSet = [currentSet];
      currentSet = this._searchCollection(term, currentSet, currentPrefix);
      if (currentSet == null) break;
      currentPrefix = currentPrefix + "/" + term;
    }
    return currentSet;
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
                  if (newObj.rel == item.rel) {
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


let People = new PeopleService();
People._log.info("At end of people; created PeopleService");

Cu.import("resource://people/modules/import.js");
