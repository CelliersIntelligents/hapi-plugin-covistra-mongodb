
var P = require('bluebird'),
    mongodb = require('mongodb'),
    requireDirectory = require('require-directory'),
    path = require('path'),
    _ = require('lodash');

var MongoClient = P.promisifyAll(mongodb.MongoClient);

var _loaders = [];

/**
 *
 * @param spec
 *
 * uri : the uri of the mongodb
 * db: an existing db instance
 *
 * @constructor
 */
function Loader(spec) {

    this.db = spec.db;
    this.uri = spec.uri;
    if(!_.isUndefined(spec.clear)) {
        this.clear = spec.clear;
    }
    else {
        this.clear = true;
    }

    // We support overloading the DBClient for testing and to support other database implementations
    this.DBClient = spec.DBClient || MongoClient;
}

Loader.prototype.open = P.method(function() {
    var _this = this;

    if(!this.db) {
        if(this.uri) {
            return _this.DBClient.connectAsync(this.uri, {db: { slaveOk: true}}).then(function(db) {
                _this.db = db;
                return _this;
            });
        }
        else {
            throw new Error("uri or db must be specified in fixture loader spec");
        }
    }
    else {
        return this;
    }
});

var _performClear = P.method(function(clear, coll) {
    if(clear) {
        return P.promisify(coll.removeMany,coll)({});
    }
});

Loader.prototype.loadFixtures = P.method(function(fixturePath, options) {
    var _this = this;
    options = options || {};

    fixturePath = path.resolve(fixturePath);
    var specs = requireDirectory(module, fixturePath, { visit: function(collection) {
        if(_.isFunction(collection)) {
            var fn = P.method(collection);
            return fn(_this.db, options);
        }
        else {
            return collection;
        }
    }});

    return P.map(_.values(specs), function(fixtureSpec) {
        var coll = _this.db.collection(fixtureSpec.name);

        return _performClear(options.clear || _this.clear, coll)
        .then(function() {
            var upsert = fixtureSpec.upsert ? P.promisify(coll.updateOne, coll) : P.promisify(coll.insertOne, coll);
            return P.map(fixtureSpec.data, function(doc) {
                if(fixtureSpec.upsert) {
                    return upsert({_id: doc._id}, doc, {upsert: true});
                }
                else {
                    return upsert(doc);
                }
            });
        });

    });
});

Loader.prototype.close = P.method(function() {
    if(this.db) {
        this.db.close();
    }

});

module.exports = {
    load: function(spec) {
        var loader = new Loader(spec);
        _loaders.push(loader);
        return loader.open();
    },
    closeAll: function() {
        return P.map(_loaders, function(loader) {
            return loader.close();
        });
    }
};

