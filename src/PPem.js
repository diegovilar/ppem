(function () {

    /**
     * Evaluates Javascript code in non strict mode
     *
     * @returns {Object}
     */
    function nonStrictEval() {

        this.instance._options.verbose('>  Evaluating: ' + this.expression);
        this.instance._options.verbose(">    Global defines:  " + this.JSON.stringify(this.instance._defines));
        this.instance._options.verbose(">    Local defines:   " + this.JSON.stringify(this.localDefines));

        for (this.key in this.instance._defines) {
            if (this.instance._defines.hasOwnProperty(this.key)) {
                this.def = this.instance._defines[this.key];
                eval("var " + this.key + " = " + this.def + ";");
            }
        }

        for (this.key in this.localDefines) {
            if (this.localDefines.hasOwnProperty(this.key)) {
                this.def = this.localDefines[this.key];
                eval("var " + this.key + " = " + this.def + ";");
            }
        }

        return eval(this.expression);

    }

    (function(global, undefined) {
        "use strict";

        // imports
        var extend = require("extend"),
            clone = require("clone"),
            lodash = require('lodash'),
            fs = require("fs"),
            path = require("path");

        lodash.templateSettings.interpolate = /{([^}\n\r]+)}/g;

        var NODE = (typeof window == 'undefined' || !window.window) && typeof require == 'function';


        // region << Type definitions >>
        /**
         * @typedef {object} MatchingPatterns
         * @property {RegExp} EXPR
         * @property {RegExp} INCLUDE
         * @property {RegExp} IF
         * @property {RegExp} ENDIF
         * @property {RegExp} PUT
         * @property {RegExp} DEFINE
         * @property {RegExp} FUNCTION
         */

        /**
         * @typedef {Object} PreprocessorOptions
         * @property {?string} [baseDir]
         * @property {?string[]} [includes]
         * @property {?number} [errorSourceAhead]
         * @property {?(boolean|function)} [verbose]
         */
        ;
        // endregion << Type definitions >>



        // region << helpers >>
        function noop(){}
        noop.__name = "noop"; // for testing in the spec

        function throwError(message, method, errorConstructor) {

            var path = ['ppall', 'PPem'],
                errorMessageTemplate = "{path} > {message}.";

            message = message == null ? '' : message + '';
            method = method || '';
            errorConstructor = errorConstructor || Error;

            method && path.push(method);
            path = path.join('.');

            throw new errorConstructor(lodash.template(errorMessageTemplate, {path: path, message: message}));

        }

        function isString(value) {

            // TODO Handle String from another frame
            return (typeof value == 'string') || (value instanceof String);

        }

        function isNumber(value) {

            // TODO Handle Number from another frame
            return ((typeof value == 'number') || (value instanceof Number)) && !isNaN(value) && isFinite(value);

        }

        function isObject(value) {

            return value && (typeof value == 'object');

        }

        function isArray(value) {

            return value && Array.isArray(value);

        }

        function isFunction(value) {

            return typeof value == 'function';

        }
        // endregion << helpers >>



        // region << Provided patterns >>
        /**
         *
         * @type {MatchingPatterns}
         */
        var CLIKE_PATTERNS = {
            EXPR : /([ \t]*)\/\/[ \t]*#(ifn?def|if|endif|else|elif|put|define|function|include(?![ \t]+file))/g,
            INCLUDE : /include[ \t]+"([^"\n\r]+)"[ \t]*(\r|\r?\n|$)/g,
            IF : /(ifdef|ifndef|if)[ \t]+([^\r\n]+)[ \t]*(\r|\r?\n|$)/g,
            ENDIF : /(endif|else|elif)([ \t]+[^\r\n]+)?[ \t]*(\r|\r?\n|$)/g,
            PUT : /put[ \t]+([^\n\r]+)[ \t]*(\r|\r?\n|$)/g,
            DEFINE : /define[ \t]+([^\\\/\n\r\.,'"\-+(\)\]\[\]\{\}]+)[ \t]*=([^\n\r]+)[ \t]*(\r|\r?\n|$)/g,
            FUNCTION : /function[ \t]+(?:([a-zA-Z_$]+[a-zA-Z0-9_$]+)[ \t]*(\((?:[^\n\r\(\)]*)\)[ \t]*{[^\n\r]*}))[ \t]*(\r|\r?\n|$)/g
        };

        /**
         *
         * @type {MatchingPatterns}
         */
        var XML_PATTERNS = {
            EXPR : /([ \t]*)<!--[ \t]*#(ifn?def|if|endif|else|elif|put|define|function|include(?![ \t]+file))/g,
            INCLUDE : /include[ \t]+"([^"\n\r]+)"[ \t]*-->[ \t]*(\r|\r?\n|$)/g,
            IF : /(ifdef|ifndef|if)[ \t]+([^\r\n]+)[ \t]*-->[ \t]*(\r|\r?\n|$)/g,
            ENDIF : /(endif|else|elif)([ \t]+[^\r\n]+)?[ \t]*-->[ \t]*(\r|\r?\n|$)/g,
            PUT : /put[ \t]+([^\n\r]+)[ \t]*-->[ \t]*(\r|\r?\n|$)/g,
            DEFINE : /define[ \t]+([^\\\/\n\r\.,'"\-+(\)\]\[\]\{\}]+)[ \t]*=([^\n\r]+)[ \t]*-->[ \t]*(\r|\r?\n|$)/g,
            FUNCTION : /function[ \t]+(?:([a-zA-Z_$]+[a-zA-Z0-9_$]+)[ \t]*(\((?:[^\n\r\(\)]*)\)[ \t]*{[^\n\r]*}))[ \t]*-->[ \t]*(\r|\r?\n|$)/g
        };

        /**
         *
         * @type {MatchingPatterns}
         */
        var SHTML_PATTERNS = {
            EXPR : /([ \t]*)<!--[ \t]*\/\/[ \t]*#(ifn?def|if|endif|else|elif|put|define|function|include(?![ \t]+file))/g,
            INCLUDE : /include[ \t]+"([^"\n\r]+)"[ \t]*-->[ \t]*(\r|\r?\n|$)/g,
            IF : /(ifdef|ifndef|if)[ \t]+([^\r\n]+)[ \t]*-->[ \t]*(\r|\r?\n|$)/g,
            ENDIF : /(endif|else|elif)([ \t]+[^\r\n]+)?[ \t]*-->[ \t]*(\r|\r?\n|$)/g,
            PUT : /put[ \t]+([^\n\r]+)[ \t]*-->[ \t]*(\r|\r?\n|$)/g,
            DEFINE : /define[ \t]+([^\\\/\n\r\.,'"\-+(\)\]\[\]\{\}]+)[ \t]*=([^\n\r]+)[ \t]*-->[ \t]*(\r|\r?\n|$)/g,
            FUNCTION : /function[ \t]+(?:([a-zA-Z_$]+[a-zA-Z0-9_$]+)[ \t]*(\((?:[^\n\r\(\)]*)\)[ \t]*{[^\n\r]*}))[ \t]*-->[ \t]*(\r|\r?\n|$)/g
        };

        /**
         *
         * @type {MatchingPatterns}
         */
        var CSS_PATTERNS = {
            EXPR : /([ \t]*)\/\*[ \t]*#(ifn?def|if|endif|else|elif|put|define|function|include(?![ \t]+file))/g,
            INCLUDE : /include[ \t]+"([^"\n\r]+)"[ \t]*\*\/[ \t]*(\r|\r?\n|$)/g,
            IF : /(ifdef|ifndef|if)[ \t]+([^\r\n]+)[ \t]*\*\/[ \t]*(\r|\r?\n|$)/g,
            ENDIF : /(endif|else|elif)([ \t]+[^\r\n]+)?[ \t]*\*\/[ \t]*(\r|\r?\n|$)/g,
            PUT : /put[ \t]+([^\n\r]+)[ \t]*\*\/[ \t]*(\r|\r?\n|$)/g,
            DEFINE : /define[ \t]+([^\\\/\n\r\.,'"\-+(\)\]\[\]\{\}]+)[ \t]*=([^\n\r]+)[ \t]*\*\/[ \t]*(\r|\r?\n|$)/g,
            FUNCTION : /function[ \t]+(?:([a-zA-Z_$]+[a-zA-Z0-9_$]+)[ \t]*(\((?:[^\n\r\(\)]*)\)[ \t]*{[^\n\r]*}))[ \t]*\*\/[ \t]*(\r|\r?\n|$)/g
        };
        // endregion << Provided patterns >>


        /**
         *
         * @type {PreprocessorOptions}
         */
        var DEFAULT_OPTIONS = {
            baseDir : '.',
            includes : [],
            errorSourceAhead : 100,
            verbose : false
        };


        /**
         *
         *
         * @class PPem
         * @constructor
         * @param {?object} [globalDefines]
         * @param {?PreprocessorOptions} [options]
         */
        function PPem(globalDefines, options) {

            globalDefines = globalDefines == null ? {} : isObject(globalDefines) ? globalDefines : TypeError;
            options = options == null ? {} : isObject(options) ? options : TypeError;

            if (globalDefines === TypeError) {
                throwError('first argument, if passed, must be an object', null, TypeError);
            }

            if (options === TypeError) {
                throwError('second argument, if passed, must be an object', null, TypeError);
            }

            /**
             *
             * @type {*}
             */
            this._options = extend(true, clone(DEFAULT_OPTIONS), options);
            Object.defineProperty(this, '_options', {
                enumerable: false,
                writable: false,
                configurable: false
            });

            this._parseOptions();
            // TODO seal recursively
            this._options.includes.push(process.cwd());

            this._defines = clone(globalDefines);
            Object.defineProperty(this, '_defines', {
                enumerable: false,
                writable: false,
                configurable: false
            });
            this._parseGlobalDefines();
            // TODO seal recursively

        }

        PPem.verbose = function() {

            var msg = '';

            for (var i = 0; i < arguments.length; i++) {
                msg += arguments[i] + ' ';
            }

            msg = msg.trim();
            msg.length && console && console.log && console.log(msg);

        };
        PPem.verbose.__name = 'default'; // for testing in the spec

        /**
         * Strips slashes from an escaped string.
         * @param {string} str Escaped string
         * @return {string} Unescaped string
         * @expose
         */
        PPem.stripSlashes = function(str) {

            // ref: http://phpjs.org/functions/stripslashes/
            return (str + '').replace(/\\(.?)/g, function (s, n1) {
                switch (n1) {
                    case '\\': return '\\';
                    case '0': return '\u0000';
                    case '': return '';
                    default: return n1;
                }
            });

        };

        /**
         * Indents a multi-line string.
         * @param {string} str Multi-line string to indent
         * @param {string} indent Indent to use
         * @return {string} Indented string
         * @expose
         */
        PPem.indent = function(str, indent) {

            var lines = str.split("\n");
            for (var i=0; i<lines.length; i++) {
                lines[i] = indent + lines[i];
            }
            return lines.join("\n");

        };

        /**
         * Transforms a string for display in error messages.
         * @param {string} str String to transform
         * @return {string}
         * @expose
         */
        PPem.nlToStr = function(str) {

            str = '' + str;
            return '['+str.replace(/\r/g, "").replace(/\n/g, "\\n")+']';

        };


        function processClike(source, localDefines, includeSearchPaths) {

            return this.process(source, localDefines, CLIKE_PATTERNS, includeSearchPaths);

        }

        function processXml(source, localDefines, includeSearchPaths) {

            return this.process(source, localDefines, XML_PATTERNS, includeSearchPaths);

        }

        function processShtml(source, localDefines, includeSearchPaths) {

            return this.process(source, localDefines, SHTML_PATTERNS, includeSearchPaths);

        }

        function processCss(source, localDefines, includeSearchPaths) {

            return this.process(source, localDefines, CSS_PATTERNS, includeSearchPaths);

        }

        /**
         * @typedef {object} IncludeFileDescriptor
         * @property {string} absoluteFilePath
         * @property {string} path
         * @property {string} contents
         */

        /**
         *
         * @param {string} filePath
         * @param {string[]} searchPaths
         * @returns {IncludeFileDescriptor}
         */
        function getFileDescriptor(filePath, searchPaths) {

            var file,
                found = false,
                descriptor;

            var i,
                searchPath,
                len = searchPaths.length;
            for (i = 0; i < len; i++) {
                searchPath = path.resolve(searchPaths[i]);
                file = path.resolve(searchPath + '/' + filePath);
                if (fs.existsSync(file)) {
                    found = true;
                    break
                }
            }

            if (found) {
                descriptor = {
                    absoluteFilePath : file,
                    path : searchPath,
                    contents : fs.readFileSync(file, {encoding: 'utf8'}) // TODO get from options?
                };

                return descriptor;
            } else {
                throw new Error('Could not resolve "' + filePath + '" to a valid file in the searched paths: ' + searchPaths);
            }
        }



        PPem.prototype = {

            /**
             *
             *
             * @param {string} source
             * @param {?object} [localDefines]
             * @param {?MatchingPatterns} [patterns]
             * @param {?string[]} [includeSearchPaths]
             * @returns {?string}
             */
            process : function(source, localDefines, patterns, includeSearchPaths) {

                var verbose = this._options.verbose;
                var globalDefines = this._defines;

                source = source == null ? '' : '' + source;
                localDefines = localDefines || {};
                patterns = clone(patterns || CLIKE_PATTERNS);

                includeSearchPaths = includeSearchPaths || [];
                includeSearchPaths = includeSearchPaths.concat(this._options.includes);

                var match, match2, include, p, stack = [];
                var touched = false;

                while ((match = patterns.EXPR.exec(source)) !== null) {
                    touched = true;

                    verbose(match[2]+" @ "+match.index+"-"+patterns.EXPR.lastIndex);

                    var indent = match[1];

                    switch (match[2]) {
                        case 'include':
                            patterns.INCLUDE.lastIndex = match.index;

                            if ((match2 = patterns.INCLUDE.exec(source)) === null) {
                                throw(new Error("Illegal #"+match[2]+": "+source.substring(match.index, match.index+this._options.errorSourceAhead)+"..."));
                            }

                            include = PPem.stripSlashes(match2[1]);
                            verbose("  incl: "+include);

                            try {
                                var key = include,
                                    descriptor = getFileDescriptor(include, includeSearchPaths),
                                    newIncludeSearchPaths = includeSearchPaths.slice(0);

                                newIncludeSearchPaths.unshift(descriptor.path);
                                include = this.process(descriptor.contents, localDefines, patterns, newIncludeSearchPaths) || descriptor.contents;
                                include = PPem.indent(include, indent);
                                this._options.includes[key] = include;
                            }
                            catch (e) {
                                throwError(e + '', 'process');
                            }

                            source = source.substring(0, match.index) + include + source.substring(patterns.INCLUDE.lastIndex);
                            //patterns.EXPR.lastIndex = stack.length > 0 ? stack[stack.length-1].lastIndex : 0; // Start over again
                            patterns.EXPR.lastIndex = match.index + include.length;
                            verbose("  continue at "+patterns.EXPR.lastIndex);
                            break;

                        case 'put':
                            patterns.PUT.lastIndex = match.index;

                            if ((match2 = patterns.PUT.exec(source)) === null) {
                                throw(new Error("Illegal #"+match[2]+": "+source.substring(match.index, match.index+this._options.errorSourceAhead)+"..."));
                            }

                            include = match2[1];
                            verbose("  expr: "+match2[1]);
                            include = this._evaluate(match2[1], localDefines);
                            verbose("  value: "+PPem.nlToStr(include));
                            source = source.substring(0, match.index)+indent+include+match2[2]+source.substring(patterns.PUT.lastIndex);

                            patterns.EXPR.lastIndex = match.index + include.length;
                            verbose("  continue at "+patterns.EXPR.lastIndex);
                            break;

                        case 'ifdef':
                        case 'ifndef':
                        case 'if':
                            patterns.IF.lastIndex = match.index;

                            if ((match2 = patterns.IF.exec(source)) === null) {
                                throw(new Error("Illegal #"+match[2]+": "+source.substring(match.index, match.index+this._options.errorSourceAhead)+"..."));
                            }

                            verbose("  test: "+match2[2]);

                            if (match2[1] == "ifdef") {
                                include = globalDefines.hasOwnProperty(match2[2]);
                                include = localDefines.hasOwnProperty(match2[2]) ? !!localDefines[match2[2]] : include;
                            }
                            else if (match2[1] == "ifndef") {
                                include = !globalDefines.hasOwnProperty(match2[2]);
                                include = localDefines.hasOwnProperty(match2[2]) ? !localDefines[match2[2]] : include;
                            }
                            else {
                                include = this._evaluate(match2[2], localDefines);
                            }

                            verbose("  value: "+include);

                            stack.push(p={
                                "include": include,
                                "index": match.index,
                                "lastIndex": patterns.IF.lastIndex
                            });

                            verbose("  push: "+JSON.stringify(p));
                            break;

                        case 'endif':
                        case 'else':
                        case 'elif':
                            patterns.ENDIF.lastIndex = match.index;

                            if ((match2 = patterns.ENDIF.exec(source)) === null) {
                                throw(new Error("Illegal #"+match[2]+": "+source.substring(match.index, match.index+this._options.errorSourceAhead)+"..."));
                            }

                            if (stack.length == 0) {
                                throw(new Error("Unexpected #"+match2[1]+": "+source.substring(match.index, match.index+this._options.errorSourceAhead)+"..."));
                            }

                            var before = stack.pop();
                            verbose("  pop: "+JSON.stringify(before));
                            include = source.substring(before["lastIndex"], match.index);

                            if (before["include"]) {
                                verbose("  incl: "+PPem.nlToStr(include)+", 0-"+before['index']+" + "+include.length+" bytes + "+patterns.ENDIF.lastIndex+"-"+source.length);
                                source = source.substring(0, before["index"])+include+source.substring(patterns.ENDIF.lastIndex);
                            }
                            else {
                                verbose("  excl: "+PPem.nlToStr(include)+", 0-"+before['index']+" + "+patterns.ENDIF.lastIndex+"-"+source.length);
                                include = "";
                                source = source.substring(0, before["index"])+source.substring(patterns.ENDIF.lastIndex);
                            }

                            if (source == "") {
                                verbose("  result empty");
                            }

                            patterns.EXPR.lastIndex = before["index"]+include.length;
                            verbose("  continue at "+patterns.EXPR.lastIndex);

                            if (match2[1] == "else" || match2[1] == "elif") {
                                if (match2[1] == 'else') {
                                    include = !before["include"];
                                }
                                else {
                                    include = this._evaluate(match2[2], localDefines);
                                }

                                stack.push(p={
                                    "include": !before["include"],
                                    "index": patterns.EXPR.lastIndex,
                                    "lastIndex": patterns.EXPR.lastIndex
                                });

                                verbose("  push: "+JSON.stringify(p));
                            }

                            break;

                        case 'define':
                            // https://github.com/dcodeIO/PPem.js/issues/5
                            patterns.DEFINE.lastIndex = match.index;
                            if ((match2 = patterns.DEFINE.exec(source)) === null) {
                                throw(new Error("Illegal #"+match[2]+": "+source.substring(match.index, match.index+this._options.errorSourceAhead)+"..."));
                            }

                            verbose("define: " + match2[0] + ' (key: ' + match2[1] + ', value: ' + match2[2] + ')');

                            localDefines[match2[1]] = match2[2];
                            source = source.substring(0, match.index) + indent + source.substring(patterns.DEFINE.lastIndex);

                            patterns.EXPR.lastIndex = match.index;
                            verbose("continue at "+patterns.EXPR.lastIndex);
                            break;

                        case 'function':
                            patterns.FUNCTION.lastIndex = match.index;
                            if ((match2 = patterns.FUNCTION.exec(source)) === null) {
                                throw(new Error("Illegal #"+match[2]+": "+source.substring(match.index, match.index+this._options.errorSourceAhead)+"..."));
                            }

                            verbose("function: " + match2[0]);

                            localDefines[match2[1]] = 'function ' + match2[2];
                            source = source.substring(0, match.index) + indent + source.substring(patterns.FUNCTION.lastIndex);

                            patterns.EXPR.lastIndex = match.index;
                            verbose("  continue at "+patterns.EXPR.lastIndex);
                            break;
                    }
                }

                if (stack.length > 0) {
                    before = stack.pop();
                    verbose("Still on stack: "+JSON.stringify(before));
                }

                return touched ? source : null;

            },

            processClike : processClike,
            processJs : processClike,
            processJava : processClike,
            processCSharp : processClike,
            processSass : processClike,

            processXml : processXml,
            processHtml : processXml,

            processShtml : processShtml,

            processCss : processCss,

            /**
             * @method _parseOptions
             * @private
             */
            _parseOptions : function() {

                var options = this._options;

                // We enforce type for baseDir
                if (!isString(options.baseDir)) {
                    throwError('option "baseDir" must be a string', null, TypeError);
                }
                options.baseDir += '';

                // We enforce type for includes
                if (options.includes && !isArray(options.includes)) {
                    throwError('option "includes" must be an array', null, TypeError);
                }

                // We tolerate errorSourceAhead type errors
                if (!isNumber(options.errorSourceAhead)) {
                    options.errorSourceAhead = DEFAULT_OPTIONS.errorSourceAhead;
                }
                else {
                    options.errorSourceAhead = parseInt(options.errorSourceAhead, 10);
                }

                // We tolerate verbose type errors
                options.verbose = (typeof options.verbose == 'function') ? options.verbose : (options.verbose) ? PPem.verbose : noop;

            },

            /**
             * @method _parseGlobalDefines
             * @private
             */
            _parseGlobalDefines : function() {

                var name, def;
                for (name in this._defines) {
                    if (this._defines.hasOwnProperty(name)) {
                        def = this._defines[name];

                        if (isFunction(def)) {
                            def = def.toString()
                        }
                        else if (isObject(def) && def instanceof Date) {
                            throwError('Date types not supported');
                        }
                        else if (isObject(def) && def instanceof RegExp) {
                            throwError('RegExp types not supported');
                        }
                        else {
                            def = JSON.stringify(this._defines[name]);
                        }

                        this._defines[name] = def;
                    }
                }

            },

            /**
             *
             * @param expression
             * @param [localDefines]
             * @returns {*}
             * @private
             */
            _evaluate : function(expression, localDefines) {

                var context = {
                    JSON : JSON,
                    instance : this,
                    expression : expression,
                    localDefines : localDefines || {}
                };

                var errorMessageTemplate = 'Got a "{original}" error when evaluating the expression "{expression}"';

                try {
                    return nonStrictEval.call(context);
                }
                catch (e) {
                    var errorMsg = lodash.template(errorMessageTemplate, {
                        original : e + '',
                        expression : expression
                    });
                    throwError(errorMsg, 'process', EvalError);
                }

            }

        };

        module.exports = PPem;

    })(this);

})();
