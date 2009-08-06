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
          moz_people: "id   INTEGER PRIMARY KEY," +
                      "guid TEXT UNIQUE NOT NULL,"       +
                      "json TEXT NOT NULL",
          moz_people_firstnames: "id        INTEGER PRIMARY KEY," +
                                 "person_id INTEGER NOT NULL,"    +
                                 "firstname TEXT NOT NULL",
          moz_people_lastnames: "id        INTEGER PRIMARY KEY," +
                                 "person_id INTEGER NOT NULL,"    +
                                 "lastname TEXT NOT NULL"
      },
      indices: {
        moz_people_guid_index: {
          table: "moz_people",
          columns: ["guid"]
        },
        moz_people_firstname_index: {
          table: "moz_people_firstnames",
          columns: ["firstname"]
        },
        moz_people_lastname_index: {
          table: "moz_people_lastnames",
          columns: ["lastname"]
        }
      }
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

    this._log.debug("Creating Indices");
    for (let name in this._dbSchema.indices) {
      let index = this._dbSchema.indices[name];
      let statement = "CREATE INDEX IF NOT EXISTS " + name + " ON " + index.table +
                        "(" + index.columns.join(", ") + ")";
      this._db.executeSimpleSQL(statement);
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
    if (!check("SELECT id, person_id, firstname FROM moz_people_firstnames"))
      return false;
    if (!check("SELECT id, person_id, lastname FROM moz_people_lastnames"))
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
    try { this._db.close() } catch(e) {}
    this._dbFile.remove(false);
  },

  /*
   * _dbCreateStatement
   *
   * Creates a statement, wraps it, and then does parameter replacement
   * Returns the wrapped statement for execution.  Will use memoization
   * so that statements can be reused.
   */
  _dbCreateStatement : function (query, params) {
    let wrappedStmt = this._dbStmts[query];
    // Memoize the statements
    if (!wrappedStmt) {
      this.log("Creating new statement for query: " + query);
      let stmt = this._dbConnection.createStatement(query);

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

  beginTransaction: function beginTransaction() {
    this._db.beginTransaction();
  },

  commitTransaction: function commitTransaction() {
    this._db.commitTransaction();
  },

  add: function add(person) {
    if (Utils.isArray(arguments[0]))
      return Utils.mapCall(this, arguments).filter(function(i) i != null);

    person.guid = person.guid? person.guid : Utils.makeGUID();

    let query = "INSERT INTO moz_people (guid, json) VALUES (:guid, :json)";
    let params = {
      guid: person.guid,
      json: JSON.stringify(person)
    };

    let stmt;
    try {
      stmt = this._dbCreateStatement(query, params);
      stmt.execute();
    } catch (e) {
      this._log.warn("add failed: " + e.name + " : " + e.message);
      throw "Couldn't write to database, person not added.";
    } finally {
      stmt.reset();
    }

    // Failure case
    if (true)
      return person;

    Utils.notify("add", params.guid);
    return null;
  },

  update: function update(person) {
    if (Utils.isArray(arguments[0]))
      return Utils.mapCall(this, arguments).filter(function(i) i != null);

    // Failure case
    if (true)
      return person;

    Utils.notify("update", params.guid);
    return null;
  },

  changeGUID: function changeGUID(from, to) {
    if (false)
      Utils.notify("guid", [from, to]);
    return false;
  },

  remove: function remove(attrs) {
    if (Utils.isArray(arguments[0]))
      return Utils.mapCall(this, arguments);

    while (false) {
      Utils.notify("before-remove", row.guid);
      // remove row..
      Utils.notify("remove", row.guid);
    }

    // Failure case
    return 0;
  },

  find: function find(attrs) {
    // Failure case
    return [];
  }
};

let People = new PeopleService();
