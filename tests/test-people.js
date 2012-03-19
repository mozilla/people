// Import the People module into an object called "people"
const {Cc,Ci,Cu} = require("chrome");
let p = {}, pi = {}, o = {}, u = {};
Cu.import("resource://people/modules/people.js", p);
Cu.import("resource://people/modules/import.js", pi);
Cu.import("resource://people/modules/ext/Observers.js", o);
Cu.import("resource://people/modules/utils.js", u);

// Declare some test services
function TestImporter() {}
TestImporter.prototype = {
  __proto__: pi.ImporterBackend.prototype,
  get name() "test",
  get displayName() "Test Importer"
};

function TestImporter2() {}
TestImporter2.prototype = {
  __proto__: pi.ImporterBackend.prototype,
  get name() "test2",
  get displayName() "Test Importer 2"
};


// Register test services
pi.PeopleImporter.registerBackend(TestImporter);
pi.PeopleImporter.registerBackend(TestImporter2);
let testSvc = pi.PeopleImporter.getBackend("test");
let testSvc2 = pi.PeopleImporter.getBackend("test2");

// A couple helper functions
function jstr(obj) {return JSON.stringify(obj);}

// To check for updates
let observerFuncs = {update:false, remove:false, "before-remove":false, add: false, "guid-change":false}
// Add observer triggers
function getObsFunc(type){
  return function(){
    observerFuncs[type] = true;
  }
}
// Add observers
for (let type in observerFuncs) o.Observers.add("people-" + type, getObsFunc(type), this);

// reset observers
function resetObservers(){
  for (let type in observerFuncs) observerFuncs[type] = false;
}
// testObservers
function testObservers(totest){
  let testArray;
  if(totest == "all"){
    testArray = [i for (i in observerFuncs)];
  } else if (u.Utils.isArray(totest)) {
    testArray = totest;
  } else {
    testArray = [totest];
  }
  return testArray.map(function(value){ return observerFuncs[value];});
}


// Begin tests
exports.ensurePeopleExists = function(test) {
  test.assert(p.People != null, "People != null");
};

exports.testAdd = function(test) {
  p.People.deleteAll();
  resetObservers();
  test.assert(testSvc != null, "test service != null");
  
  // Add a person
  let testDoc = {"displayName":"Joe User", "name":{"givenName":"Joe","familyName":"User"}};
  let progressWasCalled = false;
  p.People.add(testDoc, testSvc, function() { progressWasCalled = true;});
  test.assert(progressWasCalled, "progressWasCalled != false");  
  test.assertEqual(jstr(testObservers("add")), "[true]");
  
  // Make sure it got saved, using low-level _find; we should
  // get back a json object with a guid and a documents array
  let result = p.People._find("json", {});
  test.assert(result.length == 1, "result.length == 1");
  let resultObj = JSON.parse(result[0]);
  test.assert(resultObj.guid != null);
  test.assert(resultObj.documents != null);
  test.assert(resultObj.documents.test != null);
  test.assert(resultObj.documents.test[testSvc.getPrimaryKey(testDoc)] != null);
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testDoc)].displayName, "Joe User");
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testDoc)].name.givenName, "Joe");
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testDoc)].name.familyName, "User");
  test.assertEqual(resultObj.schema, "http://labs.mozilla.com/schemas/people/2");
  test.assert(resultObj.merge != null);
  test.assert(resultObj.merge.test != null);
  test.assertEqual(resultObj.merge.test[testSvc.getPrimaryKey(testDoc)], true);
};

exports.testAddArray = function(test) {
  p.People.deleteAll();
  resetObservers();
  
  // Add some people
  let testPeople = [
    {"displayName":"Joe User", "name":{"givenName":"Joe","familyName":"User"}},
    {"displayName":"Mary User", "name":{"givenName":"Mary","familyName":"User"}}
  ];
  let progressWasCalled = false;
  p.People.add(testPeople, testSvc, function() { progressWasCalled = true;});
  test.assertEqual(jstr(testObservers("add")), "[true]");
  test.assert(progressWasCalled, "progressWasCalled != false");  

  // Make sure they were saved
  let result = p.People._find("json", {});
  test.assert(result.length == 2, "result.length == 2");
  let resultObj = JSON.parse(result[0]);
  test.assert(resultObj.guid != null);
  test.assert(resultObj.documents != null);
  test.assert(resultObj.documents.test != null);
  test.assert(resultObj.documents.test[testSvc.getPrimaryKey(testPeople[0])] != null);
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPeople[0])].displayName, "Joe User");
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPeople[0])].name.givenName, "Joe");
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPeople[0])].name.familyName, "User");
  test.assertEqual(resultObj.schema, "http://labs.mozilla.com/schemas/people/2");
  test.assert(resultObj.merge != null);
  test.assert(resultObj.merge.test != null);
  test.assert(resultObj.merge.test[testSvc.getPrimaryKey(testPeople[0])] != null);
  test.assertEqual(resultObj.merge.test[testSvc.getPrimaryKey(testPeople[0])], true);
  let resultObj = JSON.parse(result[1]);
  test.assert(resultObj.guid != null);
  test.assert(resultObj.documents != null);
  test.assert(resultObj.documents.test != null);
  test.assert(resultObj.documents.test[testSvc.getPrimaryKey(testPeople[1])] != null);
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPeople[1])].displayName, "Mary User");
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPeople[1])].name.givenName, "Mary");
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPeople[1])].name.familyName, "User");
  test.assertEqual(resultObj.schema, "http://labs.mozilla.com/schemas/people/2");
  test.assert(resultObj.merge != null);
  test.assert(resultObj.merge.test != null);
  test.assert(resultObj.merge.test[testSvc.getPrimaryKey(testPeople[1])] != null);
  test.assertEqual(resultObj.merge.test[testSvc.getPrimaryKey(testPeople[1])], true);
};

