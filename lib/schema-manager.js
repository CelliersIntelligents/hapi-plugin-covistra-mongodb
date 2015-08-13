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
var Joi = require('joi'),
    P = require('bluebird');

module.exports = function(server, log) {

    function SchemaManager() {
        this.schemas = {};
    }

    SchemaManager.prototype.registerSchema = function(key, schema) {
        log.info("Registering schema %s", key);
        log.trace(schema);
        this.schemas[key] = schema;
    };

    SchemaManager.prototype.getSchema = function(key) {
        return this.schemas[key];
    };

    SchemaManager.prototype.validate = function(schemaKey, obj, options) {
        options = options || {convert: true};
        var schema = this.schemas[schemaKey];
        if(schema) {
            return P.promisify(Joi.validate, Joi)(obj, this.schemas[schemaKey], options);
        }
        else {
            return P.resolve(obj);
        }
    };

    return new SchemaManager();
};
