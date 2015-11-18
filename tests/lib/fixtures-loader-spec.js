var expect = require('chai').expect;
var mongodb = require('mongodb');
var _ = require('lodash');
var P = require('bluebird');
var MongoClient = P.promisifyAll(mongodb.MongoClient);

describe('FixtureLoader', function() {

    var Fixtures;

    const MONGODB_URI = 'mongodb://localhost:27017/covistra_mongodb_test';

    var _checkCollection = P.method(function(dbOrUri, colName, expectedSize) {
        var dbPromise;

        if(_.isString(dbOrUri)) {
            dbPromise = MongoClient.connectAsync(dbOrUri, {safe:true, db: { slaveOk: true}});
        }
        else {
            dbPromise = P.resolve(dbOrUri);

        }

        return dbPromise.then(function(db) {
            var coll = db.collection(colName);
            return P.promisify(coll.count, coll)().then(function(size) {
                return size == expectedSize;
            }).finally(function() {
                db.close();
            });
        });
    });

    beforeEach(function() {
        Fixtures = require('../../lib/fixtures-loader');
    });

    afterEach(function(){
        Fixtures.closeAll();
    });

    it('should establish a connection to the given database if a URI is passed', function() {
        return Fixtures.load({
            uri: MONGODB_URI
        }).then(function(loader) {
            expect(loader).not.to.be.undefined;
            expect(loader.db).to.be.defined;
            expect(loader.uri).to.equal(MONGODB_URI);
        });
    });

    it('should reuse an existing database if a db instance is passed', function() {
        var db = { connected: true, close: function(){} };

        return Fixtures.load({
            db: db
        }).then(function(loader) {
            expect(loader).not.to.be.undefined;
            expect(loader.db).to.equal(db);
        });
    });

    it('should load all test fixtures', function() {
        return Fixtures.load({uri: MONGODB_URI}).then(function(loader) {
            return loader.loadFixtures('./tests/data/fixtures');
        }).then(function() {
            return P.join(
                _checkCollection(MONGODB_URI, 'test_collection', 2),
                _checkCollection(MONGODB_URI, 'test_collection2', 1)
            ).spread(function(col1, col2) {
                expect(col1).to.equal(true);
                expect(col2).to.equal(true);
            });
        });
    });

});