exports.testEmailMergeSameServiceSameKey = function(test) {
  p.People.deleteAll();
  resetObservers();
  
  // Add a person
  let testPerson = {"displayName":"Joe User", "name":{"familyName":"User"}, "emails":[{"type":"work", "value":"joe@test.com"}], "accounts":[{"domain":"foo.com","userid":"foo"}],
    "addresses":[{"streetAddress":"1234 Main St"}]};
  let progressWasCalled = false;
  p.People.add(testPerson, testSvc, function() { progressWasCalled = true;});
  test.assert(progressWasCalled, "progressWasCalled != false");  
  test.assertEqual(jstr(testObservers("add")), "[true]");
  resetObservers();

  // Add another person that overlaps 
  let testPerson2 = {"displayName":"Joe User", "name":{"givenName":"Joe"}, "emails":[{"type":"work", "value":"joe@test.com"}], "accounts":[{"domain":"foo.com","userid":"foo"}],
      "addresses":[{"streetAddress":"5678 State St"}]};
  p.People.add(testPerson2, testSvc, function() { progressWasCalled = true;});
  test.assert(progressWasCalled, "progressWasCalled != false");    
  test.assertEqual(jstr(testObservers(["add", "update"])), "[false,true]");

  // Note a couple things: 
  //  the "name" struct has overlapping fields
  //  both have an address and it is different
  //  both have an account and it is the same

  let result = p.People._find("json", {});
  test.assertEqual(result.length, 1);
  let resultObj = JSON.parse(result[0]);
  test.assert(resultObj.guid != null);
  test.assertEqual(resultObj.schema, "http://labs.mozilla.com/schemas/people/2");

  test.assert(resultObj.documents != null);
  test.assertEqual([i for (i in resultObj.documents)].length, 1);
  test.assert(resultObj.documents.test != null);
  test.assert(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)] != null);
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].displayName, "Joe User");
  // test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].name.givenName, "Joe", "Given name should have been merged into 'name' property"); /// <<< --- this is not implemented 
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].name.familyName, "User", "Family name should have been merged into 'name' property");
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].emails.length, 1);
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].accounts.length, 1);
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].addresses.length, 2);
  
  // Now test how the external object handles it
  let result = p.People.find({});
  test.assertEqual(result.length, 1);
  let person = result[0];
  test.assertEqual(person.getProperty("displayName"), "Joe User");
  // test.assertEqual(jstr(person.getProperty("name")), jstr({"givenName":"Joe", "familyName":"User"})); // <<<--- this does not work
  // test.assertEqual(person.getProperty("name/givenName"), "Joe"); // <<<--- this does not work
  test.assertEqual(person.getProperty("name/familyName"), "User");
  test.assertEqual(jstr(person.getProperty("emails")), jstr([{"type":"work","value":"joe@test.com"}]));
  test.assertEqual(jstr(person.getProperty("accounts")), jstr([{"domain":"foo.com","userid":"foo"}]));
  test.assertEqual(jstr(person.getProperty("addresses")), jstr([{"streetAddress":"1234 Main St"}, {"streetAddress":"5678 State St"}]));
};

exports.testEmailMergeSameServiceDiffKey = function(test) {
  p.People.deleteAll();
  
  // Add a person
  let testPerson = {"displayName":"Joe User", "name":{"familyName":"User"}, "emails":[{"type":"work", "value":"joe@test.com"}], "accounts":[{"domain":"foo.com","userid":"foo"}],
    "addresses":[{"streetAddress":"1234 Main St"}]};
  let progressWasCalled = false;
  p.People.add(testPerson, testSvc, function() { progressWasCalled = true;});
  test.assert(progressWasCalled, "progressWasCalled != false");  
  test.assertEqual(jstr(testObservers(["add"])), "[true]");
  resetObservers();

  // Add another person that overlaps 
  let testPerson2 = {"displayName":"Schmoe User", "name":{"givenName":"Joe"}, "emails":[{"type":"work", "value":"joe@test.com"}], "accounts":[{"domain":"foo.com","userid":"noob"}],
      "addresses":[{"streetAddress":"5678 State St"}]};
  p.People.add(testPerson2, testSvc, function() { progressWasCalled = true;});
  test.assert(progressWasCalled, "progressWasCalled != false");  
  test.assertEqual(jstr(testObservers(["add", "update"])), "[false,true]");

  // Note a couple things: 
  //  the "name" struct has overlapping fields
  //  both have an address and it is different
  //  both have an account and it is the same

  let result = p.People._find("json", {});
  test.assertEqual(result.length, 1);
  let resultObj = JSON.parse(result[0]);
  test.assert(resultObj.guid != null);
  test.assertEqual(resultObj.schema, "http://labs.mozilla.com/schemas/people/2");

  test.assert(resultObj.documents != null);
  test.assertEqual([i for (i in resultObj.documents)].length, 1);
  test.assert(resultObj.documents.test != null);
  test.assertEqual([i for (i in resultObj.documents.test)].length, 2);
  test.assert(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)] != null);
  test.assert(resultObj.documents.test[testSvc.getPrimaryKey(testPerson2)] != null);
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].displayName, "Joe User");
    // test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].name.givenName, "Joe", "Given name should have been merged into 'name' property"); /// <<< --- this is not implemented 
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].name.familyName, "User", "Family name should have been merged into 'name' property");
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].emails.length, 1);
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].accounts.length, 1);
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].addresses.length, 1);
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson2)].name.givenName, "Joe");
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson2)].emails.length, 1);
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson2)].accounts.length, 1);
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson2)].addresses.length, 1);
  
  test.assert(resultObj.merge != null);
  test.assertEqual([i for (i in resultObj.merge)].length, 1);
  test.assert(resultObj.merge.test != null);
  test.assertEqual([i for (i in resultObj.merge.test)].length, 2);
  test.assert(resultObj.merge.test[testSvc.getPrimaryKey(testPerson)] != null);
  test.assert(resultObj.merge.test[testSvc.getPrimaryKey(testPerson2)] != null);
  test.assertEqual(resultObj.merge.test[testSvc.getPrimaryKey(testPerson)], true);
  test.assertEqual(resultObj.merge.test[testSvc.getPrimaryKey(testPerson2)], true);
  
  // Now test how the external object handles it
  let result = p.People.find({});
  test.assertEqual(result.length, 1);
  let person = result[0];
  test.assertEqual(person.getProperty("displayName"), "Joe User");
  // test.assertEqual(jstr(person.getProperty("name")), jstr({"givenName":"Joe", "familyName":"User"})); // <<<--- this does not work
  // test.assertEqual(person.getProperty("name/givenName"), "Joe"); // <<<--- this does not work
  test.assertEqual(person.getProperty("name/familyName"), "User");
  test.assertEqual(jstr(person.getProperty("emails")), jstr([{"type":"work","value":"joe@test.com"}]));
  test.assertEqual(jstr(person.getProperty("accounts")), jstr([{"domain":"foo.com","userid":"foo"}, {"domain":"foo.com","userid":"noob"}]));
  test.assertEqual(jstr(person.getProperty("addresses")), jstr([{"streetAddress":"1234 Main St"}, {"streetAddress":"5678 State St"}]));
};

