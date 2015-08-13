/**

 Copyright 2015 Covistra Technologies Inc.

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */
"use strict";

var P = require('bluebird'),
    MongoClient = P.promisifyAll(require('mongodb').MongoClient),
    Fixtures = require('pow-mongodb-fixtures'),
    path = require('path'),
    _ = require('lodash');

exports.register = function (server, options, next) {

    // Retrieve a reference to the current system configuration
    var config = server.plugins['hapi-config'].CurrentConfiguration;
    var systemLog = server.plugins['covistra-system'].systemLog;

    systemLog.log.info("Registering the MongoDB plugin");

    var _db;

    server.log(['debug'], "Registering schema manager");

    // Expose schema manager
    var schemaManager = require('./lib/schema-manager')(server, systemLog.child({service: 'schemaManager'}));
    server.expose('schemaManager', schemaManager);

    // Expose a few helpers
    server.expose('uniqueCheck', require('./lib/unique-check')(server, systemLog));
    server.expose('ObjectId', mongodb.ObjectId);

    //TODO: Generic DBRef resolver (with field selection, promise-based)

    if (options.testMode) {
        systemLog.info("Configuring MongoDB in test mode");

        _db = MongoClient.connectAsync(config.get('MONGODB_URI'), {safe: true, db: {slaveOk: true}});

        P.join(_db).then(function (dbs) {
            systemLog.info("%d database(s) are connected", dbs.length);

            dbs['MAIN'] = dbs[0];
            server.expose("MAIN", dbs[0]);

            return dbs;
        }).catch(function (err) {
            systemLog.error(err);
        }).then(function (dbs) {
            systemLog.info("Loading all fixtures from %s", options.fixtures);

            server.expose('cleanUp', function(dbName, collections, filter) {
                systemLog.debug("Cleaning up test data in DB %s", dbName, collections);

                return P.map(collections, function(colName) {
                    systemLog.trace("Cleaning up test data in collection %s", colName);
                    var coll = dbs[dbName].collection(colName);

                    if(filter) {
                        systemLog.trace("Cleaning only %s matching filter", colName, filter);
                        return P.promisify(coll.remove, coll)(filter);
                    }
                    else {
                        return P.promisify(coll.remove, coll)({});
                    }
                });
            });

            /**
             * Cleanup a dependent tables based on the result of a reference query
             *
             * ex:
             *
             * To clean all aspects related to userRequest products:
             *
             * cleanUpRef('RAW', 'aspects', { col: 'products', key: 'AUPID', ref: 'AUPID', select: {'_t.userRequest': true} });
             *
             * key is the key field in the collection to remove.
             * ref is the key field in the reference collection. If ref is not provided, key will be used for both.
             *
             */
            server.expose('cleanUpRef', function(dbName, colName, refSpec) {
                systemLog.debug("Cleaning up referenced test data in DB %s", dbName, colName, refSpec);
                var refCol = dbs[dbName].collection(refSpec.col);
                var q = {};
                var cursor = refCol.find(refSpec.select);
                return P.promisify(cursor.toArray, cursor)().then(function(refs) {
                    systemLog.debug("Found %d references to remove", refs.length);
                    var keys = _.map(refs, function(r){ return r[refSpec.ref || refSpec.key] });
                    var coll = dbs[dbName].collection(colName);
                    q = {};
                    q[refSpec.key] = { $in : keys };
                    systemLog.debug("Removing references matching", q);
                    return P.promisify(coll.remove, coll)(q);
                });
            });

            // Create fixtures for all databases
            systemLog.debug("Creating all fixtures loaders");
            var loader = Fixtures.connect(config.get('MONGODB_URI'));

            return P.join(
                P.promisify(loader.clear, loader)()
            ).then(function() {

                // Recreate all indexes
                systemLog.debug("Create all required indexes in test databases");

                return P.join(
                    require('./lib/indexes/main')(dbs[0], systemLog)
                ).then(function() {
                    systemLog.debug("All indexes were created. Importing fixture data");
                    return P.join(
                        P.promisify(loader.load, loader)(options.fixtures+"/main")
                    ).then(function() {
                        systemLog.info("All fixtures were successfully loaded");
                    });
                }).catch(function(err) {
                    systemLog.warn('Something happen while we were trying to create indexes', err);
                });

            });

        }).then(next);

    }
    else {
        systemLog.debug( "Configuring MongoDB in prod mode");

        _db = MongoClient.connectAsync(config.get('MONGODB_URI'), {safe: true, db: {slaveOk: true}});

        P.join(_db).then(function (dbs) {
            systemLog.info("%d databases are connected", dbs.length);

            server.expose("MAIN", dbs[0]);

            // Make sure all indexes are created
            return P.join(
                require('./lib/indexes/main')(dbs[0], systemLog)
            ).then(function() {
                systemLog.info("All indexes were created or updated in all databases");
            });

        }).catch(function (err) {
            systemLog.error(err);
        }).then(next);
    }

};

exports.register.attributes = {
    pkg: require('./package.json')
};
