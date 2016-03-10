var requireDirectory = require('require-directory'),
    _ = require('lodash'),
    path = require('path'),
    P = require('bluebird');

module.exports = P.method(function(server, log, config, dbs, options) {

    log.info("Initializing test mode data");

    server.expose('cleanUp', function(dbName, collections, filter) {
        log.debug("Cleaning up test data in DB %s", dbName, collections);

        return P.map(collections, function(colName) {
            log.trace("Cleaning up test data in collection %s", colName);
            var dbSpec = _.find(dbs, function(d) { return d.name === dbName });
            if(dbSpec) {
                var coll = dbSpec.db.collection(colName);

                if(filter) {
                    log.trace("Cleaning only %s matching filter", colName, filter);
                    return P.promisify(coll.removeMany, coll)(filter);
                }
                else {
                    return P.promisify(coll.removeMany, coll)({});
                }
            }
            else {
                log.warn("Requested database %s has never been registered", dbName);
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
        var dbSpec = _.find(dbs, function(d) { return d.name === dbName });
        if(dbSpec) {
            var refCol = dbSpec.db.collection(refSpec.col);
            var q = {};
            var cursor = refCol.find(refSpec.select);
            return P.promisify(cursor.toArray, cursor)().then(function(refs) {
                log.debug("Found %d references to remove", refs.length);
                var keys = _.map(refs, function(r){ return r[refSpec.ref || refSpec.key] });
                var coll = dbSpec.db.collection(colName);
                q = {};
                q[refSpec.key] = { $in : keys };
                log.debug("Removing references matching", q);
                return P.promisify(coll.remove, coll)(q);
            });
        }
        else {
            log.warn("Requested database %s has never been registered", dbName);
        }
    });

    server.expose('loadFixtures', function(fixturePath) {
        return requireDirectory(module, fixturePath, { visit: function(collection) {
            log.debug("Loading fixture for collection %s", collection);
            if(_.isFunction(collection)) {
                return collection(server.plugins['covistra-mongodb'], server);
            }
            else {
                return collection;
            }
        }});
    });

    server.expose('setupTestMode', function(ctx) {
        log.info("Setup test mode helpers");
        ctx.cleanUp = server.plugins['covistra-mongodb'].cleanUp;
        ctx.cleanUpRef = server.plugins['covistra-mongodb'].cleanUpRef;

        ctx.ObjectId = server.plugins['covistra-mongodb'].ObjectId;

        // Load all test data
        ctx.data = ctx.callHook('load-fixtures', {ctx: ctx}, function() {
            return server.plugins['covistra-mongodb'].loadFixtures(path.resolve(config.get('plugins:mongodb:fixtures', './test/fixtures')));
        });


        return ctx;
    });

});