exports.testEmailMergeDifferentService = function(test) {
  p.People.deleteAll();
  resetObservers();
  
  // Add a person
  let testPerson = {"displayName":"Joe User", "name":{"familyName":"User"}, "emails":[{"type":"work", "value":"joe@test.com"}], "accounts":[{"domain":"foo.com","userid":"foo"}],
    "addresses":[{"streetAddress":"1234 Main St"}]};
  let progressWasCalled = false;
  p.People.add(testPerson, testSvc, function() { progressWasCalled = true;});
  test.assert(progressWasCalled, "progressWasCalled != false");  
  test.assertEqual(jstr(testObservers(["add"])), "[true]");
  resetObservers();
  
  // Add another person that overlaps 
  let testPerson2 = {"displayName":"Joe User", "name":{"givenName":"Joe"}, "emails":[{"type":"work", "value":"joe@test.com"}], "accounts":[{"domain":"foo.com","userid":"foo"}],
      "addresses":[{"streetAddress":"5678 State St"}]};
  p.People.add(testPerson2, testSvc2, function() { progressWasCalled = true;});
  test.assert(progressWasCalled, "progressWasCalled != false"); 
  test.assertEqual(jstr(testObservers(["add", "update"])), "[false,true]");

  let result = p.People._find("json", {});
  test.assertEqual(result.length, 1);
  let resultObj = JSON.parse(result[0]);
  test.assert(resultObj.guid != null);
  test.assertEqual(resultObj.schema, "http://labs.mozilla.com/schemas/people/2");

  test.assert(resultObj.documents != null);
  test.assertEqual([i for (i in resultObj.documents)].length, 2);
  test.assert(resultObj.documents.test != null);
  test.assert(resultObj.documents.test2 != null);
  test.assertEqual([i for (i in resultObj.documents.test)].length, 1);
  test.assertEqual([i for (i in resultObj.documents.test2)].length, 1);
  test.assert(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)] != null);
  test.assert(resultObj.documents.test2[testSvc.getPrimaryKey(testPerson2)] != null);
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].displayName, "Joe User");
    // test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].name.givenName, "Joe", "Given name should have been merged into 'name' property"); /// <<< --- this is not implemented 
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].name.familyName, "User", "Family name should have been merged into 'name' property");
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].emails.length, 1);
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].accounts.length, 1);
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].addresses.length, 1);
  test.assertEqual(resultObj.documents.test2[testSvc.getPrimaryKey(testPerson2)].name.givenName, "Joe");
  test.assertEqual(resultObj.documents.test2[testSvc.getPrimaryKey(testPerson2)].emails.length, 1);
  test.assertEqual(resultObj.documents.test2[testSvc.getPrimaryKey(testPerson2)].accounts.length, 1);
  test.assertEqual(resultObj.documents.test2[testSvc.getPrimaryKey(testPerson2)].addresses.length, 1);
  
  test.assert(resultObj.merge != null);
  test.assertEqual([i for (i in resultObj.merge)].length, 2);
  test.assert(resultObj.merge.test != null);
  test.assert(resultObj.merge.test2 != null);
  test.assertEqual([i for (i in resultObj.merge.test)].length, 1);
  test.assertEqual([i for (i in resultObj.merge.test2)].length, 1);
  test.assert(resultObj.merge.test[testSvc.getPrimaryKey(testPerson)] != null);
  test.assert(resultObj.merge.test2[testSvc.getPrimaryKey(testPerson2)] != null);
  test.assertEqual(resultObj.merge.test[testSvc.getPrimaryKey(testPerson)], true);
  test.assertEqual(resultObj.merge.test2[testSvc.getPrimaryKey(testPerson2)], true);
  
  // Now test how the external object handles it
  let result = p.People.find({});
  test.assertEqual(result.length, 1);
  let person = result[0];
  test.assertEqual(person.getProperty("displayName"), "Joe User");
  // test.assertEqual(jstr(person.getProperty("name")), jstr({"givenName":"Joe", "familyName":"User"})); // <<<--- this does not work
  // test.assertEqual(person.getProperty("name/givenName"), "Joe"); // <<<--- this does not work
  test.assertEqual(person.getProperty("name/familyName"), "User");
  test.assertEqual(jstr(person.getProperty("emails")), jstr([{"type":"work","value":"joe@test.com"}]));
  test.assertEqual(jstr(person.getProperty("accounts")), jstr([{"domain":"foo.com","userid":"foo"}]));
  test.assertEqual(jstr(person.getProperty("addresses")), jstr([{"streetAddress":"1234 Main St"}, {"streetAddress":"5678 State St"}]));
};



exports.testDisplayNameMergeDifferentService = function(test) {
  p.People.deleteAll();
  resetObservers();
  
  // Add a person
  let testPerson = {"displayName":"Joe User", "name":{"familyName":"User"}, "emails":[{"type":"work", "value":"joe@test.com"}], "accounts":[{"domain":"foo.com","userid":"foo"}],
    "addresses":[{"streetAddress":"1234 Main St"}]};
  let progressWasCalled = false;
  p.People.add(testPerson, testSvc, function() { progressWasCalled = true;});
  test.assert(progressWasCalled, "progressWasCalled != false");  
  test.assertEqual(jstr(testObservers(["add"])), "[true]");
  resetObservers();

  // Add another person that overlaps 
  let testPerson2 = {"displayName":"Joe User", "name":{"givenName":"Joe"}, "emails":[{"type":"home", "value":"joe@bar.com"}], "accounts":[{"domain":"foo.com","userid":"foo"}],
      "addresses":[{"streetAddress":"5678 State St"}]};
  p.People.add(testPerson2, testSvc2, function() { progressWasCalled = true;});
  test.assert(progressWasCalled, "progressWasCalled != false"); 
  test.assertEqual(jstr(testObservers(["add", "update"])), "[false,true]");

  let result = p.People._find("json", {});
  test.assertEqual(result.length, 1);
  let resultObj = JSON.parse(result[0]);
  test.assert(resultObj.guid != null);
  test.assertEqual(resultObj.schema, "http://labs.mozilla.com/schemas/people/2");

  test.assert(resultObj.documents != null);
  test.assertEqual([i for (i in resultObj.documents)].length, 2);
  test.assert(resultObj.documents.test != null);
  test.assert(resultObj.documents.test2 != null);
  test.assertEqual([i for (i in resultObj.documents.test)].length, 1);
  test.assertEqual([i for (i in resultObj.documents.test2)].length, 1);
  test.assert(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)] != null);
  test.assert(resultObj.documents.test[testSvc.getPrimaryKey(testPerson2)] != null);
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].displayName, "Joe User");
    // test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].name.givenName, "Joe", "Given name should have been merged into 'name' property"); /// <<< --- this is not implemented 
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].name.familyName, "User", "Family name should have been merged into 'name' property");
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].emails.length, 1);
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].accounts.length, 1);
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].addresses.length, 1);
  test.assertEqual(resultObj.documents.test2[testSvc.getPrimaryKey(testPerson2)].name.givenName, "Joe");
  test.assertEqual(resultObj.documents.test2[testSvc.getPrimaryKey(testPerson2)].emails.length, 1);
  test.assertEqual(resultObj.documents.test2[testSvc.getPrimaryKey(testPerson2)].accounts.length, 1);
  test.assertEqual(resultObj.documents.test2[testSvc.getPrimaryKey(testPerson2)].addresses.length, 1);
  
  test.assert(resultObj.merge != null);
  test.assertEqual([i for (i in resultObj.merge)].length, 2);
  test.assert(resultObj.merge.test != null);
  test.assert(resultObj.merge.test2 != null);
  test.assertEqual([i for (i in resultObj.merge.test)].length, 1);
  test.assertEqual([i for (i in resultObj.merge.test2)].length, 1);
  test.assert(resultObj.merge.test[testSvc.getPrimaryKey(testPerson)] != null);
  test.assert(resultObj.merge.test2[testSvc.getPrimaryKey(testPerson2)] != null);
  test.assertEqual(resultObj.merge.test[testSvc.getPrimaryKey(testPerson)], true);
  test.assertEqual(resultObj.merge.test2[testSvc.getPrimaryKey(testPerson2)], true);
  
  // Now test how the external object handles it
  let result = p.People.find({});
  test.assertEqual(result.length, 1);
  let person = result[0];
  test.assertEqual(person.getProperty("displayName"), "Joe User");
  // test.assertEqual(jstr(person.getProperty("name")), jstr({"givenName":"Joe", "familyName":"User"})); // <<<--- this does not work
  // test.assertEqual(person.getProperty("name/givenName"), "Joe"); // <<<--- this does not work
  test.assertEqual(person.getProperty("name/familyName"), "User");
  test.assertEqual(jstr(person.getProperty("emails")), jstr([{"type":"work","value":"joe@test.com"},{"type":"home","value":"joe@bar.com"}]));
  test.assertEqual(jstr(person.getProperty("accounts")), jstr([{"domain":"foo.com","userid":"foo"}]));
  test.assertEqual(jstr(person.getProperty("addresses")), jstr([{"streetAddress":"1234 Main St"}, {"streetAddress":"5678 State St"}]));

};

