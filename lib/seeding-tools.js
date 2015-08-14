var crypto = require('crypto');

module.exports = function(server, log, config) {

    return {
        encryptPassword: function(password) {
            log.debug("Encrypting password...");
            var sha1 = crypto.createHash("sha1");
            sha1.update(password);
            return sha1.digest('base64');
        }
    };
};
