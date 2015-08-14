var P = require('bluebird'),
    vm = require('vm'),
    _ = require('lodash');

module.exports = function (server, log, config) {

    var MongoDB = server.plugins['covistra-mongodb'];
    var seedingTools = require('./seeding-tools')(server, log, config);

    function DataSeeder(dbName, seedSpec, seedingCfg) {
        this.db = MongoDB[dbName];
        this.seedSpec = seedSpec;
        this.seedingCfg = seedingCfg;
        this.dbName = dbName;
    }

    DataSeeder.prototype.seedNeeded = P.method(function (collectionName) {
        var _this = this;
        function checkForce() {
            if(!_this.seedingCfg)
                return false;

            if (_this.seedingCfg.force) {

                if (_this.seedingCfg.force === true) {
                    return true;
                }
                else {

                    if (_this.seedingCfg.force[_this.dbName] === true) {
                        return true;
                    }
                    else {
                        return _this.seedingCfg.force[_this.dbName][collectionName];
                    }
                }

            }

            return false;
        }

        var result = {
            needed: checkForce(),
            count: 0
        };

        // Check the number of records in each collection
        var coll = this.db.collection(collectionName);
        result.count = P.promisify(coll.count, coll)().then(function (total) {
            if (total === 0) {
                result.needed = true;
            }
            return total;
        });

        return P.props(result);
    });

    var _resetCollection = P.method(function(result, coll) {
        if(result.count > 0) {
            return P.promisify(coll.deleteMany, coll)({});
        }
    });

    DataSeeder.prototype.preProcessDocuments = P.method(function(docs) {
        var _this = this;
        return P.map(docs, function(doc) {
            _.forEach(_.keys(doc), function(fieldKey) {
                var val = doc[fieldKey];
                if(_.isString(val)) {
                    if(val.indexOf("js:{") !== -1) {
                        var script = val.match(/js:\{(.*?)\}/)[1];
                        if(script) {
                            doc[fieldKey] =_this.executeScript(script, doc);
                        }
                        else {
                            log.warn("Invalid replacement script %s", val);
                        }
                    }
                }
            });
            return P.props(doc);
        });
    });

    DataSeeder.prototype.executeScript = P.method(function(script, doc) {
        return vm.runInNewContext(script, seedingTools);
    });

    DataSeeder.prototype.seed = function () {
        var _this = this;
        return P.each(_.keys(this.seedSpec), function (collName) {

            // Check if we need to seed
            return _this.seedNeeded(collName).then(function (result) {
                if (result.needed) {
                    log.debug("Seeding data for collection %s:%s", _this.dbName, collName);
                    var coll = _this.db.collection(collName);
                    return _resetCollection(result, coll).then(function() {
                        return _this.preProcessDocuments(_this.seedSpec[collName]).then(function(docs) {
                            return P.promisify(coll.insertMany, coll)(docs).then(function (result) {
                                log.debug("%d document(s) inserted in collection %s:%s", result.insertedCount, _this.dbName, collName);
                            });
                        });

                    });
                }
                else {
                    log.debug("Seeding not needed for collection %s:%s", _this.dbName, collName);
                }
            });
        });

    };

    return DataSeeder;
}