exports.testMergedRemoveDifferentService = function(test){
  p.People.deleteAll();
  resetObservers();
  
  // Add a person
  let testPerson = {"displayName":"Joe User", "name":{"familyName":"User"}, "emails":[{"type":"work", "value":"joe@test.com"}], "accounts":[{"domain":"foo.com","userid":"foo"}],
    "addresses":[{"streetAddress":"1234 Main St"}]};
  let progressWasCalled = false;
  p.People.add(testPerson, testSvc, function() { progressWasCalled = true;});
  test.assert(progressWasCalled, "progressWasCalled != false");  
  test.assertEqual(jstr(testObservers(["add"])), "[true]");
  resetObservers();

  // Add another person that overlaps 
  let testPerson2 = {"displayName":"Joe User", "name":{"givenName":"Joe"}, "emails":[{"type":"home", "value":"joe@bar.com"}], "accounts":[{"domain":"foo.com","userid":"foo"}],
      "addresses":[{"streetAddress":"5678 State St"}]};
  p.People.add(testPerson2, testSvc2, function() { progressWasCalled = true;});
  test.assert(progressWasCalled, "progressWasCalled != false"); 
  test.assertEqual(jstr(testObservers(["add", "update"])), "[false,true]");
  resetObservers();
  
  p.People.removeServiceData("test2");
  test.assertEqual(jstr(testObservers(["update"])), "[true]");
  
  let result = p.People._find("json", {});
  test.assertEqual(result.length, 1);
  let resultObj = JSON.parse(result[0]);
  test.assert(resultObj.guid != null);
  test.assertEqual(resultObj.schema, "http://labs.mozilla.com/schemas/people/2");

  test.assert(resultObj.documents != null);
  test.assertEqual([i for (i in resultObj.documents)].length, 1);
  test.assert(resultObj.documents.test != null);
  test.assert(resultObj.documents.test2 == null);
  test.assertEqual([i for (i in resultObj.documents.test)].length, 1);
  test.assert(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)] != null);
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].displayName, "Joe User");
    // test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].name.givenName, "Joe", "Given name should have been merged into 'name' property"); /// <<< --- this is not implemented 
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].name.familyName, "User", "Family name should have been merged into 'name' property");
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].emails.length, 1);
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].accounts.length, 1);
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].addresses.length, 1);
  
  test.assert(resultObj.merge != null);
  test.assertEqual([i for (i in resultObj.merge)].length, 2);
  test.assert(resultObj.merge.test != null);
  test.assert(resultObj.merge.test2 != null);
  test.assertEqual([i for (i in resultObj.merge.test)].length, 1);
  test.assertEqual([i for (i in resultObj.merge.test2)].length, 1);
  test.assert(resultObj.merge.test[testSvc.getPrimaryKey(testPerson)] != null);
  test.assert(resultObj.merge.test2[testSvc.getPrimaryKey(testPerson2)] != null);
  test.assertEqual(resultObj.merge.test[testSvc.getPrimaryKey(testPerson)], true);
  test.assertEqual(resultObj.merge.test2[testSvc.getPrimaryKey(testPerson2)], true);
  
  // Now test how the external object handles it
  let result = p.People.find({}); 
  test.assertEqual(result.length, 1);
  let person = result[0];
  test.assertEqual(person.getProperty("displayName"), "Joe User");
  // test.assertEqual(jstr(person.getProperty("name")), jstr({"givenName":"Joe", "familyName":"User"})); // <<<--- this does not work
  // test.assertEqual(person.getProperty("name/givenName"), "Joe"); // <<<--- this does not work
  test.assertEqual(person.getProperty("name/familyName"), "User");
  test.assertEqual(jstr(person.getProperty("emails")), jstr([{"type":"work","value":"joe@test.com"}]));
  test.assertEqual(jstr(person.getProperty("accounts")), jstr([{"domain":"foo.com","userid":"foo"}]));
  test.assertEqual(jstr(person.getProperty("addresses")), jstr([{"streetAddress":"1234 Main St"}]));
  
}

