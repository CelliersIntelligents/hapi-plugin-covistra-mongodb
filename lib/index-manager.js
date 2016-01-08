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
var P = require('bluebird'),
    _ = require('lodash');

module.exports = function(server, log) {

    function IndexManager() {
        this.indexes = [];
    }

    IndexManager.prototype.registerIndex = P.method(function(dbName, collectionName, indexSpec, options) {
        log.debug("IndexManager.registerIndex", dbName, collectionName);

        options = _.merge(options || {}, { background: true });

        this.indexes.push({
            dbName: dbName,
            collection: collectionName,
            keys: indexSpec,
            options: options
        });

        // If the database is already connected, let's create the index immediately
        if(server.plugins['covistra-mongodb'].dbs) {
            var dbi = _.find(server.plugins['covistra-mongodb'].dbs, function(d){return d.name === dbName});
            if(dbi) {
                log.debug("Found target database %s. Creating index immediately", dbi.name);
                var coll = dbi.db.collection(collectionName);
                return P.promisify(coll.createIndex, coll)(indexSpec, options).catch(function(err) {
                    log.warn("Unable to create index on collection %s. May affect system performance ", collectionName, err);
                });
            }
        }
        else {
            log.debug("Target database is not loaded yet. Indexes will be applied when it is connected");
        }
    });

    IndexManager.prototype.ensureIndexes = function(db, dbName) {
        log.debug("IndexManager.ensureIndexes", dbName);
        var dbIndexes = _.filter(this.indexes, function(idx){return idx.dbName === dbName });
        return P.map(dbIndexes, function(idx) {
            var coll = db.collection(idx.collection);
            return P.promisify(coll.createIndex, coll)(idx.keys, idx.options).catch(function(err) {
                log.warn("Unable to create index on collection %s. May affect system performance ", idx.collection, err);
            });
        }, { concurrency: 1});
    };

    return new IndexManager();
};
