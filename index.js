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
    _ = require('lodash');

exports.deps = ['covistra-system'];

exports.register = function (server, options, next) {
    var MongoClient = P.promisifyAll(mongodb.MongoClient);

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

    var DataSeeder = require('./lib/data-seeder')(server, systemLog, config);

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
            else {

                // Perform data seeding
                var seedingCfg = config.get('plugins:mongodb:db-seeding');
                var plugins = config.get('plugins');

                return P.map(_.keys(plugins), function(pluginName) {
                    var plugin = plugins[pluginName];
                    if(plugin && plugin['seed-data']) {
                        systemLog.debug("Checking to seed data for plugin %s", pluginName);
                        return P.each(_.keys(plugin['seed-data']), function(dbName) {
                            systemLog.debug("Initiating seeding for database %s", dbName);
                            var ds = new DataSeeder(dbName, plugin['seed-data'][dbName], seedingCfg);
                            return ds.seed();
                        });
                    }
                });
            }
        }).then(function() {
            systemLog.info("All databases were successfully complete");
            next();
        });

    }).catch(function (err) {
        systemLog.error(err);
        next(err);
    });

};

exports.register.attributes = {
    pkg: require('./package.json')
};