exports.testMergedRemoveSameServiceReAdd = function(test){
  p.People.deleteAll();
  resetObservers();
  
  // Add a person
  let testPerson = {"displayName":"Joe User", "name":{"familyName":"User"}, "emails":[{"type":"work", "value":"joe@test.com"}], "accounts":[{"domain":"foo.com","userid":"foo"}],
    "addresses":[{"streetAddress":"1234 Main St"}]};
  let progressWasCalled = false;
  p.People.add(testPerson, testSvc, function() { progressWasCalled = true;});
  test.assert(progressWasCalled, "progressWasCalled != false"); 
  test.assertEqual(jstr(testObservers(["add"])), "[true]");
  resetObservers(); 

  // Add another person that overlaps 
  let testPerson2 = {"displayName":"Schmoe User", "name":{"givenName":"Joe"}, "emails":[{"type":"work", "value":"joe@test.com"}], "accounts":[{"domain":"foo.com","userid":"noob"}],
      "addresses":[{"streetAddress":"5678 State St"}]};
  p.People.add(testPerson2, testSvc, function() { progressWasCalled = true;});
  test.assert(progressWasCalled, "progressWasCalled != false");  
  test.assertEqual(jstr(testObservers(["add", "update"])), "[false,true]");
  resetObservers();
  
  p.People.removeServiceData("test");
  test.assertEqual(jstr(testObservers(["update"])), "[true]");
  resetObservers();
  
  let result = p.People._find("json", {});
  test.assertEqual(result.length, 1);
  
  let result = p.People.find({}); 
  test.assertEqual(result.length, 0);
  
  let progressWasCalled = false;
  p.People.add(testPerson, testSvc, function() { progressWasCalled = true;});
  test.assert(progressWasCalled, "progressWasCalled != false");  
  test.assertEqual(jstr(testObservers(["add", "update"])), "[false,true]");
  
  let result = p.People._find("json", {});
  test.assertEqual(result.length, 1);
  
  let resultObj = JSON.parse(result[0]);
  
  test.assert(resultObj.guid != null);
  test.assertEqual(resultObj.schema, "http://labs.mozilla.com/schemas/people/2");

  test.assert(resultObj.documents != null);
  test.assertEqual([i for (i in resultObj.documents)].length, 1);
  test.assert(resultObj.documents.test != null);
  test.assert(resultObj.documents.test2 == null);
  test.assertEqual([i for (i in resultObj.documents.test)].length, 1);
  test.assert(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)] != null);
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].displayName, "Joe User");
    // test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].name.givenName, "Joe", "Given name should have been merged into 'name' property"); /// <<< --- this is not implemented 
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].name.familyName, "User", "Family name should have been merged into 'name' property");
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].emails.length, 1);
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].accounts.length, 1);
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].addresses.length, 1);
  
  test.assert(resultObj.merge != null);
  test.assertEqual([i for (i in resultObj.merge)].length, 1);
  test.assert(resultObj.merge.test != null);
  test.assertEqual([i for (i in resultObj.merge.test)].length, 2);
  test.assert(resultObj.merge.test[testSvc.getPrimaryKey(testPerson)] != null);
  test.assert(resultObj.merge.test[testSvc.getPrimaryKey(testPerson2)] != null);
  test.assertEqual(resultObj.merge.test[testSvc.getPrimaryKey(testPerson)], true);
  test.assertEqual(resultObj.merge.test[testSvc.getPrimaryKey(testPerson2)], true);
  
  // Now test how the external object handles it
  let result = p.People.find({}); 
  test.assertEqual(result.length, 1);
  let person = result[0];
  test.assertEqual(person.getProperty("displayName"), "Joe User");
  // test.assertEqual(jstr(person.getProperty("name")), jstr({"givenName":"Joe", "familyName":"User"})); // <<<--- this does not work
  // test.assertEqual(person.getProperty("name/givenName"), "Joe"); // <<<--- this does not work
  test.assertEqual(person.getProperty("name/familyName"), "User");
  test.assertEqual(jstr(person.getProperty("emails")), jstr([{"type":"work","value":"joe@test.com"}]));
  test.assertEqual(jstr(person.getProperty("accounts")), jstr([{"domain":"foo.com","userid":"foo"}]));
  test.assertEqual(jstr(person.getProperty("addresses")), jstr([{"streetAddress":"1234 Main St"}]));
  
};


exports.testMergePerson = function(test){
  p.People.deleteAll();
  resetObservers();
  
  // Add some people
  let testPerson = {"displayName":"Joe User", "name":{"givenName":"Joe","familyName":"User"}, "emails":[{"type":"work", "value":"joe@test.com"}]};
  let progressWasCalled = false;
  p.People.add(testPerson, testSvc, function() { progressWasCalled = true;});
  test.assert(progressWasCalled, "progressWasCalled != false");  
  test.assertEqual(jstr(testObservers(["add"])), "[true]");
  resetObservers();
  
  let testPerson2 = {"displayName":"Mary User", "name":{"givenName":"Mary","familyName":"User"}, "emails":[{"type":"work", "value":"mary@test.com"}]};
  let progressWasCalled = false;
  p.People.add(testPerson2, testSvc2, function() { progressWasCalled = true;});
  test.assert(progressWasCalled, "progressWasCalled != false");  
  test.assertEqual(jstr(testObservers(["add", "update"])), "[true,false]");
  resetObservers();

  // Make sure they were saved
  let result = p.People._find("json", {});
  test.assert(result.length == 2, "result.length == 2");
  let guid1 = JSON.parse(result[0]).guid;
  let guid2 = JSON.parse(result[1]).guid;
  
  p.People.mergePeople(guid1, guid2);
  test.assertEqual(jstr(testObservers(["remove", "update"])), "[true,true]");
  
  let result = p.People._find("json", {});
  test.assertEqual(result.length, 1);
  let resultObj = JSON.parse(result[0]);
  test.assert(resultObj.guid != null);
  test.assertEqual(resultObj.schema, "http://labs.mozilla.com/schemas/people/2");

  test.assert(resultObj.documents != null);
  test.assertEqual([i for (i in resultObj.documents)].length, 2);
  test.assert(resultObj.documents.test != null);
  test.assert(resultObj.documents.test2 != null);
  test.assertEqual([i for (i in resultObj.documents.test)].length, 1);
  test.assertEqual([i for (i in resultObj.documents.test2)].length, 1);
  test.assert(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)] != null);
  test.assert(resultObj.documents.test2[testSvc.getPrimaryKey(testPerson2)] != null);
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].displayName, "Joe User");
    // test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].name.givenName, "Joe", "Given name should have been merged into 'name' property"); /// <<< --- this is not implemented 
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].name.familyName, "User", "Family name should have been merged into 'name' property");
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].emails.length, 1);
  test.assertEqual(resultObj.documents.test2[testSvc.getPrimaryKey(testPerson2)].name.givenName, "Mary");
  test.assertEqual(resultObj.documents.test2[testSvc.getPrimaryKey(testPerson2)].emails.length, 1);
  
  test.assert(resultObj.merge != null);
  test.assertEqual([i for (i in resultObj.merge)].length, 2);
  test.assert(resultObj.merge.test != null);
  test.assert(resultObj.merge.test2 != null);
  test.assertEqual([i for (i in resultObj.merge.test)].length, 1);
  test.assertEqual([i for (i in resultObj.merge.test2)].length, 1);
  test.assert(resultObj.merge.test[testSvc.getPrimaryKey(testPerson)] != null);
  test.assert(resultObj.merge.test2[testSvc.getPrimaryKey(testPerson2)] != null);
  test.assertEqual(resultObj.merge.test[testSvc.getPrimaryKey(testPerson)], true);
  test.assertEqual(resultObj.merge.test2[testSvc.getPrimaryKey(testPerson2)], true);
  
  // Now test how the external object handles it
  let result = p.People.find({});
  test.assertEqual(result.length, 1);
  let person = result[0];
  test.assertEqual(person.getProperty("displayName"), "Joe User");
  // test.assertEqual(jstr(person.getProperty("name")), jstr({"givenName":"Joe", "familyName":"User"})); // <<<--- this does not work
  // test.assertEqual(person.getProperty("name/givenName"), "Joe"); // <<<--- this does not work
  test.assertEqual(person.getProperty("name/familyName"), "User");
  test.assertEqual(jstr(person.getProperty("emails")), jstr([{"type":"work","value":"joe@test.com"}, {"type":"work","value":"mary@test.com"}]));
};

