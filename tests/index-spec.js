var expect = require('chai').expect;
var sinon = require('sinon');
var bunyan = require('bunyan');

var logger = bunyan.createLogger({name: 'unit-test', level: 'warn'});

describe('MongoDB Plugin', function() {
    var plugin;

    beforeEach(function(){
        plugin = require('../.');
    });

    it('should expose dependencies', function() {
        expect(plugin.deps).to.be.an.array;
        expect(plugin.deps).to.eql(['covistra-system']);
    });

    it('should expose a register method', function() {
        expect(plugin.register).to.be.a.function;
    });

    describe('at registration time', function() {
        var server, options, mockExpose;

        beforeEach(function(done) {
            server = {
                plugins: {
                    'hapi-config': {
                        CurrentConfiguration: {
                            get: function() {}
                        }
                    },
                    'covistra-system':{
                        systemLog: logger
                    }
                },
                expose: function(){},
                decorate: function() {}
            };
            options = {};

            // Create all out stubs
            mockExpose = sinon.stub(server, "expose");

            plugin.register(server, options, done);
        });

        afterEach(function() {
            mockExpose.restore();
        });

        it('should expose 5 services', function() {
            expect(mockExpose.callCount).to.eql(5);
            expect(mockExpose.firstCall.args[0]).to.eql('schemaManager');
            expect(mockExpose.secondCall.args[0]).to.eql('indexManager');
            expect(mockExpose.args[2][0]).to.eql('uniqueCheck');
            expect(mockExpose.args[3][0]).to.eql('ObjectId');
            expect(mockExpose.args[4][0]).to.eql('dbs');
        });

    });

    describe('at registration time in test mode', function() {
        var server, options, mockExpose;

        beforeEach(function(done) {
            server = {
                plugins: {
                    'hapi-config': {
                        CurrentConfiguration: {
                            get: function() {}
                        }
                    },
                    'covistra-system':{
                        systemLog: logger
                    }
                },
                expose: function(){},
                decorate: function() {}
            };
            options = {testMode: true};

            // Create all out stubs
            mockExpose = sinon.stub(server, "expose");

            plugin.register(server, options, done);
        });

        afterEach(function() {
            mockExpose.restore();
        });

        it('should expose 9 services', function() {
            expect(mockExpose.callCount).to.eql(9);
            expect(mockExpose.firstCall.args[0]).to.eql('schemaManager');
            expect(mockExpose.secondCall.args[0]).to.eql('indexManager');
            expect(mockExpose.args[2][0]).to.eql('uniqueCheck');
            expect(mockExpose.args[3][0]).to.eql('ObjectId');
            expect(mockExpose.args[4][0]).to.eql('dbs');
            expect(mockExpose.args[5][0]).to.eql('cleanUp');
            expect(mockExpose.args[6][0]).to.eql('cleanUpRef');
            expect(mockExpose.args[7][0]).to.eql('loadFixtures');
            expect(mockExpose.args[8][0]).to.eql('setupTestMode');
        });

    });

});
