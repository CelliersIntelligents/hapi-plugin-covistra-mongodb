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
    mongodb = require('mongodb'),
    path = require('path'),
    _ = require('lodash');

var MongoClient = P.promisifyAll(mongodb.MongoClient);

exports.register = function (server, options, next) {

    server.dependency(['covistra-system'], function(plugin, done) {

        // Retrieve a reference to the current system configuration
        var config = server.plugins['hapi-config'].CurrentConfiguration;
        var systemLog = server.plugins['covistra-system'].systemLog;

        systemLog.info("Registering the MongoDB plugin");
        systemLog.debug("Registering schema manager");

        // Expose schema manager
        var schemaManager = require('./lib/schema-manager')(server, systemLog.child({service: 'schema-manager'}));
        server.expose('schemaManager', schemaManager);

        // Expose index manager
        var indexManager = require('./lib/index-manager')(server, systemLog.child({service: 'index-manager'}));
        server.expose('indexManager', indexManager);

        // Expose a few helpers
        server.expose('uniqueCheck', require('./lib/unique-check')(server, systemLog));
        server.expose('ObjectId', mongodb.ObjectId);

        //TODO: Generic DBRef resolver (with field selection, promise-based)

        systemLog.debug( "Connecting to all configured MongoDB databases");

        // Looping through all configured DB instances
        return P.map(config.get('plugins:mongodb:dbs') || [], function(dbs) {
            systemLog.debug("Configuring database %s (%s)", dbs.name, dbs.uri);
            return MongoClient.connectAsync(dbs.uri, _.defaults(dbs.options || {}, {safe:true, db: { slaveOk: true}})).then(function(db) {
                server.expose(dbs.name, db);
                return {
                    name: dbs.name,
                    uri: dbs.uri,
                    db: db
                };
            });

        }).then(function(dbs) {
            server.expose('dbs', dbs);
            systemLog.info("%d database(s) have been connected", dbs.length);
            return P.map(dbs, function(db) {
                return indexManager.ensureIndexes(db.db, db.name);
            }).then(function() {
                systemLog.info("All indexes were created or updated in all databases");
                if(options.testMode) {
                    return require('./test/setup-test-mode')(server, systemLog, config, dbs, options);
                }
                else
                    done();
            });
        }).catch(function (err) {
            systemLog.error(err);
            done(err);
        });

    });

    next();


};

exports.register.attributes = {
    pkg: require('./package.json')
};