exports.testSplitReMergePerson = function(test){
  p.People.deleteAll();
  resetObservers();
  
  // Add a person
  let testPerson = {"displayName":"Joe User", "name":{"familyName":"User"}, "emails":[{"type":"work", "value":"joe@test.com"}], "accounts":[{"domain":"foo.com","userid":"foo"}],
    "addresses":[{"streetAddress":"1234 Main St"}]};
  let progressWasCalled = false;
  p.People.add(testPerson, testSvc, function() { progressWasCalled = true;});
  test.assert(progressWasCalled, "progressWasCalled != false");  
  test.assertEqual(jstr(testObservers(["add"])), "[true]");
  resetObservers();

  // Add another person that overlaps 
  let testPerson2 = {"displayName":"Schmoe User", "name":{"givenName":"Joe"}, "emails":[{"type":"work", "value":"joe@test.com"}], "accounts":[{"domain":"foo.com","userid":"noob"}],
      "addresses":[{"streetAddress":"5678 State St"}]};
  p.People.add(testPerson2, testSvc, function() { progressWasCalled = true;});
  test.assert(progressWasCalled, "progressWasCalled != false");  
  test.assertEqual(jstr(testObservers(["add", "update"])), "[false,true]");
  resetObservers();

  let result = p.People._find("json", {});
  test.assertEqual(result.length, 1);
  let resultObj = JSON.parse(result[0]);
  
  p.People.split(resultObj.guid, testSvc.name, testSvc.getPrimaryKey(testPerson2));
  test.assertEqual(jstr(testObservers(["add", "update"])), "[true,true]");
  resetObservers();

  let result = p.People._find("json", {});
  test.assertEqual(result.length, 2);
  let resultObj = JSON.parse(result[0]);
  test.assert(resultObj.guid != null);
  let guid1 = resultObj.guid;
  test.assert(resultObj.documents != null);
  test.assert(resultObj.documents.test != null);
  test.assert(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)] != null);
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].displayName, "Joe User");
  test.assertEqual(resultObj.schema, "http://labs.mozilla.com/schemas/people/2");
  test.assert(resultObj.merge != null);
  test.assert(resultObj.merge.test != null);
  test.assert(resultObj.merge.test[testSvc.getPrimaryKey(testPerson)] != null);
  test.assert(resultObj.merge.test[testSvc.getPrimaryKey(testPerson2)] != null);
  test.assertEqual(resultObj.merge.test[testSvc.getPrimaryKey(testPerson)], true);
  test.assertEqual(resultObj.merge.test[testSvc.getPrimaryKey(testPerson2)], false);
  let resultObj = JSON.parse(result[1]);
  test.assert(resultObj.guid != null);
  let guid2 = resultObj.guid;
  test.assert(resultObj.documents != null);
  test.assert(resultObj.documents.test != null);
  test.assert(resultObj.documents.test[testSvc.getPrimaryKey(testPerson2)] != null);
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson2)].displayName, "Schmoe User");
  test.assertEqual(resultObj.schema, "http://labs.mozilla.com/schemas/people/2");
  test.assert(resultObj.merge != null);
  test.assert(resultObj.merge.test != null);
  test.assert(resultObj.merge.test[testSvc.getPrimaryKey(testPerson)] != null);
  test.assert(resultObj.merge.test[testSvc.getPrimaryKey(testPerson2)] != null);
  test.assertEqual(resultObj.merge.test[testSvc.getPrimaryKey(testPerson)], false);
  test.assertEqual(resultObj.merge.test[testSvc.getPrimaryKey(testPerson2)], true);
  
  p.People.mergePeople(guid1, guid2);
  test.assertEqual(jstr(testObservers(["remove", "update"])), "[true,true]");
  let result = p.People._find("json", {});
  test.assertEqual(result.length, 1);
  let resultObj = JSON.parse(result[0]);
  test.assert(resultObj.guid != null);
  test.assertEqual(resultObj.schema, "http://labs.mozilla.com/schemas/people/2");

  test.assert(resultObj.documents != null);
  test.assertEqual([i for (i in resultObj.documents)].length, 1);
  test.assert(resultObj.documents.test != null);
  test.assertEqual([i for (i in resultObj.documents.test)].length, 2);
  test.assert(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)] != null);
  test.assert(resultObj.documents.test[testSvc.getPrimaryKey(testPerson2)] != null);
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].displayName, "Joe User");
    // test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].name.givenName, "Joe", "Given name should have been merged into 'name' property"); /// <<< --- this is not implemented 
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].name.familyName, "User", "Family name should have been merged into 'name' property");
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].emails.length, 1);
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].accounts.length, 1);
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson)].addresses.length, 1);
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson2)].name.givenName, "Joe");
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson2)].emails.length, 1);
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson2)].accounts.length, 1);
  test.assertEqual(resultObj.documents.test[testSvc.getPrimaryKey(testPerson2)].addresses.length, 1);
  
  test.assert(resultObj.merge != null);
  test.assertEqual([i for (i in resultObj.merge)].length, 1);
  test.assert(resultObj.merge.test != null);
  test.assertEqual([i for (i in resultObj.merge.test)].length, 2);
  test.assert(resultObj.merge.test[testSvc.getPrimaryKey(testPerson)] != null);
  test.assert(resultObj.merge.test[testSvc.getPrimaryKey(testPerson2)] != null);
  test.assertEqual(resultObj.merge.test[testSvc.getPrimaryKey(testPerson)], true);
  test.assertEqual(resultObj.merge.test[testSvc.getPrimaryKey(testPerson2)], true);
  
  // Now test how the external object handles it
  let result = p.People.find({});
  test.assertEqual(result.length, 1);
  let person = result[0];
  test.assertEqual(person.getProperty("displayName"), "Joe User");
  // test.assertEqual(jstr(person.getProperty("name")), jstr({"givenName":"Joe", "familyName":"User"})); // <<<--- this does not work
  // test.assertEqual(person.getProperty("name/givenName"), "Joe"); // <<<--- this does not work
  test.assertEqual(person.getProperty("name/familyName"), "User");
  test.assertEqual(jstr(person.getProperty("emails")), jstr([{"type":"work","value":"joe@test.com"}]));
  test.assertEqual(jstr(person.getProperty("accounts")), jstr([{"domain":"foo.com","userid":"foo"}, {"domain":"foo.com","userid":"noob"}]));
  test.assertEqual(jstr(person.getProperty("addresses")), jstr([{"streetAddress":"1234 Main St"}, {"streetAddress":"5678 State St"}]));
  
  // Now test how the external object handles it
  let result = p.People.find({});
  test.assertEqual(result.length, 1);
  let person = result[0];
  test.assertEqual(person.getProperty("displayName"), "Joe User");
  // test.assertEqual(jstr(person.getProperty("name")), jstr({"givenName":"Joe", "familyName":"User"})); // <<<--- this does not work
  // test.assertEqual(person.getProperty("name/givenName"), "Joe"); // <<<--- this does not work
  test.assertEqual(person.getProperty("name/familyName"), "User");
  test.assertEqual(jstr(person.getProperty("emails")), jstr([{"type":"work","value":"joe@test.com"}]));
};

