(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.L = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (global){
'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

/**
 *  L.js
 *  ---------------------
 *  Opinionated, unobtrusive yet powerful logging library originally made for Peerio apps (http://peerio.com).
 *
 *  Features:
 *  - Logging
 *  - Benchmarking
 *  - String interpolation: log message may contain repeatable placeholders `{0}{1}{2}{1}`
 *  - Logging code and calls can be completely wiped out in production builds with regex replace.
 *
 *  / Peerio / Anri Asaturov / 2015 /
 */

;(function (L) {
    'use strict';

    var _this = this;

    var levels = require('./lib/levels');
    var CacheTransport = require('./lib/cache');
    var ConsoleTransport = require('./lib/console');
    var cacheTransport = new CacheTransport();
    var consoleTransport = new ConsoleTransport();

    var globalish = (typeof self === 'undefined' ? 'undefined' : _typeof(self)) === 'object' && self.self === self && self || (typeof global === 'undefined' ? 'undefined' : _typeof(global)) === 'object' && global.global === global && global || this;

    var levelNames = levels.names;
    levelNames['-1'] = 'BNC';

    // registered web workers
    var workers = [];
    // benchmarks in progress
    var runningBenchmarks = {};

    // export
    L.Transport = require('./lib/transport');

    L.LEVELS = levels.numeric;

    var originalOnError = void 0;
    var onErrorIsCaptured = false;

    // -- default settings
    // current log level
    L.level = L.LEVELS.INFO;
    // use benchmarks
    L.benchmarkEnabled = true;
    // by default benchmarks timeout after this number of seconds
    L.benchmarkTimeout = 120;
    // default writers
    L.writers = {
        console: consoleTransport,
        cache: cacheTransport
    };

    L.error = log.bind(L, L.LEVELS.ERROR);
    L.info = log.bind(L, L.LEVELS.INFO);
    L.verbose = log.bind(L, L.LEVELS.VERBOSE);
    L.silly = log.bind(L, L.LEVELS.SILLY);

    /**
     * Writes message without any pre-processing
     * This is useful when writing pre-processed messages received from web worker
     * @param msg
     * @param [level]
     */
    L.rawWrite = function (msg, level) {
        Object.keys(L.writers).forEach(function (k) {
            L.writers[k].conditionalWrite(msg, level, L.level);
        });
    };

    // -- Capture global ------------------------------------------------------------------------------------------------------

    /**
     * Capture global errors.
     */
    L.captureGlobalErrors = function () {
        try {
            if (onErrorIsCaptured) return;
            onErrorIsCaptured = true;
            originalOnError = globalish.onerror;
            globalish.onerror = L.error;
        } catch (e) {
            L.error(e);
        }
    };

    /**
     * Stop capturing global errors.
     */
    L.releaseglobalErrors = function () {
        try {
            if (!onErrorIsCaptured) return;
            onErrorIsCaptured = false;
            globalish.onerror = originalOnError;
        } catch (e) {
            L.error(e);
        }
    };

    /**
     * Overrides console.log, console.error and console.warn.
     * Reroutes overridden calls to self.
     * @param {String} workerName
     */
    L.captureConsole = function () {
        try {
            if (consoleTransport.originalConsole) return;

            if (!globalish.console) globalish.console = {};

            consoleTransport.originalConsole = {
                log: globalish.console.log,
                error: globalish.console.error,
                warn: globalish.console.warn
            };

            globalish.console.log = globalish.console.warn = function () {
                for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
                    args[_key] = arguments[_key];
                }

                for (var i = 0; i < args.length; i++) {
                    L.info(args[i]);
                }
            };
            globalish.console.error = function () {
                for (var _len2 = arguments.length, args = Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
                    args[_key2] = arguments[_key2];
                }

                for (var i = 0; i < args.length; i++) {
                    L.error(args[i]);
                }
            };
        } catch (e) {
            L.error(e);
        }
    };

    /**
     * Brings back console functions to the state they were before capturing
     */
    L.releaseConsole = function () {
        try {
            if (!consoleTransport.originalConsole) return;
            globalish.console.log = consoleTransport.originalConsole.log;
            globalish.console.error = consoleTransport.originalConsole.error;
            globalish.console.warn = consoleTransport.originalConsole.warn;
            consoleTransport.originalConsole = null;
        } catch (e) {
            L.error(e);
        }
    };

    // -- Worker mode ------------------------------------------------------------------------------------------------------

    /**
     * Discard workers and just post to UI thread.
     */
    L.switchToWorkerMode = function (workerName) {
        L.captureConsole();
        L.captureglobalErrors();
        L.workerName = workerName;
        L.cacheLimit = 0;
        L.writers = [postToUIThread];
    };

    /**
     * Updates L.js options with values provided in config object.
     * This function is supposed to be used when running in web worker,
     * so it ignores irrelevant options
     * @param options {{level: Number, benchmarkEnabled: Boolean, benchmarkTimeout: Number}}
     */
    L.setOptions = function (options) {
        if (options.level) L.level = options.level;
        if (options.benchmarkEnabled) L.level = options.benchmarkEnabled;
        if (options.benchmarkTimeout) L.level = options.benchmarkTimeout;
    };

    L.setWorkersOptions = function (options) {
        workers.forEach(function (w) {
            w.postMessage(options);
        });
    };

    L.addWorker = function (worker) {
        if (workers.indexOf(worker) >= 0) return;
        workers.push(worker);
    };

    L.removeWorker = function (worker) {
        var ind = workers.indexOf(worker);
        if (ind < 0) return;
        workers.splice(ind, 1);
    };

    // -- Transports ------------------------------------------------------------------------------------------------------

    /**
     * Add a transport with a max log level that will be written to it.
     *
     * @param {String} name
     * @param {Transport} transport
     * @param {Number} maxLevel
     */
    L.addTransport = function (name, transport, maxLevel) {
        if (maxLevel !== undefined) transport.level = maxLevel;
        L.writers[name] = transport;
    };

    /**
     * Remove a transport by name.
     *
     * @param {String} name
     */
    L.removeTransport = function (name) {
        delete L.writers[name];
    };

    // -- Benchmarks ------------------------------------------------------------------------------------------------------

    L.B = {};

    L.B.start = function (name, msg, timeout) {
        try {
            if (!L.benchmarkEnabled) return;

            if (runningBenchmarks.hasOwnProperty(name)) {
                L.error('Duplicate benchmark name');
                return;
            }

            runningBenchmarks[name] = {
                ts: Date.now(),
                msg: msg,
                timeoutId: globalish.setTimeout(L.B.stop.bind(_this, name, true), (timeout || L.benchmarkTimeout) * 1000)
            };
        } catch (e) {
            L.error(e);
            // yes, we are not interested in handling exception
        }
    };

    L.B.stop = function (name, timeout) {
        try {
            if (!runningBenchmarks.hasOwnProperty(name)) {
                L.error('Benchmark name {0} not found', name);
                return;
            }
            var b = runningBenchmarks[name];
            var time = Date.now() - b.ts;
            delete runningBenchmarks[name];
            log(-1, '{0}: {1} | {2} s.', name, timeout ? 'BENCHMARK TIMEOUT' : b.msg || '', time / 1000);
            globalish.clearTimeout(b.timeoutId);
        } catch (e) {
            L.error(e);
            // yes, we are not interested in handling exception
        }
    };

    // -- Private -------------------------------------------------------------------------------------------------------

    function log(level, msgArg) {
        var msg = msgArg;
        try {
            if (typeof ms === 'function') msg = msg();

            msg = stringify(msg);

            var head = L.workerName ? interpolate('{0} {1}:{2} ', [getTimestamp(), levelNames[level], L.workerName]) : interpolate('{0} {1}: ', [getTimestamp(), levelNames[level]]);

            var entry = head + interpolate(msg, getArguments(arguments));
            L.rawWrite(entry, level);
        } catch (e) {
            try {
                L.error(e);
            } catch (e) {
                // well.. we tried
            }
        }
    }

    // worker mode writer
    function postToUIThread(msg, level) {
        globalish.postMessage({ ljsMessage: msg, level: level });
    }

    /**
     * Extracts meaningful arguments from arguments object
     * @param args
     */
    function getArguments(args) {
        if (args.length <= 2) return null;

        // splice on arguments prevents js optimisation, so we do it a bit longer way
        var arg = [];
        for (var i = 2; i < args.length; i++) {
            arg.push(args[i]);
        }

        return arg;
    }

    /**
     *  Interpolates string replacing placeholders with arguments
     *  @param {string} str - template string with placeholders in format {0} {1} {2}
     *                                   where number is argument array index.
     *                                   Numbers also can be replaced with property names or argument object.
     *  @param {Array | Object} args - argument array or object
     *  @returns {string} interpolated string
     */
    function interpolate(str, args) {
        if (!args || !args.length) return str;

        return str.replace(/{([^{}]*)}/g, function (a, b) {
            return stringify(args[b]);
        });
    }

    // Opinionated any-value to string converter
    function stringify(val) {
        if (typeof val === 'string') return val;

        if (val instanceof Error) {
            return val.message + ' ' + val.stack;
        }

        if (val instanceof Date) {
            return val.toISOString();
        }

        return JSON.stringify(val);
    }

    function getTimestamp() {
        var d = new Date();
        return pad(d.getDate()) + '-' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()) + '.' + pad2(d.getUTCMilliseconds());
    }

    // performance over fanciness
    function pad(n) {
        var ret = n.toString();
        return ret.length === 2 ? ret : '0' + ret;
    }

    // performance over fanciness
    function pad2(n) {
        var ret = n.toString();
        return ret.length === 3 ? ret : ret.length === 2 ? '0' + ret : '00' + ret;
    }
})(typeof module !== 'undefined' && module.exports ? module.exports : self.L = self.L || {});

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./lib/cache":2,"./lib/console":3,"./lib/levels":4,"./lib/transport":5}],2:[function(require,module,exports){
'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var Transport = require('./transport');

