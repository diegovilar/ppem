(function(global, undefined) {
    "use strict";

    // imports
    var extend = require("extend"),
        clone = require("clone"),
        path = require('path'),
        fs = require('fs'),
        PPem = require("../src/PPem.js");

    function createFactory(a, b) {
        var len = arguments.length;
        return function() {
            switch (len) {
                case 0:
                    return new PPem();
                    break;
                case 1:
                    return new PPem(a);
                    break;
                default:
                    return new PPem(a, b);
            }
        }
    }

    var defaultOptions = {
        baseDir : '.',
        includes : {},
        errorSourceAhead : 50
    };

    var instance;

    describe("instantiation", function() {

        describe('no arguments', function() {

            it('should instantiate without arguments', function() {
                instance = new PPem();
                expect(instance instanceof PPem).toBe(true);
            });

            it('should have no global defines', function() {
                expect(instance._defines).toEqual({});
            });

            it('should have default options', function() {
                // We do not test verbose, since _parseOptions() changes it.

                var options = instance._options;

                expect(options.baseDir).toBe(defaultOptions.baseDir);
                expect(options.includes).toEqual(defaultOptions.includes);
                expect(options.errorSourceAhead).toBe(defaultOptions.errorSourceAhead);
            });

        });

        describe('globalDefines argument', function() {

            var globalDefines = {
                DEBUG : true,
                OBJECT : {a:1, b:[1,"2",[], "complex string'\"\\ \t\n\r\0"]},
                ARRAY : [1,2,3]
            };

            it('should only accept undefined, null or objects', function() {
                expect(createFactory(undefined)).not.toThrow();
                expect(createFactory(null)).not.toThrow();
                expect(createFactory({})).not.toThrow();
                expect(createFactory([])).not.toThrow();
                expect(createFactory(new Date())).not.toThrow();
                expect(createFactory(1)).toThrow();
                expect(createFactory(false)).toThrow();
                expect(createFactory('')).toThrow();
            });

            it('should stringify global defines if they are passed', function() {
                instance = new PPem(globalDefines);
                expect(instance._defines.DEBUG).toEqual(JSON.stringify(globalDefines.DEBUG));
                expect(instance._defines.OBJECT).toEqual(JSON.stringify(globalDefines.OBJECT));
                expect(instance._defines.ARRAY).toEqual(JSON.stringify(globalDefines.ARRAY));
            });

        });

        describe('options argument', function () {

            function verboseCallback(){}

            it('should only accept undefined, null or objects', function() {
                expect(createFactory(null, undefined)).not.toThrow();
                expect(createFactory(null, null)).not.toThrow();
                expect(createFactory(null, {})).not.toThrow();
                expect(createFactory(null, [])).not.toThrow();
                expect(createFactory(null, new Date())).not.toThrow();
                expect(createFactory(null, 1)).toThrow();
                expect(createFactory(null, false)).toThrow();
                expect(createFactory(null, '')).toThrow();
            });

            it('should inherit all options if they are passed', function() {
                var testOptions = {
                    baseDir : 'abc',
                    includes : {a:1, b:2},
                    errorSourceAhead : 10,
                    verbose : verboseCallback
                };

                instance = new PPem(null, testOptions);

                expect(instance._options).toEqual(testOptions);
            });

            it('should use defaults for options not passed', function() {
                function testOptions(options) {
                    options.verbose = verboseCallback;
                    var expected = extend(clone(defaultOptions), options);
                    instance = new PPem(null, options);
                    expect(instance._options).toEqual(expected);
                }

                testOptions({baseDir: 'xxx'});
                testOptions({includes: {x: 1, y: 2}});
                testOptions({errorSourceAhead: 1});
            });

            describe('verbose option', function () {

                it('should cause a noop function to be used if not provided', function () {
                    instance = new PPem();
                    expect(instance._options.verbose.__name).toBe('noop');
                });

                it('should cause the default implementation to be used if provieded as truthy', function () {
                    instance = new PPem(null, {verbose : 1});
                    expect(instance._options.verbose.__name).toBe('default');
                });

                it('should cause a noop function to be used if provieded as falsy', function () {
                    instance = new PPem(null, {verbose : 0});
                    expect(instance._options.verbose.__name).toBe('noop');
                });

                it('should cause the passed function to be used when it is passed', function () {
                    function customVerbose(){}

                    instance = new PPem(null, {verbose : customVerbose});
                    expect(instance._options.verbose).toBe(customVerbose);
                });

            });


        });



    });

    describe('main process method', function () {

        describe('source argument', function () {

            instance = new PPem();

            it('should return null if not provided', function () {
                expect(instance.process()).toBe(null);
            });

            it('should return null if null is provided', function () {
                expect(instance.process(null)).toBe(null);
            });

            it('should return null if does not find directives to process', function () {
                expect(instance.process('')).toBe(null);
                expect(instance.process('no directives here')).toBe(null);
            });

        });

    });

    describe('c-like source code processing', function () {

        beforeEach(function() {
            instance = new PPem();
        });

        describe('ifdef directive', function () {

            var source =
                "I SHOULD STAY\n" +
                "//#ifdef FLAG\n" +
                "I SHOULD GET LOST;\n" +
                "//#endif\n" +
                "I SHOULD STAY TOO";

            it('should discard source if test evaluates to falsy', function () {
                var expected = 'I SHOULD STAY\nI SHOULD STAY TOO';
                var result = instance.processClike(source);
                expect(result).toBe(expected);
            });

            it('should keep source if test evaluates to truthy', function () {
                var expected = 'I SHOULD STAY\nI SHOULD GET LOST;\nI SHOULD STAY TOO';
                var result = instance.processClike(source, {FLAG : 1});
                expect(result).toBe(expected);
            });

        });

        describe('ifndef directive', function () {

            var source =
                "I SHOULD STAY\n" +
                "// #ifndef FLAG\n" +
                "I SHOULD GET LOST;\n" +
                "// #endif\n" +
                "I SHOULD STAY TOO";

            it('should discard source if test evaluates to truthy', function () {
                var expected = 'I SHOULD STAY\nI SHOULD GET LOST;\nI SHOULD STAY TOO';
                var result = instance.processClike(source);
                expect(result).toBe(expected);
            });

            it('should keep source if test evaluates to falsy', function () {
                var expected = 'I SHOULD STAY\nI SHOULD STAY TOO';
                var result = instance.processClike(source, {FLAG : 1});
                expect(result).toBe(expected);
            });

        });

        describe('if directive', function () {

            var source =
                "I SHOULD STAY\n" +
                "//#if FLAG\n" +
                "I SHOULD GET LOST;\n" +
                "//#endif\n" +
                "I SHOULD STAY TOO";

            it('should discard source if test evaluates to falsy', function () {
                var expected = 'I SHOULD STAY\nI SHOULD STAY TOO';
                var result = instance.processClike(source, {FLAG : 0});
                expect(result).toBe(expected);
            });

            it('should keep source if test evaluates to truthy', function () {
                var expected = 'I SHOULD STAY\nI SHOULD GET LOST;\nI SHOULD STAY TOO';
                var result = instance.processClike(source, {FLAG : 1});
                expect(result).toBe(expected);
            });

            it('should throw error if expression fails to evaluate', function () {
                function test() {
                    // here, FLAG is not defined, so a ReferenceError must occur
                    instance.processClike(source);
                }
                expect(test).toThrow();
            });

        });

        describe('else directive', function () {

            var source =
                '//#if FLAG\n' +
                'TRUE\n' +
                '//#else\n' +
                'FALSE\n' +
                '//#endif';

            it('should discard source if test evaluates to truthy', function () {
                var expected = 'TRUE\n';
                var result = instance.processClike(source, {FLAG : 1});
                expect(result).toBe(expected);
            });

            it('should keep source if test evaluates to falsy', function () {
                var expected = 'FALSE\n';
                var result = instance.processClike(source, {FLAG : 0});
                expect(result).toBe(expected);
            });

        });

        // FIXME #elif
        xdescribe('elif directive', function () {

            var source =
                '//#if NUM == 0\n' +
                '0\n' +
                '//#elif NUM == 1\n' +
                '1\n' +
                '//#endif';

            it('should discard source if test evaluates to truthy', function () {
                expect(instance.processClike(source, {NUM : 0})).toBe('0\n');
                expect(instance.processClike(source, {NUM : 1})).toBe('2\n');
                expect(instance.processClike(source, {NUM : 2})).toBe('');
            });

        });

        describe('put, define and function directives', function () {

            it('should put evaluated expressions', function () {
                var source = '//#put Math.PI + 1';
                expect(instance.processClike(source)).toBe(Math.PI +  1 + '');
            });

            it('should create a local definition and evaluate it', function () {
                var source = '//#define LOCAL=1\n//#put LOCAL';
                expect(instance.processClike(source)).toBe('1');
            });

            it('should override a local definition and evaluate it', function () {
                var source = '//#define LOCAL=1\n//#define LOCAL=2\n//#put LOCAL';
                expect(instance.processClike(source)).toBe('2');
            });

            it('should put a global definition', function () {

                var globalString = 'i\'m a complex "string" global def ("\"\t\n\r\0)',
                    globalNumber = 1,
                    globalObject = {a:globalString},
                    globalArray = [1,globalString,3],
                    globalIdFunction = function(x) {return x};

                instance = new PPem({
                    STRING : globalString,
                    NUMBER : globalNumber,
                    OBJECT : globalObject,
                    ARRAY : globalArray,
                    ID : globalIdFunction
                }, {
                    baseDir: './spec'
                });

                expect(instance.processClike('//#put STRING')).toBe(globalString);
                expect(instance.processClike('//#put NUMBER')).toBe(globalNumber + '');
                expect(instance.processClike('//#put OBJECT')).toEqual(globalObject + '');
                expect(instance.processClike('//#put ARRAY')).toBe(globalArray + '');
                expect(instance.processClike('//#put ID(1)')).toBe('1');
            });

            it('should define a local function', function () {
                var source =
                    "//#function sum(a,b) { return a + b; }\n" +
                    "//#put sum(1,2)";

                expect(instance.processClike(source)).toBe('3');
            });

        });

        describe('include directive', function () {

            it('should throw an error if does not find the file', function () {
                function test() {
                    instance.processClike('//#include "ghost"');
                }
                expect(test).toThrow();
            });

            it('should include the contents a existing file', function () {
                var source = '//#include "included.js"',
                    searchPaths = ['spec'],
                    expected = '//I WAS INCLUDED by included.js\n' +
                        '//I WAS INCLUDED by nestedInclude.js';

                expect(instance.processClike(source, null, searchPaths)).toBe(expected);
            });

        });

    });

})(this);
