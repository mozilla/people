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
    index_tables: ["displayName", "givenName", "familyName", "emails"]
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
        "person_id INTEGER NOT NULL, val TEXT NOT NULL");
      for each (let col in ["person_id", "val"])
        this._db.executeSimpleSQL("CREATE INDEX IF NOT EXISTS " + index +
          "_" + col + " ON " + index + " (" + col + ")");
    }

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
      this._log.debug("Creating new statement for query: " + query);
      let stmt = this._db.createStatement(query);

      wrappedStmt = Cc["@mozilla.org/storage/statement-wrapper;1"].
        createInstance(Ci.mozIStorageStatementWrapper);
      wrappedStmt.initialize(stmt);
      this._dbStmts[query] = wrappedStmt;
    }
    // Replace parameters, must be done 1 at a time
    if (params)
      for (let i in params)
        wrappedStmt.params[i] = params[i];
    return wrappedStmt;
  },

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
      this._log.warn("add indexed field failed: " + Utils.exceptionStr(e));
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

  _updateIndexed: function _updateIndexed(person_id, person) {
    for each (let idx in this._dbSchema.index_tables) {
      this._clearIndexed(person_id, idx);
      if (idx in person)
        this._addIndexed(person[idx], idx, person_id);
    }
  },

  add: function add(person) {
    if (Utils.isArray(arguments[0]))
      return Utils.mapCall(this, arguments).filter(function(i) i != null);

    person.guid = person.guid || Utils.makeGUID();

    let stmt;
    try {
      this._db.beginTransaction();

      let query = "INSERT INTO people (guid, json) VALUES (:guid, :json)";
      let params = {
        guid: person.guid,
        json: JSON.stringify(person)
      };
      stmt = this._dbCreateStatement(query, params);
      stmt.execute();

      this._updateIndexed(this._db.lastInsertRowID, person);

      this._db.commitTransaction();

    } catch (e) {
      this._log.warn("add failed: " + Utils.exceptionStr(e));
      this._db.rollbackTransaction();
      return {error: "fail", person: person};

    } finally {
      if (stmt)
        stmt.reset();
    }

    Observers.notify("people-add", person.guid);
    return null;
  },

  update: function update(person) {
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

      this._updateIndexed(id, person);

      this._db.commitTransaction();

    } catch (e) {
      this._log.warn("update failure: " + Utils.exceptionStr(e));
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
      wheres.push(alias + ".val = :p" + terms);
      params["p" + terms] = val;
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

    try {
      return Utils.getRows(this._dbCreateStatement(query, params).statement);
    }
    catch(ex) {
      this._log.error("find failed during query: " + Utils.exceptionStr(ex));
      return [];
    }

    // Do the find on non-indexed fields
    for (let [attr, val] in Iterator(attrs)) {
      if (attr == "guid" || this._dbSchema.index_tables.indexOf(attr) != -1)
        continue;
      // TODO filter out stuff..
      //Cu.reportError(JSON.stringify([attr, val]));
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
    return this._find("json", attrs).map(function(json) JSON.parse(json));
  }
};

let People = new PeopleService();
