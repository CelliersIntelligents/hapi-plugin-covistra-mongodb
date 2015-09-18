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
var _ = require('lodash'),
    Boom = require('boom'),
    P = require('bluebird');

module.exports = function(server, log) {

    return function(dbName, collection, fields, options) {
        log.debug("Checking uniqueness in collection %s", collection, fields);
        options = options || {};

        var db = server.plugins['covistra-mongodb'][dbName || 'MAIN'];

        var coll = db.collection(collection);

        if(options.or) {
            var q = {$or:[]};

            _.each(_.keys(fields), function(key) {
                var o = {};
                o[key] = fields[key];
                q.$or.push(o);
            });
        }
        else {
            var q = {};
            _.each(_.keys(fields), function(key) {
                q[key] = fields[key];
            });
        }

        return P.promisify(coll.findOne, coll)(q).then(function(existing) {
            if(existing) {
                throw Boom.badRequest(options.msg || "provided value must be unique", fields);
            }
            else
                return true;
        });
    }
};