exports.testExternalFind = function(test){
  p.People.deleteAll();
  resetObservers();
  
  // Add another person that overlaps 
   let testPerson2 = {"displayName":"Schmoe User", "gender":"male", "name":{"givenName":"User"}, "emails":[{"type":"work", "value":"joeschmoe@test.com"}], "accounts":[{"domain":"foo.com","userid":"noob"}],
       "addresses":[{"streetAddress":"5678 State St"}]};
   let progressWasCalled = false;
   p.People.add(testPerson2, testSvc, function() { progressWasCalled = true;});
   test.assert(progressWasCalled, "progressWasCalled != false");  
   test.assertEqual(jstr(testObservers(["add"])), "[true]");
   resetObservers();
  
  // Add a person
  let testPerson = {"displayName":"Joe User", "gender":"male", "name":{"givenName":"User"}, "emails":[{"type":"work", "value":"joe@test.com"}], "accounts":[{"domain":"foo.com","userid":"foo"}],
    "addresses":[{"streetAddress":"1234 Main St"}]};
  let progressWasCalled = false;
  p.People.add(testPerson, testSvc, function() { progressWasCalled = true;});
  test.assert(progressWasCalled, "progressWasCalled != false");  
  test.assertEqual(jstr(testObservers(["add"])), "[true]");
  resetObservers();

  let results = null;
  p.People.findExternal([ "gender", "emails", "displayName", "name.givenName"], function(people){results = people;}, null, {updatedSince:"2002-05-30T09:00:00Z" });
  test.assertEqual(results.length, 2);
  test.assertEqual(results[0].displayName, "Joe User");
  test.assertEqual(results[0].gender, "male");
  test.assertEqual(results[1].displayName, "Schmoe User");
  test.assertEqual(results[1].gender, "male");
}

exports.testExternalSort = function(test){
  
  // TestBranch: if(aarr[aindex][0] != barr[bindex][0]) return aarr[aindex][0] > barr[bindex][0];
  // AKA if one has a match that has a higher rank than the other, then the match with the higher rank takes precendence
  p.People.deleteAll();
  let testPerson2 = {"displayName":"Schmoe User", "gender":"male", "name":{"givenName":"Schmoe"}, "emails":[{"type":"work", "value":"joeschmoe@test.com"}], "accounts":[{"domain":"foo.com","userid":"noob"}],
       "addresses":[{"streetAddress":"5678 State St"}]};
  p.People.add(testPerson2, testSvc, function() { });
  let testPerson = {"displayName":"Joe User", "gender":"male", "name":{"familyName":"User"}, "emails":[{"type":"work", "value":"joe@test.com"}], "accounts":[{"domain":"foo.com","userid":"foo"}],
    "addresses":[{"streetAddress":"1234 Main St"}]};
  p.People.add(testPerson, testSvc, function() { });
  
  let results = null;
  p.People.findExternal([ "gender", "emails", "displayName"], function(people){results = people;}, null, {filter:"joe" });
  test.assertEqual(results.length, 2);
  test.assertEqual(results[0].displayName, "Joe User");
  test.assertEqual(results[1].displayName, "Schmoe User");
  
  p.People.deleteAll();
  p.People.add(testPerson, testSvc, function() { });
  p.People.add(testPerson2, testSvc, function() { });
  
  results = null;
  p.People.findExternal([ "gender", "emails", "displayName"], function(people){results = people;}, null, {filter:"joe" });
  test.assertEqual(results.length, 2);
  test.assertEqual(results[0].displayName, "Joe User");
  test.assertEqual(results[1].displayName, "Schmoe User");
  
  // TestBranch: let comp = compRecursive(aarr[aindex][1], barr[bindex][1]); if(comp != 0) return comp;
  // AKA if they have matches with equal ranks, compare the values of those matches
  p.People.deleteAll();
  let testPerson2 = {"displayName":"Joe Shmoozer", "gender":"male", "name":{"givenName":"Schmoe"}, "emails":[{"type":"work", "value":"schmoe@test.com"}], "accounts":[{"domain":"foo.com","userid":"noob"}],
     "addresses":[{"streetAddress":"5678 State St"}]};
  p.People.add(testPerson2, testSvc, function() { });
  let testPerson = {"displayName":"Joe User", "gender":"male", "name":{"familyName":"User"}, "emails":[{"type":"work", "value":"joe@test.com"}], "accounts":[{"domain":"foo.com","userid":"foo"}],
     "addresses":[{"streetAddress":"1234 Main St"}]};
  p.People.add(testPerson, testSvc, function() { });

  results = null;
  p.People.findExternal([ "gender", "emails", "displayName"], function(people){results = people;}, null, {filter:"joe" });
  test.assertEqual(results.length, 2);
  test.assertEqual(results[0].displayName, "Joe Shmoozer");
  test.assertEqual(results[1].displayName, "Joe User");
    
  p.People.deleteAll();
  p.People.add(testPerson, testSvc, function() { });
  p.People.add(testPerson2, testSvc, function() { });

  results = null;
  p.People.findExternal([ "gender", "emails", "displayName"], function(people){results = people;}, null, {filter:"joe"});
  test.assertEqual(results.length, 2);
  test.assertEqual(results[0].displayName, "Joe Shmoozer");
  test.assertEqual(results[1].displayName, "Joe User");
  
  // TestBranch: if(aindex >= a.length && bindex >= b.length) break;
  // AKA if all of their matches are equal and they have the same amount of matches then return equal
  p.People.deleteAll();
  let testPerson2 = {"displayName":"Joe User", "gender":"male", "name":{"givenName":"Schmoe"}, "emails":[{"type":"work", "value":"schmoe@test.com"}], "accounts":[{"domain":"foo.com","userid":"noob"}],
       "addresses":[{"streetAddress":"5678 State St"}]};
  p.People.add(testPerson2, testSvc, function() { });
  let testPerson = {"displayName":"Joe User", "gender":"male", "name":{"familyName":"User"}, "emails":[{"type":"work", "value":"oe@test.com"}], "accounts":[{"domain":"foo.com","userid":"foo"}],
    "addresses":[{"streetAddress":"1234 Main St"}]};
  p.People.add(testPerson, testSvc, function() { });
  
  let result = p.People._find("json", {});
  test.assertEqual(result.length, 1);
  let resultObj = JSON.parse(result[0]);
  
  p.People.split(resultObj.guid, testSvc.name, testSvc.getPrimaryKey(testPerson));
  
  results = null;
  p.People.findExternal([ "gender", "emails", "displayName"], function(people){results = people;}, null, {filter:"joe" });
  test.assertEqual(results.length, 2);
  test.assertEqual(results[0].emails[0].value, "schmoe@test.com");
  test.assertEqual(results[1].emails[0].value, "oe@test.com");
  
  p.People.deleteAll();
  p.People.add(testPerson2, testSvc, function() { });
  p.People.add(testPerson, testSvc, function() { });

  let result = p.People._find("json", {});
  test.assertEqual(result.length, 1);
  let resultObj = JSON.parse(result[0]);
  // different person split means different "natural" order
  p.People.split(resultObj.guid, testSvc.name, testSvc.getPrimaryKey(testPerson2));
  
  results = null;
  p.People.findExternal([ "gender", "emails", "displayName"], function(people){results = people;}, null, {filter:"joe" });
  test.assertEqual(results.length, 2);
  test.assertEqual(results[0].emails[0].value, "oe@test.com");
  test.assertEqual(results[1].emails[0].value, "schmoe@test.com");
  
  // TestBranch: else if(aindex >= aarr.length) return -1;
  // AKA if all of their matches are equal but one has more matches than the other
  
  p.People.deleteAll();
  let testPerson2 = {"displayName":"Joe User", "gender":"male", "name":{"givenName":"Schmoe"}, "emails":[{"type":"work", "value":"schmoe@test.com"}], "accounts":[{"domain":"foo.com","userid":"noob"}],
       "addresses":[{"streetAddress":"5678 State St"}]};
  p.People.add(testPerson2, testSvc, function() { });
  let testPerson = {"displayName":"Joe User", "gender":"male", "name":{"familyName":"User"}, "emails":[{"type":"work", "value":"joe@test.com"}], "accounts":[{"domain":"foo.com","userid":"foo"}],
    "addresses":[{"streetAddress":"1234 Main St"}]};
  p.People.add(testPerson, testSvc, function() { });
  
  let result = p.People._find("json", {});
  test.assertEqual(result.length, 1);
  let resultObj = JSON.parse(result[0]);
  
  p.People.split(resultObj.guid, testSvc.name, testSvc.getPrimaryKey(testPerson));
  
  results = null;
  p.People.findExternal([ "gender", "emails", "displayName"], function(people){results = people;}, null, {filter:"joe" });
  test.assertEqual(results.length, 2);
  test.assertEqual(results[0].emails[0].value, "joe@test.com");
  test.assertEqual(results[1].emails[0].value, "schmoe@test.com");
  
  p.People.deleteAll();
  p.People.add(testPerson2, testSvc, function() { });
  p.People.add(testPerson, testSvc, function() { });

  let result = p.People._find("json", {});
  test.assertEqual(result.length, 1);
  let resultObj = JSON.parse(result[0]);
  // different person split means different "natural" order
  p.People.split(resultObj.guid, testSvc.name, testSvc.getPrimaryKey(testPerson2));
  
  results = null;
  p.People.findExternal([ "gender", "emails", "displayName"], function(people){results = people;}, null, {filter:"joe" });
  test.assertEqual(results.length, 2);
  test.assertEqual(results[0].emails[0].value, "joe@test.com");
  test.assertEqual(results[1].emails[0].value, "schmoe@test.com");
  
}

