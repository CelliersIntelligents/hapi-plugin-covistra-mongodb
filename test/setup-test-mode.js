var Fixtures = require('pow-mongodb-fixtures'),
    P = require('bluebird');

module.exports = function(server, log, config, dbs, options) {

    log.info("Loading all fixtures from %s", options.fixtures);

    server.expose('cleanUp', function(dbName, collections, filter) {
        log.debug("Cleaning up test data in DB %s", dbName, collections);

        return P.map(collections, function(colName) {
            log.trace("Cleaning up test data in collection %s", colName);
            var coll = dbs[dbName].collection(colName);

            if(filter) {
                log.trace("Cleaning only %s matching filter", colName, filter);
                return P.promisify(coll.removeMany, coll)(filter);
            }
            else {
                return P.promisify(coll.removeMany, coll)({});
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
        log.debug("Cleaning up referenced test data in DB %s", dbName, colName, refSpec);
        var refCol = dbs[dbName].collection(refSpec.col);
        var q = {};
        var cursor = refCol.find(refSpec.select);
        return P.promisify(cursor.toArray, cursor)().then(function(refs) {
            log.debug("Found %d references to remove", refs.length);
            var keys = _.map(refs, function(r){ return r[refSpec.ref || refSpec.key] });
            var coll = dbs[dbName].collection(colName);
            q = {};
            q[refSpec.key] = { $in : keys };
            log.debug("Removing references matching", q);
            return P.promisify(coll.remove, coll)(q);
        });
    });

    return P.map(dbs, function(dbSpec) {

        // Create fixtures for all databases
        log.debug("Creating all fixtures loaders for database %s", dbSpec.name);
        var loader = Fixtures.connect(dbSpec.uri);

        return P.promisify(loader.clear, loader)().then(function() {
            return P.promisify(loader.load, loader)(options.fixtures+"/"+dbSpec.name).then(function() {
                log.info("All fixtures were successfully loaded");
            });
        }).then(function(){
            log.info("test mode setup complete");
        });

    }).catch(function(err) {
        log.warn('Something happen while we were trying to setup test mode', err);
    });

};