var CacheTransport = function (_Transport) {
    _inherits(CacheTransport, _Transport);

    function CacheTransport(level) {
        _classCallCheck(this, CacheTransport);

        var _this = _possibleConstructorReturn(this, (CacheTransport.__proto__ || Object.getPrototypeOf(CacheTransport)).call(this, level));

        _this.cache = [];
        _this.cacheLimit = 1000; // amount of log entries to keep in FIFO L.cache queue. Set to 0 to disable.
        return _this;
    }

    _createClass(CacheTransport, [{
        key: 'write',
        value: function write(msg, level) {
            this.cache.unshift(msg);

            if (this.cache.length > this.cacheLimit) {
                this.cache.length = this.cacheLimit;
            }
        }
    }, {
        key: 'resetCache',
        value: function resetCache() {
            this.cache = [];
        }
    }, {
        key: 'print',
        value: function print() {
            return this.cache.join('\n');
        }
    }]);

    return CacheTransport;
}(Transport);

module.exports = CacheTransport;

},{"./transport":5}],3:[function(require,module,exports){
(function (global){
'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var Transport = require('./transport');
var levels = require('./levels');

var ConsoleTransport = function (_Transport) {
    _inherits(ConsoleTransport, _Transport);

    function ConsoleTransport(level) {
        _classCallCheck(this, ConsoleTransport);

        var _this = _possibleConstructorReturn(this, (ConsoleTransport.__proto__ || Object.getPrototypeOf(ConsoleTransport)).call(this, level));

        _this.originalConsole = null;
        return _this;
    }

    _createClass(ConsoleTransport, [{
        key: 'write',
        value: function write(msg, level) {
            if (msg == null) msg = 'null';
            if (this.originalConsole) {
                if (level === levels.numeric.ERROR) {
                    this.originalConsole.error.call(global.console, msg);
                } else {
                    this.originalConsole.log.call(global.console, msg);
                }
            } else if (level === levels.numeric.ERROR) {
                global.console.error(msg);
            } else {
                global.console.log(msg);
            }
        }
    }]);

    return ConsoleTransport;
}(Transport);

module.exports = ConsoleTransport;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./levels":4,"./transport":5}],4:[function(require,module,exports){
'use strict';

module.exports = {
    numeric: { ERROR: 0, INFO: 1, VERBOSE: 2, SILLY: 3 },
    names: ['ERR', 'INF', 'VER', 'SIL']
};

},{}],5:[function(require,module,exports){
'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var levels = require('./levels');

var Transport = function () {
    _createClass(Transport, [{
        key: 'clearLevel',
        value: function clearLevel() {
            this.maxLevel = undefined;
        }
    }, {
        key: 'level',
        get: function get() {
            return this.maxLevel;
        },
        set: function set(l) {
            if (!Number.isInteger(l)) throw new Error('level must be an integer');
            this.maxLevel = l;
        }
    }]);

    function Transport(level) {
        _classCallCheck(this, Transport);

        if (level) this.level = level;
    }

    _createClass(Transport, [{
        key: 'conditionalWrite',
        value: function conditionalWrite(message, level, generalMaxLevel) {
            if (level > (this.level === undefined ? generalMaxLevel : this.level)) return;
            this.write(message);
        }
    }, {
        key: 'write',
        value: function write() {}
    }]);

    return Transport;
}();

module.exports = Transport;

},{"./levels":4}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvTC5qcyIsInNyYy9saWIvY2FjaGUuanMiLCJzcmMvbGliL2NvbnNvbGUuanMiLCJzcmMvbGliL2xldmVscy5qcyIsInNyYy9saWIvdHJhbnNwb3J0LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7QUNBQTs7Ozs7Ozs7Ozs7Ozs7QUFjQSxDQUFDLENBQUMsVUFBUyxDQUFULEVBQVk7QUFDVjs7QUFEVTs7QUFFVixRQUFNLFNBQVMsUUFBUSxjQUFSLENBQWY7QUFDQSxRQUFNLGlCQUFpQixRQUFRLGFBQVIsQ0FBdkI7QUFDQSxRQUFNLG1CQUFtQixRQUFRLGVBQVIsQ0FBekI7QUFDQSxRQUFNLGlCQUFpQixJQUFJLGNBQUosRUFBdkI7QUFDQSxRQUFNLG1CQUFtQixJQUFJLGdCQUFKLEVBQXpCOztBQUVBLFFBQU0sWUFBYSxRQUFPLElBQVAseUNBQU8sSUFBUCxPQUFnQixRQUFoQixJQUE0QixLQUFLLElBQUwsS0FBYyxJQUExQyxJQUFrRCxJQUFuRCxJQUNHLFFBQU8sTUFBUCx5Q0FBTyxNQUFQLE9BQWtCLFFBQWxCLElBQThCLE9BQU8sTUFBUCxLQUFrQixNQUFoRCxJQUEwRCxNQUQ3RCxJQUVFLElBRnBCOztBQUlBLFFBQU0sYUFBYSxPQUFPLEtBQTFCO0FBQ0EsZUFBVyxJQUFYLElBQW1CLEtBQW5COztBQUVBO0FBQ0EsUUFBTSxVQUFVLEVBQWhCO0FBQ0E7QUFDQSxRQUFNLG9CQUFvQixFQUExQjs7QUFFQTtBQUNBLE1BQUUsU0FBRixHQUFjLFFBQVEsaUJBQVIsQ0FBZDs7QUFFQSxNQUFFLE1BQUYsR0FBVyxPQUFPLE9BQWxCOztBQUVBLFFBQUksd0JBQUo7QUFDQSxRQUFJLG9CQUFvQixLQUF4Qjs7QUFFQTtBQUNBO0FBQ0EsTUFBRSxLQUFGLEdBQVUsRUFBRSxNQUFGLENBQVMsSUFBbkI7QUFDQTtBQUNBLE1BQUUsZ0JBQUYsR0FBcUIsSUFBckI7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Y3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8qKlxuICogIEwuanNcbiAqICAtLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBPcGluaW9uYXRlZCwgdW5vYnRydXNpdmUgeWV0IHBvd2VyZnVsIGxvZ2dpbmcgbGlicmFyeSBvcmlnaW5hbGx5IG1hZGUgZm9yIFBlZXJpbyBhcHBzIChodHRwOi8vcGVlcmlvLmNvbSkuXG4gKlxuICogIEZlYXR1cmVzOlxuICogIC0gTG9nZ2luZ1xuICogIC0gQmVuY2htYXJraW5nXG4gKiAgLSBTdHJpbmcgaW50ZXJwb2xhdGlvbjogbG9nIG1lc3NhZ2UgbWF5IGNvbnRhaW4gcmVwZWF0YWJsZSBwbGFjZWhvbGRlcnMgYHswfXsxfXsyfXsxfWBcbiAqICAtIExvZ2dpbmcgY29kZSBhbmQgY2FsbHMgY2FuIGJlIGNvbXBsZXRlbHkgd2lwZWQgb3V0IGluIHByb2R1Y3Rpb24gYnVpbGRzIHdpdGggcmVnZXggcmVwbGFjZS5cbiAqXG4gKiAgLyBQZWVyaW8gLyBBbnJpIEFzYXR1cm92IC8gMjAxNSAvXG4gKi9cblxuOyhmdW5jdGlvbihMKSB7XG4gICAgJ3VzZSBzdHJpY3QnO1xuICAgIGNvbnN0IGxldmVscyA9IHJlcXVpcmUoJy4vbGliL2xldmVscycpO1xuICAgIGNvbnN0IENhY2hlVHJhbnNwb3J0ID0gcmVxdWlyZSgnLi9saWIvY2FjaGUnKTtcbiAgICBjb25zdCBDb25zb2xlVHJhbnNwb3J0ID0gcmVxdWlyZSgnLi9saWIvY29uc29sZScpO1xuICAgIGNvbnN0IGNhY2hlVHJhbnNwb3J0ID0gbmV3IENhY2hlVHJhbnNwb3J0KCk7XG4gICAgY29uc3QgY29uc29sZVRyYW5zcG9ydCA9IG5ldyBDb25zb2xlVHJhbnNwb3J0KCk7XG5cbiAgICBjb25zdCBnbG9iYWxpc2ggPSAodHlwZW9mIHNlbGYgPT09ICdvYmplY3QnICYmIHNlbGYuc2VsZiA9PT0gc2VsZiAmJiBzZWxmKSB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgKHR5cGVvZiBnbG9iYWwgPT09ICdvYmplY3QnICYmIGdsb2JhbC5nbG9iYWwgPT09IGdsb2JhbCAmJiBnbG9iYWwpIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzO1xuXG4gICAgY29uc3QgbGV2ZWxOYW1lcyA9IGxldmVscy5uYW1lcztcbiAgICBsZXZlbE5hbWVzWyctMSddID0gJ0JOQyc7XG5cbiAgICAvLyByZWdpc3RlcmVkIHdlYiB3b3JrZXJzXG4gICAgY29uc3Qgd29ya2VycyA9IFtdO1xuICAgIC8vIGJlbmNobWFya3MgaW4gcHJvZ3Jlc3NcbiAgICBjb25zdCBydW5uaW5nQmVuY2htYXJrcyA9IHt9O1xuXG4gICAgLy8gZXhwb3J0XG4gICAgTC5UcmFuc3BvcnQgPSByZXF1aXJlKCcuL2xpYi90cmFuc3BvcnQnKTtcblxuICAgIEwuTEVWRUxTID0gbGV2ZWxzLm51bWVyaWM7XG5cbiAgICBsZXQgb3JpZ2luYWxPbkVycm9yO1xuICAgIGxldCBvbkVycm9ySXNDYXB0dXJlZCA9IGZhbHNlO1xuXG4gICAgLy8gLS0gZGVmYXVsdCBzZXR0aW5nc1xuICAgIC8vIGN1cnJlbnQgbG9nIGxldmVsXG4gICAgTC5sZXZlbCA9IEwuTEVWRUxTLklORk87XG4gICAgLy8gdXNlIGJlbmNobWFya3NcbiAgICBMLmJlbmNobWFya0VuYWJsZWQgPSB0cnVlO1xuICAgIC8vIGJ5IGRlZmF1bHQgYmVuY2htYXJrcyB0aW1lb3V0IGFmdGVyIHRoaXMgbnVtYmVyIG9mIHNlY29uZHNcbiAgICBMLmJlbmNobWFya1RpbWVvdXQgPSAxMjA7XG4gICAgLy8gZGVmYXVsdCB3cml0ZXJzXG4gICAgTC53cml0ZXJzID0ge1xuICAgICAgICBjb25zb2xlOiBjb25zb2xlVHJhbnNwb3J0LFxuICAgICAgICBjYWNoZTogY2FjaGVUcmFuc3BvcnRcbiAgICB9O1xuXG4gICAgTC5lcnJvciA9IGxvZy5iaW5kKEwsIEwuTEVWRUxTLkVSUk9SKTtcbiAgICBMLmluZm8gPSBsb2cuYmluZChMLCBMLkxFVkVMUy5JTkZPKTtcbiAgICBMLnZlcmJvc2UgPSBsb2cuYmluZChMLCBMLkxFVkVMUy5WRVJCT1NFKTtcbiAgICBMLnNpbGx5ID0gbG9nLmJpbmQoTCwgTC5MRVZFTFMuU0lMTFkpO1xuXG4gICAgLyoqXG4gICAgICogV3JpdGVzIG1lc3NhZ2Ugd2l0aG91dCBhbnkgcHJlLXByb2Nlc3NpbmdcbiAgICAgKiBUaGlzIGlzIHVzZWZ1bCB3aGVuIHdyaXRpbmcgcHJlLXByb2Nlc3NlZCBtZXNzYWdlcyByZWNlaXZlZCBmcm9tIHdlYiB3b3JrZXJcbiAgICAgKiBAcGFyYW0gbXNnXG4gICAgICogQHBhcmFtIFtsZXZlbF1cbiAgICAgKi9cbiAgICBMLnJhd1dyaXRlID0gKG1zZywgbGV2ZWwpID0+IHtcbiAgICAgICAgT2JqZWN0LmtleXMoTC53cml0ZXJzKS5mb3JFYWNoKChrKSA9PiB7XG4gICAgICAgICAgICBMLndyaXRlcnNba10uY29uZGl0aW9uYWxXcml0ZShtc2csIGxldmVsLCBMLmxldmVsKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIC8vIC0tIENhcHR1cmUgZ2xvYmFsIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgLyoqXG4gICAgICogQ2FwdHVyZSBnbG9iYWwgZXJyb3JzLlxuICAgICAqL1xuICAgIEwuY2FwdHVyZUdsb2JhbEVycm9ycyA9ICgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmIChvbkVycm9ySXNDYXB0dXJlZCkgcmV0dXJuO1xuICAgICAgICAgICAgb25FcnJvcklzQ2FwdHVyZWQgPSB0cnVlO1xuICAgICAgICAgICAgb3JpZ2luYWxPbkVycm9yID0gZ2xvYmFsaXNoLm9uZXJyb3I7XG4gICAgICAgICAgICBnbG9iYWxpc2gub25lcnJvciA9IEwuZXJyb3I7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIEwuZXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogU3RvcCBjYXB0dXJpbmcgZ2xvYmFsIGVycm9ycy5cbiAgICAgKi9cbiAgICBMLnJlbGVhc2VnbG9iYWxFcnJvcnMgPSAoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBpZiAoIW9uRXJyb3JJc0NhcHR1cmVkKSByZXR1cm47XG4gICAgICAgICAgICBvbkVycm9ySXNDYXB0dXJlZCA9IGZhbHNlO1xuICAgICAgICAgICAgZ2xvYmFsaXNoLm9uZXJyb3IgPSBvcmlnaW5hbE9uRXJyb3I7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIEwuZXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogT3ZlcnJpZGVzIGNvbnNvbGUubG9nLCBjb25zb2xlLmVycm9yIGFuZCBjb25zb2xlLndhcm4uXG4gICAgICogUmVyb3V0ZXMgb3ZlcnJpZGRlbiBjYWxscyB0byBzZWxmLlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSB3b3JrZXJOYW1lXG4gICAgICovXG4gICAgTC5jYXB0dXJlQ29uc29sZSA9ICgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmIChjb25zb2xlVHJhbnNwb3J0Lm9yaWdpbmFsQ29uc29sZSkgcmV0dXJuO1xuXG4gICAgICAgICAgICBpZiAoIWdsb2JhbGlzaC5jb25zb2xlKSBnbG9iYWxpc2guY29uc29sZSA9IHt9O1xuXG4gICAgICAgICAgICBjb25zb2xlVHJhbnNwb3J0Lm9yaWdpbmFsQ29uc29sZSA9IHtcbiAgICAgICAgICAgICAgICBsb2c6IGdsb2JhbGlzaC5jb25zb2xlLmxvZyxcbiAgICAgICAgICAgICAgICBlcnJvcjogZ2xvYmFsaXNoLmNvbnNvbGUuZXJyb3IsXG4gICAgICAgICAgICAgICAgd2FybjogZ2xvYmFsaXNoLmNvbnNvbGUud2FyblxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgZ2xvYmFsaXNoLmNvbnNvbGUubG9nID0gZ2xvYmFsaXNoLmNvbnNvbGUud2FybiA9ICguLi5hcmdzKSA9PiB7XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhcmdzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIEwuaW5mbyhhcmdzW2ldKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgZ2xvYmFsaXNoLmNvbnNvbGUuZXJyb3IgPSAoLi4uYXJncykgPT4ge1xuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYXJncy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBMLmVycm9yKGFyZ3NbaV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIEwuZXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogQnJpbmdzIGJhY2sgY29uc29sZSBmdW5jdGlvbnMgdG8gdGhlIHN0YXRlIHRoZXkgd2VyZSBiZWZvcmUgY2FwdHVyaW5nXG4gICAgICovXG4gICAgTC5yZWxlYXNlQ29uc29sZSA9ICgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmICghY29uc29sZVRyYW5zcG9ydC5vcmlnaW5hbENvbnNvbGUpIHJldHVybjtcbiAgICAgICAgICAgIGdsb2JhbGlzaC5jb25zb2xlLmxvZyA9IGNvbnNvbGVUcmFuc3BvcnQub3JpZ2luYWxDb25zb2xlLmxvZztcbiAgICAgICAgICAgIGdsb2JhbGlzaC5jb25zb2xlLmVycm9yID0gY29uc29sZVRyYW5zcG9ydC5vcmlnaW5hbENvbnNvbGUuZXJyb3I7XG4gICAgICAgICAgICBnbG9iYWxpc2guY29uc29sZS53YXJuID0gY29uc29sZVRyYW5zcG9ydC5vcmlnaW5hbENvbnNvbGUud2FybjtcbiAgICAgICAgICAgIGNvbnNvbGVUcmFuc3BvcnQub3JpZ2luYWxDb25zb2xlID0gbnVsbDtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgTC5lcnJvcihlKTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICAvLyAtLSBXb3JrZXIgbW9kZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAgIC8qKlxuICAgICAqIERpc2NhcmQgd29ya2VycyBhbmQganVzdCBwb3N0IHRvIFVJIHRocmVhZC5cbiAgICAgKi9cbiAgICBMLnN3aXRjaFRvV29ya2VyTW9kZSA9ICh3b3JrZXJOYW1lKSA9PiB7XG4gICAgICAgIEwuY2FwdHVyZUNvbnNvbGUoKTtcbiAgICAgICAgTC5jYXB0dXJlZ2xvYmFsRXJyb3JzKCk7XG4gICAgICAgIEwud29ya2VyTmFtZSA9IHdvcmtlck5hbWU7XG4gICAgICAgIEwuY2FjaGVMaW1pdCA9IDA7XG4gICAgICAgIEwud3JpdGVycyA9IFtwb3N0VG9VSVRocmVhZF07XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIFVwZGF0ZXMgTC5qcyBvcHRpb25zIHdpdGggdmFsdWVzIHByb3ZpZGVkIGluIGNvbmZpZyBvYmplY3QuXG4gICAgICogVGhpcyBmdW5jdGlvbiBpcyBzdXBwb3NlZCB0byBiZSB1c2VkIHdoZW4gcnVubmluZyBpbiB3ZWIgd29ya2VyLFxuICAgICAqIHNvIGl0IGlnbm9yZXMgaXJyZWxldmFudCBvcHRpb25zXG4gICAgICogQHBhcmFtIG9wdGlvbnMge3tsZXZlbDogTnVtYmVyLCBiZW5jaG1hcmtFbmFibGVkOiBCb29sZWFuLCBiZW5jaG1hcmtUaW1lb3V0OiBOdW1iZXJ9fVxuICAgICAqL1xuICAgIEwuc2V0T3B0aW9ucyA9IChvcHRpb25zKSA9PiB7XG4gICAgICAgIGlmIChvcHRpb25zLmxldmVsKSBMLmxldmVsID0gb3B0aW9ucy5sZXZlbDtcbiAgICAgICAgaWYgKG9wdGlvbnMuYmVuY2htYXJrRW5hYmxlZCkgTC5sZXZlbCA9IG9wdGlvbnMuYmVuY2htYXJrRW5hYmxlZDtcbiAgICAgICAgaWYgKG9wdGlvbnMuYmVuY2htYXJrVGltZW91dCkgTC5sZXZlbCA9IG9wdGlvbnMuYmVuY2htYXJrVGltZW91dDtcbiAgICB9O1xuXG4gICAgTC5zZXRXb3JrZXJzT3B0aW9ucyA9IChvcHRpb25zKSA9PiB7XG4gICAgICAgIHdvcmtlcnMuZm9yRWFjaCgodykgPT4ge1xuICAgICAgICAgICAgdy5wb3N0TWVzc2FnZShvcHRpb25zKTtcbiAgICAgICAgfSk7XG4gICAgfTtcblxuICAgIEwuYWRkV29ya2VyID0gKHdvcmtlcikgPT4ge1xuICAgICAgICBpZiAod29ya2Vycy5pbmRleE9mKHdvcmtlcikgPj0gMCkgcmV0dXJuO1xuICAgICAgICB3b3JrZXJzLnB1c2god29ya2VyKTtcbiAgICB9O1xuXG4gICAgTC5yZW1vdmVXb3JrZXIgPSAod29ya2VyKSA9PiB7XG4gICAgICAgIGNvbnN0IGluZCA9IHdvcmtlcnMuaW5kZXhPZih3b3JrZXIpO1xuICAgICAgICBpZiAoaW5kIDwgMCkgcmV0dXJuO1xuICAgICAgICB3b3JrZXJzLnNwbGljZShpbmQsIDEpO1xuICAgIH07XG5cbiAgICAvLyAtLSBUcmFuc3BvcnRzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgLyoqXG4gICAgICogQWRkIGEgdHJhbnNwb3J0IHdpdGggYSBtYXggbG9nIGxldmVsIHRoYXQgd2lsbCBiZSB3cml0dGVuIHRvIGl0LlxuICAgICAqXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IG5hbWVcbiAgICAgKiBAcGFyYW0ge1RyYW5zcG9ydH0gdHJhbnNwb3J0XG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IG1heExldmVsXG4gICAgICovXG4gICAgTC5hZGRUcmFuc3BvcnQgPSAobmFtZSwgdHJhbnNwb3J0LCBtYXhMZXZlbCkgPT4ge1xuICAgICAgICBpZiAobWF4TGV2ZWwgIT09IHVuZGVmaW5lZCkgdHJhbnNwb3J0LmxldmVsID0gbWF4TGV2ZWw7XG4gICAgICAgIEwud3JpdGVyc1tuYW1lXSA9IHRyYW5zcG9ydDtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlIGEgdHJhbnNwb3J0IGJ5IG5hbWUuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICAgICAqL1xuICAgIEwucmVtb3ZlVHJhbnNwb3J0ID0gZnVuY3Rpb24obmFtZSkge1xuICAgICAgICBkZWxldGUgTC53cml0ZXJzW25hbWVdO1xuICAgIH07XG5cbiAgICAvLyAtLSBCZW5jaG1hcmtzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgTC5CID0ge307XG5cbiAgICBMLkIuc3RhcnQgPSAobmFtZSwgbXNnLCB0aW1lb3V0KSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBpZiAoIUwuYmVuY2htYXJrRW5hYmxlZCkgcmV0dXJuO1xuXG4gICAgICAgICAgICBpZiAocnVubmluZ0JlbmNobWFya3MuaGFzT3duUHJvcGVydHkobmFtZSkpIHtcbiAgICAgICAgICAgICAgICBMLmVycm9yKCdEdXBsaWNhdGUgYmVuY2htYXJrIG5hbWUnKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJ1bm5pbmdCZW5jaG1hcmtzW25hbWVdID0ge1xuICAgICAgICAgICAgICAgIHRzOiBEYXRlLm5vdygpLFxuICAgICAgICAgICAgICAgIG1zZyxcbiAgICAgICAgICAgICAgICB0aW1lb3V0SWQ6IGdsb2JhbGlzaC5zZXRUaW1lb3V0KEwuQi5zdG9wLmJpbmQodGhpcywgbmFtZSwgdHJ1ZSksICh0aW1lb3V0IHx8IEwuYmVuY2htYXJrVGltZW91dCkgKiAxMDAwKVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgTC5lcnJvcihlKTtcbiAgICAgICAgICAgIC8vIHllcywgd2UgYXJlIG5vdCBpbnRlcmVzdGVkIGluIGhhbmRsaW5nIGV4Y2VwdGlvblxuICAgICAgICB9XG4gICAgfTtcblxuICAgIEwuQi5zdG9wID0gKG5hbWUsIHRpbWVvdXQpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmICghcnVubmluZ0JlbmNobWFya3MuaGFzT3duUHJvcGVydHkobmFtZSkpIHtcbiAgICAgICAgICAgICAgICBMLmVycm9yKCdCZW5jaG1hcmsgbmFtZSB7MH0gbm90IGZvdW5kJywgbmFtZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgYiA9IHJ1bm5pbmdCZW5jaG1hcmtzW25hbWVdO1xuICAgICAgICAgICAgY29uc3QgdGltZSA9IERhdGUubm93KCkgLSBiLnRzO1xuICAgICAgICAgICAgZGVsZXRlIHJ1bm5pbmdCZW5jaG1hcmtzW25hbWVdO1xuICAgICAgICAgICAgbG9nKC0xLCAnezB9OiB7MX0gfCB7Mn0gcy4nLCBuYW1lLCB0aW1lb3V0ID8gJ0JFTkNITUFSSyBUSU1FT1VUJyA6IGIubXNnIHx8ICcnLCB0aW1lIC8gMTAwMCk7XG4gICAgICAgICAgICBnbG9iYWxpc2guY2xlYXJUaW1lb3V0KGIudGltZW91dElkKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgTC5lcnJvcihlKTtcbiAgICAgICAgICAgIC8vIHllcywgd2UgYXJlIG5vdCBpbnRlcmVzdGVkIGluIGhhbmRsaW5nIGV4Y2VwdGlvblxuICAgICAgICB9XG4gICAgfTtcblxuICAgIC8vIC0tIFByaXZhdGUgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgZnVuY3Rpb24gbG9nKGxldmVsLCBtc2dBcmcpIHtcbiAgICAgICAgbGV0IG1zZyA9IG1zZ0FyZztcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgbXMgPT09ICdmdW5jdGlvbicpIG1zZyA9IG1zZygpO1xuXG4gICAgICAgICAgICBtc2cgPSBzdHJpbmdpZnkobXNnKTtcblxuICAgICAgICAgICAgY29uc3QgaGVhZCA9XG4gICAgICAgICAgICAgICAgTC53b3JrZXJOYW1lXG4gICAgICAgICAgICAgICAgICAgID8gaW50ZXJwb2xhdGUoJ3swfSB7MX06ezJ9ICcsIFtnZXRUaW1lc3RhbXAoKSwgbGV2ZWxOYW1lc1tsZXZlbF0sIEwud29ya2VyTmFtZV0pXG4gICAgICAgICAgICAgICAgICAgIDogaW50ZXJwb2xhdGUoJ3swfSB7MX06ICcsIFtnZXRUaW1lc3RhbXAoKSwgbGV2ZWxOYW1lc1tsZXZlbF1dKTtcblxuICAgICAgICAgICAgY29uc3QgZW50cnkgPSBoZWFkICsgaW50ZXJwb2xhdGUobXNnLCBnZXRBcmd1bWVudHMoYXJndW1lbnRzKSk7XG4gICAgICAgICAgICBMLnJhd1dyaXRlKGVudHJ5LCBsZXZlbCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgTC5lcnJvcihlKTtcbiAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgICAgICAvLyB3ZWxsLi4gd2UgdHJpZWRcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIHdvcmtlciBtb2RlIHdyaXRlclxuICAgIGZ1bmN0aW9uIHBvc3RUb1VJVGhyZWFkKG1zZywgbGV2ZWwpIHtcbiAgICAgICAgZ2xvYmFsaXNoLnBvc3RNZXNzYWdlKHsgbGpzTWVzc2FnZTogbXNnLCBsZXZlbCB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFeHRyYWN0cyBtZWFuaW5nZnVsIGFyZ3VtZW50cyBmcm9tIGFyZ3VtZW50cyBvYmplY3RcbiAgICAgKiBAcGFyYW0gYXJnc1xuICAgICAqL1xuICAgIGZ1bmN0aW9uIGdldEFyZ3VtZW50cyhhcmdzKSB7XG4gICAgICAgIGlmIChhcmdzLmxlbmd0aCA8PSAyKSByZXR1cm4gbnVsbDtcblxuICAgICAgICAvLyBzcGxpY2Ugb24gYXJndW1lbnRzIHByZXZlbnRzIGpzIG9wdGltaXNhdGlvbiwgc28gd2UgZG8gaXQgYSBiaXQgbG9uZ2VyIHdheVxuICAgICAgICBjb25zdCBhcmcgPSBbXTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDI7IGkgPCBhcmdzLmxlbmd0aDsgaSsrKSB7IGFyZy5wdXNoKGFyZ3NbaV0pOyB9XG5cbiAgICAgICAgcmV0dXJuIGFyZztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiAgSW50ZXJwb2xhdGVzIHN0cmluZyByZXBsYWNpbmcgcGxhY2Vob2xkZXJzIHdpdGggYXJndW1lbnRzXG4gICAgICogIEBwYXJhbSB7c3RyaW5nfSBzdHIgLSB0ZW1wbGF0ZSBzdHJpbmcgd2l0aCBwbGFjZWhvbGRlcnMgaW4gZm9ybWF0IHswfSB7MX0gezJ9XG4gICAgICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdoZXJlIG51bWJlciBpcyBhcmd1bWVudCBhcnJheSBpbmRleC5cbiAgICAgKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgTnVtYmVycyBhbHNvIGNhbiBiZSByZXBsYWNlZCB3aXRoIHByb3BlcnR5IG5hbWVzIG9yIGFyZ3VtZW50IG9iamVjdC5cbiAgICAgKiAgQHBhcmFtIHtBcnJheSB8IE9iamVjdH0gYXJncyAtIGFyZ3VtZW50IGFycmF5IG9yIG9iamVjdFxuICAgICAqICBAcmV0dXJucyB7c3RyaW5nfSBpbnRlcnBvbGF0ZWQgc3RyaW5nXG4gICAgICovXG4gICAgZnVuY3Rpb24gaW50ZXJwb2xhdGUoc3RyLCBhcmdzKSB7XG4gICAgICAgIGlmICghYXJncyB8fCAhYXJncy5sZW5ndGgpIHJldHVybiBzdHI7XG5cbiAgICAgICAgcmV0dXJuIHN0ci5yZXBsYWNlKC97KFtee31dKil9L2csXG4gICAgICAgICAgICAoYSwgYikgPT4ge1xuICAgICAgICAgICAgICAgIHJldHVybiBzdHJpbmdpZnkoYXJnc1tiXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gT3BpbmlvbmF0ZWQgYW55LXZhbHVlIHRvIHN0cmluZyBjb252ZXJ0ZXJcbiAgICBmdW5jdGlvbiBzdHJpbmdpZnkodmFsKSB7XG4gICAgICAgIGlmICh0eXBlb2YgKHZhbCkgPT09ICdzdHJpbmcnKSByZXR1cm4gdmFsO1xuXG4gICAgICAgIGlmICh2YWwgaW5zdGFuY2VvZiBFcnJvcikgeyByZXR1cm4gYCR7dmFsLm1lc3NhZ2V9ICR7dmFsLnN0YWNrfWA7IH1cblxuICAgICAgICBpZiAodmFsIGluc3RhbmNlb2YgRGF0ZSkgeyByZXR1cm4gdmFsLnRvSVNPU3RyaW5nKCk7IH1cblxuICAgICAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkodmFsKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRUaW1lc3RhbXAoKSB7XG4gICAgICAgIGNvbnN0IGQgPSBuZXcgRGF0ZSgpO1xuICAgICAgICByZXR1cm4gYCR7cGFkKGQuZ2V0RGF0ZSgpKVxuICAgICAgICAgICAgfS0ke3BhZChkLmdldFVUQ0hvdXJzKCkpfToke3BhZChkLmdldFVUQ01pbnV0ZXMoKSl9OiR7cGFkKGQuZ2V0VVRDU2Vjb25kcygpKVxuICAgICAgICAgICAgfS4ke3BhZDIoZC5nZXRVVENNaWxsaXNlY29uZHMoKSl9YDtcbiAgICB9XG5cbiAgICAvLyBwZXJmb3JtYW5jZSBvdmVyIGZhbmNpbmVzc1xuICAgIGZ1bmN0aW9uIHBhZChuKSB7XG4gICAgICAgIGNvbnN0IHJldCA9IG4udG9TdHJpbmcoKTtcbiAgICAgICAgcmV0dXJuIHJldC5sZW5ndGggPT09IDIgPyByZXQgOiAoYDAke3JldH1gKTtcbiAgICB9XG5cbiAgICAvLyBwZXJmb3JtYW5jZSBvdmVyIGZhbmNpbmVzc1xuICAgIGZ1bmN0aW9uIHBhZDIobikge1xuICAgICAgICBjb25zdCByZXQgPSBuLnRvU3RyaW5nKCk7XG4gICAgICAgIHJldHVybiByZXQubGVuZ3RoID09PSAzID8gcmV0IDogKHJldC5sZW5ndGggPT09IDIgPyAoYDAke3JldH1gKSA6IChgMDAke3JldH1gKSk7XG4gICAgfVxufSkodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgbW9kdWxlLmV4cG9ydHMgPyBtb2R1bGUuZXhwb3J0cyA6IChzZWxmLkwgPSBzZWxmLkwgfHwge30pKTtcbiIsImNvbnN0IFRyYW5zcG9ydCA9IHJlcXVpcmUoJy4vdHJhbnNwb3J0Jyk7XG5cbmNsYXNzIENhY2hlVHJhbnNwb3J0IGV4dGVuZHMgVHJhbnNwb3J0IHtcblxuICAgIGNvbnN0cnVjdG9yKGxldmVsKSB7XG4gICAgICAgIHN1cGVyKGxldmVsKTtcbiAgICAgICAgdGhpcy5jYWNoZSA9IFtdO1xuICAgICAgICB0aGlzLmNhY2hlTGltaXQgPSAxMDAwOyAvLyBhbW91bnQgb2YgbG9nIGVudHJpZXMgdG8ga2VlcCBpbiBGSUZPIEwuY2FjaGUgcXVldWUuIFNldCB0byAwIHRvIGRpc2FibGUuXG4gICAgfVxuXG4gICAgd3JpdGUobXNnLCBsZXZlbCkge1xuICAgICAgICB0aGlzLmNhY2hlLnVuc2hpZnQobXNnKTtcblxuICAgICAgICBpZiAodGhpcy5jYWNoZS5sZW5ndGggPiB0aGlzLmNhY2hlTGltaXQpIHtcbiAgICAgICAgICAgIHRoaXMuY2FjaGUubGVuZ3RoID0gdGhpcy5jYWNoZUxpbWl0O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmVzZXRDYWNoZSgpIHtcbiAgICAgICAgdGhpcy5jYWNoZSA9IFtdO1xuICAgIH1cblxuICAgIHByaW50KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jYWNoZS5qb2luKCdcXG4nKTtcbiAgICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gQ2FjaGVUcmFuc3BvcnQ7XG4iLCJjb25zdCBUcmFuc3BvcnQgPSByZXF1aXJlKCcuL3RyYW5zcG9ydCcpO1xuY29uc3QgbGV2ZWxzID0gcmVxdWlyZSgnLi9sZXZlbHMnKTtcblxuY2xhc3MgQ29uc29sZVRyYW5zcG9ydCBleHRlbmRzIFRyYW5zcG9ydCB7XG5cbiAgICAgY29uc3RydWN0b3IobGV2ZWwpIHtcbiAgICAgICAgc3VwZXIobGV2ZWwpO1xuICAgICAgICB0aGlzLm9yaWdpbmFsQ29uc29sZSA9IG51bGw7XG4gICAgIH1cblxuICAgIHdyaXRlKG1zZywgbGV2ZWwpIHtcbiAgICAgICAgaWYgKG1zZyA9PSBudWxsKSBtc2cgPSAnbnVsbCc7XG4gICAgICAgIGlmICh0aGlzLm9yaWdpbmFsQ29uc29sZSkge1xuICAgICAgICAgICAgaWYgKGxldmVsID09PSBsZXZlbHMubnVtZXJpYy5FUlJPUikgeyB0aGlzLm9yaWdpbmFsQ29uc29sZS5lcnJvci5jYWxsKGdsb2JhbC5jb25zb2xlLCBtc2cpOyB9IGVsc2UgeyB0aGlzLm9yaWdpbmFsQ29uc29sZS5sb2cuY2FsbChnbG9iYWwuY29uc29sZSwgbXNnKTsgfVxuICAgICAgICB9IGVsc2UgaWYgKGxldmVsID09PSBsZXZlbHMubnVtZXJpYy5FUlJPUikgeyBnbG9iYWwuY29uc29sZS5lcnJvcihtc2cpOyB9IGVsc2UgeyBnbG9iYWwuY29uc29sZS5sb2cobXNnKTsgfVxuICAgIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBDb25zb2xlVHJhbnNwb3J0O1xuIiwibW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgbnVtZXJpYzogeyBFUlJPUjogMCwgSU5GTzogMSwgVkVSQk9TRTogMiwgU0lMTFk6IDMgfSxcbiAgICBuYW1lczogWydFUlInLCAnSU5GJywgJ1ZFUicsICdTSUwnXVxufTtcbiIsImNvbnN0IGxldmVscyA9IHJlcXVpcmUoJy4vbGV2ZWxzJyk7XG5cbmNsYXNzIFRyYW5zcG9ydCB7XG4gICAgZ2V0IGxldmVsKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5tYXhMZXZlbDtcbiAgICB9XG5cbiAgICBzZXQgbGV2ZWwobCkge1xuICAgICAgICBpZiAoIU51bWJlci5pc0ludGVnZXIobCkpIHRocm93IG5ldyBFcnJvcignbGV2ZWwgbXVzdCBiZSBhbiBpbnRlZ2VyJyk7XG4gICAgICAgIHRoaXMubWF4TGV2ZWwgPSBsO1xuICAgIH1cblxuICAgIGNsZWFyTGV2ZWwoKSB7XG4gICAgICAgIHRoaXMubWF4TGV2ZWwgPSB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgY29uc3RydWN0b3IobGV2ZWwpIHtcbiAgICAgICAgaWYgKGxldmVsKSB0aGlzLmxldmVsID0gbGV2ZWw7XG4gICAgfVxuXG4gICAgY29uZGl0aW9uYWxXcml0ZShtZXNzYWdlLCBsZXZlbCwgZ2VuZXJhbE1heExldmVsKSB7XG4gICAgICAgIGlmIChsZXZlbCA+ICh0aGlzLmxldmVsID09PSB1bmRlZmluZWQgPyBnZW5lcmFsTWF4TGV2ZWwgOiB0aGlzLmxldmVsKSkgcmV0dXJuO1xuICAgICAgICB0aGlzLndyaXRlKG1lc3NhZ2UpO1xuICAgIH1cblxuICAgIHdyaXRlKCkge31cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBUcmFuc3BvcnQ7XG4iXX0=