exports.testFindMergeHints = function(test){
  p.People.deleteAll();
  resetObservers();
  
  // Add another person that overlaps 
  let testPerson = {"displayName":"Schmoe User", "gender":"male", "name":{"givenName":"User"}, "emails":[{"type":"work", "value":"joeschmoe@test.com"}], "accounts":[{"domain":"foo.com","userid":"noob"}],
    "addresses":[{"streetAddress":"5678 State St"}]};
  let progressWasCalled = false;
  p.People.add(testPerson, testSvc, function() { progressWasCalled = true;});
  test.assert(progressWasCalled, "progressWasCalled != false");  
  test.assertEqual(jstr(testObservers(["add"])), "[true]");
  resetObservers();
  
  let answer = p.People._findMergeHints(testPerson, testSvc);
  test.assertEqual(answer.length, 1); 
   
  let guids = p.People._find("guid", {});
  test.assertEqual(guids.length, 1);
  
}

exports.testChangeGUID = function(test){
  p.People.deleteAll();
  resetObservers();
  
  // Add another person that overlaps 
  let testPerson = {"displayName":"Schmoe User", "gender":"male", "name":{"givenName":"User"}, "emails":[{"type":"work", "value":"joeschmoe@test.com"}], "accounts":[{"domain":"foo.com","userid":"noob"}],
    "addresses":[{"streetAddress":"5678 State St"}]};
  p.People.add(testPerson, testSvc, function() { });
   
  let guids = p.People._find("guid", {});
  test.assertEqual(guids.length, 1);
  
  let guid = guids[0];
  
  p.People.changeGUID(guid, "HELLOTHERESON");
  guids = p.People._find("guid", {});
  test.assertEqual(guids.length, 1);
  test.assertEqual(guids[0], "HELLOTHERESON"); 
}

exports.testLookups = function(test){
  p.People.deleteAll();
  resetObservers();
  
  // Add another person that overlaps 
  let testPerson = {"displayName":"Schmoe User", "gender":"male", "name":{"givenName":"User"}, "emails":[{"type":"work", "value":"joeschmoe@test.com"}], "accounts":[{"domain":"foo.com","userid":"noob"}],
    "addresses":[{"streetAddress":"5678 State St"}]};
  p.People.add(testPerson, testSvc, function() { });
  
  let finder = p.People._createMergeFinder(51);
  
  let mergeHintLookup = finder.mergeHintLookup;
  let guidMergeHintLookup = finder.guidMergeHintLookup;
  
  let guids = p.People._find("guid", {});
  test.assertEqual(guids.length, 1);
  
  let guid = guids[0];
  let info = guidMergeHintLookup[guid];
  test.assert(info != null);
  test.assertEqual(jstr(info),'[{"service":"test","user":"noob","positive":1}]');
  info = mergeHintLookup["testnoob1"];
  test.assert(info != null);
  test.assertEqual(info[0], guid);
  
}
