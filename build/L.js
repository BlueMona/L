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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvTC5qcyIsInNyYy9saWIvY2FjaGUuanMiLCJzcmMvbGliL2NvbnNvbGUuanMiLCJzcmMvbGliL2xldmVscy5qcyIsInNyYy9saWIvdHJhbnNwb3J0LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7QUNBQTs7Ozs7Ozs7Ozs7Ozs7QUFjQSxDQUFDLENBQUMsVUFBUyxDQUFULEVBQVk7QUFDVjs7QUFEVTs7QUFFVixRQUFNLFNBQVMsUUFBUSxjQUFSLENBQWY7QUFDQSxRQUFNLGlCQUFpQixRQUFRLGFBQVIsQ0FBdkI7QUFDQSxRQUFNLG1CQUFtQixRQUFRLGVBQVIsQ0FBekI7QUFDQSxRQUFNLGlCQUFpQixJQUFJLGNBQUosRUFBdkI7QUFDQSxRQUFNLG1CQUFtQixJQUFJLGdCQUFKLEVBQXpCOztBQUVBLFFBQU0sWUFBYSxRQUFPLElBQVAseUNBQU8sSUFBUCxPQUFnQixRQUFoQixJQUE0QixLQUFLLElBQUwsS0FBYyxJQUExQyxJQUFrRCxJQUFuRCxJQUNHLFFBQU8sTUFBUCx5Q0FBTyxNQUFQLE9BQWtCLFFBQWxCLElBQThCLE9BQU8sTUFBUCxLQUFrQixNQUFoRCxJQUEwRCxNQUQ3RCxJQUVFLElBRnBCOztBQUlBLFFBQU0sYUFBYSxPQUFPLEtBQTFCO0FBQ0EsZUFBVyxJQUFYLElBQW1CLEtBQW5COztBQUVBO0FBQ0EsUUFBTSxVQUFVLEVBQWhCO0FBQ0E7QUFDQSxRQUFNLG9CQUFvQixFQUExQjs7QUFFQTtBQUNBLE1BQUUsU0FBRixHQUFjLFFBQVEsaUJBQVIsQ0FBZDs7QUFFQSxNQUFFLE1BQUYsR0FBVyxPQUFPLE9BQWxCOztBQUVBLFFBQUksd0JBQUo7QUFDQSxRQUFJLG9CQUFvQixLQUF4Qjs7QUFFQTtBQUNBO0FBQ0EsTUFBRSxLQUFGLEdBQVUsRUFBRSxNQUFGLENBQVMsSUFBbkI7QUFDQTtBQUNBLE1BQUUsZ0JBQUYsR0FBcUIsSUFBckI7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QXdFO0FBQUUsdUJBQU8sT0FBUCxDQUFlLEdBQWYsQ0FBbUIsR0FBbkI7QUFBMEI7QUFDOUc7Ozs7RUFaMEIsUzs7QUFlL0IsT0FBTyxPQUFQLEdBQWlCLGdCQUFqQjs7Ozs7OztBQ2xCQSxPQUFPLE9BQVAsR0FBaUI7QUFDYixhQUFTLEVBQUUsT0FBTyxDQUFULEVBQVksTUFBTSxDQUFsQixFQUFxQixTQUFTLENBQTlCLEVBQWlDLE9BQU8sQ0FBeEMsRUFESTtBQUViLFdBQU8sQ0FBQyxLQUFELEVBQVEsS0FBUixFQUFlLEtBQWYsRUFBc0IsS0FBdEI7QUFGTSxDQUFqQjs7Ozs7Ozs7O0FDQUEsSUFBTSxTQUFTLFFBQVEsVUFBUixDQUFmOztJQUVNLFM7OztxQ0FVVztBQUNULGlCQUFLLFFBQUwsR0FBZ0IsU0FBaEI7QUFDSDs7OzRCQVhXO0FBQ1IsbUJBQU8sS0FBSyxRQUFaO0FBQ0gsUzswQkFFUyxDLEVBQUc7QUFDVCxnQkFBSSxDQUFDLE9BQU8sU0FBUCxDQUFpQixDQUFqQixDQUFMLEVBQTBCLE1BQU0sSUFBSSxLQUFKLENBQVUsMEJBQVYsQ0FBTjtBQUMxQixpQkFBSyxRQUFMLEdBQWdCLENBQWhCO0FBQ0g7OztBQU1ELHVCQUFZLEtBQVosRUFBbUI7QUFBQTs7QUFDZixZQUFJLEtBQUosRUFBVyxLQUFLLEtBQUwsR0FBYSxLQUFiO0FBQ2Q7Ozs7eUNBRWdCLE8sRUFBUyxLLEVBQU8sZSxFQUFpQjtBQUM5QyxnQkFBSSxTQUFTLEtBQUssS0FBTCxLQUFlLFNBQWYsR0FBMkIsZUFBM0IsR0FBNkMsS0FBSyxLQUEzRCxDQUFKLEVBQXVFO0FBQ3ZFLGlCQUFLLEtBQUwsQ0FBVyxPQUFYO0FBQ0g7OztnQ0FFTyxDQUFFOzs7Ozs7QUFHZCxPQUFPLE9BQVAsR0FBaUIsU0FBakIiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLyoqXG4gKiAgTC5qc1xuICogIC0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIE9waW5pb25hdGVkLCB1bm9idHJ1c2l2ZSB5ZXQgcG93ZXJmdWwgbG9nZ2luZyBsaWJyYXJ5IG9yaWdpbmFsbHkgbWFkZSBmb3IgUGVlcmlvIGFwcHMgKGh0dHA6Ly9wZWVyaW8uY29tKS5cbiAqXG4gKiAgRmVhdHVyZXM6XG4gKiAgLSBMb2dnaW5nXG4gKiAgLSBCZW5jaG1hcmtpbmdcbiAqICAtIFN0cmluZyBpbnRlcnBvbGF0aW9uOiBsb2cgbWVzc2FnZSBtYXkgY29udGFpbiByZXBlYXRhYmxlIHBsYWNlaG9sZGVycyBgezB9ezF9ezJ9ezF9YFxuICogIC0gTG9nZ2luZyBjb2RlIGFuZCBjYWxscyBjYW4gYmUgY29tcGxldGVseSB3aXBlZCBvdXQgaW4gcHJvZHVjdGlvbiBidWlsZHMgd2l0aCByZWdleCByZXBsYWNlLlxuICpcbiAqICAvIFBlZXJpbyAvIEFucmkgQXNhdHVyb3YgLyAyMDE1IC9cbiAqL1xuXG47KGZ1bmN0aW9uKEwpIHtcbiAgICAndXNlIHN0cmljdCc7XG4gICAgY29uc3QgbGV2ZWxzID0gcmVxdWlyZSgnLi9saWIvbGV2ZWxzJyk7XG4gICAgY29uc3QgQ2FjaGVUcmFuc3BvcnQgPSByZXF1aXJlKCcuL2xpYi9jYWNoZScpO1xuICAgIGNvbnN0IENvbnNvbGVUcmFuc3BvcnQgPSByZXF1aXJlKCcuL2xpYi9jb25zb2xlJyk7XG4gICAgY29uc3QgY2FjaGVUcmFuc3BvcnQgPSBuZXcgQ2FjaGVUcmFuc3BvcnQoKTtcbiAgICBjb25zdCBjb25zb2xlVHJhbnNwb3J0ID0gbmV3IENvbnNvbGVUcmFuc3BvcnQoKTtcblxuICAgIGNvbnN0IGdsb2JhbGlzaCA9ICh0eXBlb2Ygc2VsZiA9PT0gJ29iamVjdCcgJiYgc2VsZi5zZWxmID09PSBzZWxmICYmIHNlbGYpIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICAodHlwZW9mIGdsb2JhbCA9PT0gJ29iamVjdCcgJiYgZ2xvYmFsLmdsb2JhbCA9PT0gZ2xvYmFsICYmIGdsb2JhbCkgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXM7XG5cbiAgICBjb25zdCBsZXZlbE5hbWVzID0gbGV2ZWxzLm5hbWVzO1xuICAgIGxldmVsTmFtZXNbJy0xJ10gPSAnQk5DJztcblxuICAgIC8vIHJlZ2lzdGVyZWQgd2ViIHdvcmtlcnNcbiAgICBjb25zdCB3b3JrZXJzID0gW107XG4gICAgLy8gYmVuY2htYXJrcyBpbiBwcm9ncmVzc1xuICAgIGNvbnN0IHJ1bm5pbmdCZW5jaG1hcmtzID0ge307XG5cbiAgICAvLyBleHBvcnRcbiAgICBMLlRyYW5zcG9ydCA9IHJlcXVpcmUoJy4vbGliL3RyYW5zcG9ydCcpO1xuXG4gICAgTC5MRVZFTFMgPSBsZXZlbHMubnVtZXJpYztcblxuICAgIGxldCBvcmlnaW5hbE9uRXJyb3I7XG4gICAgbGV0IG9uRXJyb3JJc0NhcHR1cmVkID0gZmFsc2U7XG5cbiAgICAvLyAtLSBkZWZhdWx0IHNldHRpbmdzXG4gICAgLy8gY3VycmVudCBsb2cgbGV2ZWxcbiAgICBMLmxldmVsID0gTC5MRVZFTFMuSU5GTztcbiAgICAvLyB1c2UgYmVuY2htYXJrc1xuICAgIEwuYmVuY2htYXJrRW5hYmxlZCA9IHRydWU7XG4gICAgLy8gYnkgZGVmYXVsdCBiZW5jaG1hcmtzIHRpbWVvdXQgYWZ0ZXIgdGhpcyBudW1iZXIgb2Ygc2Vjb25kc1xuICAgIEwuYmVuY2htYXJrVGltZW91dCA9IDEyMDtcbiAgICAvLyBkZWZhdWx0IHdyaXRlcnNcbiAgICBMLndyaXRlcnMgPSB7XG4gICAgICAgIGNvbnNvbGU6IGNvbnNvbGVUcmFuc3BvcnQsXG4gICAgICAgIGNhY2hlOiBjYWNoZVRyYW5zcG9ydFxuICAgIH07XG5cbiAgICBMLmVycm9yID0gbG9nLmJpbmQoTCwgTC5MRVZFTFMuRVJST1IpO1xuICAgIEwuaW5mbyA9IGxvZy5iaW5kKEwsIEwuTEVWRUxTLklORk8pO1xuICAgIEwudmVyYm9zZSA9IGxvZy5iaW5kKEwsIEwuTEVWRUxTLlZFUkJPU0UpO1xuICAgIEwuc2lsbHkgPSBsb2cuYmluZChMLCBMLkxFVkVMUy5TSUxMWSk7XG5cbiAgICAvKipcbiAgICAgKiBXcml0ZXMgbWVzc2FnZSB3aXRob3V0IGFueSBwcmUtcHJvY2Vzc2luZ1xuICAgICAqIFRoaXMgaXMgdXNlZnVsIHdoZW4gd3JpdGluZyBwcmUtcHJvY2Vzc2VkIG1lc3NhZ2VzIHJlY2VpdmVkIGZyb20gd2ViIHdvcmtlclxuICAgICAqIEBwYXJhbSBtc2dcbiAgICAgKiBAcGFyYW0gW2xldmVsXVxuICAgICAqL1xuICAgIEwucmF3V3JpdGUgPSAobXNnLCBsZXZlbCkgPT4ge1xuICAgICAgICBPYmplY3Qua2V5cyhMLndyaXRlcnMpLmZvckVhY2goKGspID0+IHtcbiAgICAgICAgICAgIEwud3JpdGVyc1trXS5jb25kaXRpb25hbFdyaXRlKG1zZywgbGV2ZWwsIEwubGV2ZWwpO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgLy8gLS0gQ2FwdHVyZSBnbG9iYWwgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICAvKipcbiAgICAgKiBDYXB0dXJlIGdsb2JhbCBlcnJvcnMuXG4gICAgICovXG4gICAgTC5jYXB0dXJlR2xvYmFsRXJyb3JzID0gKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKG9uRXJyb3JJc0NhcHR1cmVkKSByZXR1cm47XG4gICAgICAgICAgICBvbkVycm9ySXNDYXB0dXJlZCA9IHRydWU7XG4gICAgICAgICAgICBvcmlnaW5hbE9uRXJyb3IgPSBnbG9iYWxpc2gub25lcnJvcjtcbiAgICAgICAgICAgIGdsb2JhbGlzaC5vbmVycm9yID0gTC5lcnJvcjtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgTC5lcnJvcihlKTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBTdG9wIGNhcHR1cmluZyBnbG9iYWwgZXJyb3JzLlxuICAgICAqL1xuICAgIEwucmVsZWFzZWdsb2JhbEVycm9ycyA9ICgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmICghb25FcnJvcklzQ2FwdHVyZWQpIHJldHVybjtcbiAgICAgICAgICAgIG9uRXJyb3JJc0NhcHR1cmVkID0gZmFsc2U7XG4gICAgICAgICAgICBnbG9iYWxpc2gub25lcnJvciA9IG9yaWdpbmFsT25FcnJvcjtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgTC5lcnJvcihlKTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBPdmVycmlkZXMgY29uc29sZS5sb2csIGNvbnNvbGUuZXJyb3IgYW5kIGNvbnNvbGUud2Fybi5cbiAgICAgKiBSZXJvdXRlcyBvdmVycmlkZGVuIGNhbGxzIHRvIHNlbGYuXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHdvcmtlck5hbWVcbiAgICAgKi9cbiAgICBMLmNhcHR1cmVDb25zb2xlID0gKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKGNvbnNvbGVUcmFuc3BvcnQub3JpZ2luYWxDb25zb2xlKSByZXR1cm47XG5cbiAgICAgICAgICAgIGlmICghZ2xvYmFsaXNoLmNvbnNvbGUpIGdsb2JhbGlzaC5jb25zb2xlID0ge307XG5cbiAgICAgICAgICAgIGNvbnNvbGVUcmFuc3BvcnQub3JpZ2luYWxDb25zb2xlID0ge1xuICAgICAgICAgICAgICAgIGxvZzogZ2xvYmFsaXNoLmNvbnNvbGUubG9nLFxuICAgICAgICAgICAgICAgIGVycm9yOiBnbG9iYWxpc2guY29uc29sZS5lcnJvcixcbiAgICAgICAgICAgICAgICB3YXJuOiBnbG9iYWxpc2guY29uc29sZS53YXJuXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBnbG9iYWxpc2guY29uc29sZS5sb2cgPSBnbG9iYWxpc2guY29uc29sZS53YXJuID0gKC4uLmFyZ3MpID0+IHtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGFyZ3MubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgTC5pbmZvKGFyZ3NbaV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBnbG9iYWxpc2guY29uc29sZS5lcnJvciA9ICguLi5hcmdzKSA9PiB7XG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhcmdzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIEwuZXJyb3IoYXJnc1tpXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgTC5lcnJvcihlKTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBCcmluZ3MgYmFjayBjb25zb2xlIGZ1bmN0aW9ucyB0byB0aGUgc3RhdGUgdGhleSB3ZXJlIGJlZm9yZSBjYXB0dXJpbmdcbiAgICAgKi9cbiAgICBMLnJlbGVhc2VDb25zb2xlID0gKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKCFjb25zb2xlVHJhbnNwb3J0Lm9yaWdpbmFsQ29uc29sZSkgcmV0dXJuO1xuICAgICAgICAgICAgZ2xvYmFsaXNoLmNvbnNvbGUubG9nID0gY29uc29sZVRyYW5zcG9ydC5vcmlnaW5hbENvbnNvbGUubG9nO1xuICAgICAgICAgICAgZ2xvYmFsaXNoLmNvbnNvbGUuZXJyb3IgPSBjb25zb2xlVHJhbnNwb3J0Lm9yaWdpbmFsQ29uc29sZS5lcnJvcjtcbiAgICAgICAgICAgIGdsb2JhbGlzaC5jb25zb2xlLndhcm4gPSBjb25zb2xlVHJhbnNwb3J0Lm9yaWdpbmFsQ29uc29sZS53YXJuO1xuICAgICAgICAgICAgY29uc29sZVRyYW5zcG9ydC5vcmlnaW5hbENvbnNvbGUgPSBudWxsO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBMLmVycm9yKGUpO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIC8vIC0tIFdvcmtlciBtb2RlIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gICAgLyoqXG4gICAgICogRGlzY2FyZCB3b3JrZXJzIGFuZCBqdXN0IHBvc3QgdG8gVUkgdGhyZWFkLlxuICAgICAqL1xuICAgIEwuc3dpdGNoVG9Xb3JrZXJNb2RlID0gKHdvcmtlck5hbWUpID0+IHtcbiAgICAgICAgTC5jYXB0dXJlQ29uc29sZSgpO1xuICAgICAgICBMLmNhcHR1cmVnbG9iYWxFcnJvcnMoKTtcbiAgICAgICAgTC53b3JrZXJOYW1lID0gd29ya2VyTmFtZTtcbiAgICAgICAgTC5jYWNoZUxpbWl0ID0gMDtcbiAgICAgICAgTC53cml0ZXJzID0gW3Bvc3RUb1VJVGhyZWFkXTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogVXBkYXRlcyBMLmpzIG9wdGlvbnMgd2l0aCB2YWx1ZXMgcHJvdmlkZWQgaW4gY29uZmlnIG9iamVjdC5cbiAgICAgKiBUaGlzIGZ1bmN0aW9uIGlzIHN1cHBvc2VkIHRvIGJlIHVzZWQgd2hlbiBydW5uaW5nIGluIHdlYiB3b3JrZXIsXG4gICAgICogc28gaXQgaWdub3JlcyBpcnJlbGV2YW50IG9wdGlvbnNcbiAgICAgKiBAcGFyYW0gb3B0aW9ucyB7e2xldmVsOiBOdW1iZXIsIGJlbmNobWFya0VuYWJsZWQ6IEJvb2xlYW4sIGJlbmNobWFya1RpbWVvdXQ6IE51bWJlcn19XG4gICAgICovXG4gICAgTC5zZXRPcHRpb25zID0gKG9wdGlvbnMpID0+IHtcbiAgICAgICAgaWYgKG9wdGlvbnMubGV2ZWwpIEwubGV2ZWwgPSBvcHRpb25zLmxldmVsO1xuICAgICAgICBpZiAob3B0aW9ucy5iZW5jaG1hcmtFbmFibGVkKSBMLmxldmVsID0gb3B0aW9ucy5iZW5jaG1hcmtFbmFibGVkO1xuICAgICAgICBpZiAob3B0aW9ucy5iZW5jaG1hcmtUaW1lb3V0KSBMLmxldmVsID0gb3B0aW9ucy5iZW5jaG1hcmtUaW1lb3V0O1xuICAgIH07XG5cbiAgICBMLnNldFdvcmtlcnNPcHRpb25zID0gKG9wdGlvbnMpID0+IHtcbiAgICAgICAgd29ya2Vycy5mb3JFYWNoKCh3KSA9PiB7XG4gICAgICAgICAgICB3LnBvc3RNZXNzYWdlKG9wdGlvbnMpO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgTC5hZGRXb3JrZXIgPSAod29ya2VyKSA9PiB7XG4gICAgICAgIGlmICh3b3JrZXJzLmluZGV4T2Yod29ya2VyKSA+PSAwKSByZXR1cm47XG4gICAgICAgIHdvcmtlcnMucHVzaCh3b3JrZXIpO1xuICAgIH07XG5cbiAgICBMLnJlbW92ZVdvcmtlciA9ICh3b3JrZXIpID0+IHtcbiAgICAgICAgY29uc3QgaW5kID0gd29ya2Vycy5pbmRleE9mKHdvcmtlcik7XG4gICAgICAgIGlmIChpbmQgPCAwKSByZXR1cm47XG4gICAgICAgIHdvcmtlcnMuc3BsaWNlKGluZCwgMSk7XG4gICAgfTtcblxuICAgIC8vIC0tIFRyYW5zcG9ydHMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICAvKipcbiAgICAgKiBBZGQgYSB0cmFuc3BvcnQgd2l0aCBhIG1heCBsb2cgbGV2ZWwgdGhhdCB3aWxsIGJlIHdyaXR0ZW4gdG8gaXQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICAgICAqIEBwYXJhbSB7VHJhbnNwb3J0fSB0cmFuc3BvcnRcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gbWF4TGV2ZWxcbiAgICAgKi9cbiAgICBMLmFkZFRyYW5zcG9ydCA9IChuYW1lLCB0cmFuc3BvcnQsIG1heExldmVsKSA9PiB7XG4gICAgICAgIGlmIChtYXhMZXZlbCAhPT0gdW5kZWZpbmVkKSB0cmFuc3BvcnQubGV2ZWwgPSBtYXhMZXZlbDtcbiAgICAgICAgTC53cml0ZXJzW25hbWVdID0gdHJhbnNwb3J0O1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmUgYSB0cmFuc3BvcnQgYnkgbmFtZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lXG4gICAgICovXG4gICAgTC5yZW1vdmVUcmFuc3BvcnQgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgIGRlbGV0ZSBMLndyaXRlcnNbbmFtZV07XG4gICAgfTtcblxuICAgIC8vIC0tIEJlbmNobWFya3MgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICBMLkIgPSB7fTtcblxuICAgIEwuQi5zdGFydCA9IChuYW1lLCBtc2csIHRpbWVvdXQpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmICghTC5iZW5jaG1hcmtFbmFibGVkKSByZXR1cm47XG5cbiAgICAgICAgICAgIGlmIChydW5uaW5nQmVuY2htYXJrcy5oYXNPd25Qcm9wZXJ0eShuYW1lKSkge1xuICAgICAgICAgICAgICAgIEwuZXJyb3IoJ0R1cGxpY2F0ZSBiZW5jaG1hcmsgbmFtZScpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcnVubmluZ0JlbmNobWFya3NbbmFtZV0gPSB7XG4gICAgICAgICAgICAgICAgdHM6IERhdGUubm93KCksXG4gICAgICAgICAgICAgICAgbXNnLFxuICAgICAgICAgICAgICAgIHRpbWVvdXRJZDogZ2xvYmFsaXNoLnNldFRpbWVvdXQoTC5CLnN0b3AuYmluZCh0aGlzLCBuYW1lLCB0cnVlKSwgKHRpbWVvdXQgfHwgTC5iZW5jaG1hcmtUaW1lb3V0KSAqIDEwMDApXG4gICAgICAgICAgICB9O1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBMLmVycm9yKGUpO1xuICAgICAgICAgICAgLy8geWVzLCB3ZSBhcmUgbm90IGludGVyZXN0ZWQgaW4gaGFuZGxpbmcgZXhjZXB0aW9uXG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgTC5CLnN0b3AgPSAobmFtZSwgdGltZW91dCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKCFydW5uaW5nQmVuY2htYXJrcy5oYXNPd25Qcm9wZXJ0eShuYW1lKSkge1xuICAgICAgICAgICAgICAgIEwuZXJyb3IoJ0JlbmNobWFyayBuYW1lIHswfSBub3QgZm91bmQnLCBuYW1lKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBiID0gcnVubmluZ0JlbmNobWFya3NbbmFtZV07XG4gICAgICAgICAgICBjb25zdCB0aW1lID0gRGF0ZS5ub3coKSAtIGIudHM7XG4gICAgICAgICAgICBkZWxldGUgcnVubmluZ0JlbmNobWFya3NbbmFtZV07XG4gICAgICAgICAgICBsb2coLTEsICd7MH06IHsxfSB8IHsyfSBzLicsIG5hbWUsIHRpbWVvdXQgPyAnQkVOQ0hNQVJLIFRJTUVPVVQnIDogYi5tc2cgfHwgJycsIHRpbWUgLyAxMDAwKTtcbiAgICAgICAgICAgIGdsb2JhbGlzaC5jbGVhclRpbWVvdXQoYi50aW1lb3V0SWQpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBMLmVycm9yKGUpO1xuICAgICAgICAgICAgLy8geWVzLCB3ZSBhcmUgbm90IGludGVyZXN0ZWQgaW4gaGFuZGxpbmcgZXhjZXB0aW9uXG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgLy8gLS0gUHJpdmF0ZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgICBmdW5jdGlvbiBsb2cobGV2ZWwsIG1zZ0FyZykge1xuICAgICAgICBsZXQgbXNnID0gbXNnQXJnO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBtcyA9PT0gJ2Z1bmN0aW9uJykgbXNnID0gbXNnKCk7XG5cbiAgICAgICAgICAgIG1zZyA9IHN0cmluZ2lmeShtc2cpO1xuXG4gICAgICAgICAgICBjb25zdCBoZWFkID1cbiAgICAgICAgICAgICAgICBMLndvcmtlck5hbWVcbiAgICAgICAgICAgICAgICAgICAgPyBpbnRlcnBvbGF0ZSgnezB9IHsxfTp7Mn0gJywgW2dldFRpbWVzdGFtcCgpLCBsZXZlbE5hbWVzW2xldmVsXSwgTC53b3JrZXJOYW1lXSlcbiAgICAgICAgICAgICAgICAgICAgOiBpbnRlcnBvbGF0ZSgnezB9IHsxfTogJywgW2dldFRpbWVzdGFtcCgpLCBsZXZlbE5hbWVzW2xldmVsXV0pO1xuXG4gICAgICAgICAgICBjb25zdCBlbnRyeSA9IGhlYWQgKyBpbnRlcnBvbGF0ZShtc2csIGdldEFyZ3VtZW50cyhhcmd1bWVudHMpKTtcbiAgICAgICAgICAgIEwucmF3V3JpdGUoZW50cnksIGxldmVsKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBMLmVycm9yKGUpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgIC8vIHdlbGwuLiB3ZSB0cmllZFxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gd29ya2VyIG1vZGUgd3JpdGVyXG4gICAgZnVuY3Rpb24gcG9zdFRvVUlUaHJlYWQobXNnLCBsZXZlbCkge1xuICAgICAgICBnbG9iYWxpc2gucG9zdE1lc3NhZ2UoeyBsanNNZXNzYWdlOiBtc2csIGxldmVsIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEV4dHJhY3RzIG1lYW5pbmdmdWwgYXJndW1lbnRzIGZyb20gYXJndW1lbnRzIG9iamVjdFxuICAgICAqIEBwYXJhbSBhcmdzXG4gICAgICovXG4gICAgZnVuY3Rpb24gZ2V0QXJndW1lbnRzKGFyZ3MpIHtcbiAgICAgICAgaWYgKGFyZ3MubGVuZ3RoIDw9IDIpIHJldHVybiBudWxsO1xuXG4gICAgICAgIC8vIHNwbGljZSBvbiBhcmd1bWVudHMgcHJldmVudHMganMgb3B0aW1pc2F0aW9uLCBzbyB3ZSBkbyBpdCBhIGJpdCBsb25nZXIgd2F5XG4gICAgICAgIGNvbnN0IGFyZyA9IFtdO1xuICAgICAgICBmb3IgKGxldCBpID0gMjsgaSA8IGFyZ3MubGVuZ3RoOyBpKyspIHsgYXJnLnB1c2goYXJnc1tpXSk7IH1cblxuICAgICAgICByZXR1cm4gYXJnO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqICBJbnRlcnBvbGF0ZXMgc3RyaW5nIHJlcGxhY2luZyBwbGFjZWhvbGRlcnMgd2l0aCBhcmd1bWVudHNcbiAgICAgKiAgQHBhcmFtIHtzdHJpbmd9IHN0ciAtIHRlbXBsYXRlIHN0cmluZyB3aXRoIHBsYWNlaG9sZGVycyBpbiBmb3JtYXQgezB9IHsxfSB7Mn1cbiAgICAgKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgd2hlcmUgbnVtYmVyIGlzIGFyZ3VtZW50IGFycmF5IGluZGV4LlxuICAgICAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBOdW1iZXJzIGFsc28gY2FuIGJlIHJlcGxhY2VkIHdpdGggcHJvcGVydHkgbmFtZXMgb3IgYXJndW1lbnQgb2JqZWN0LlxuICAgICAqICBAcGFyYW0ge0FycmF5IHwgT2JqZWN0fSBhcmdzIC0gYXJndW1lbnQgYXJyYXkgb3Igb2JqZWN0XG4gICAgICogIEByZXR1cm5zIHtzdHJpbmd9IGludGVycG9sYXRlZCBzdHJpbmdcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBpbnRlcnBvbGF0ZShzdHIsIGFyZ3MpIHtcbiAgICAgICAgaWYgKCFhcmdzIHx8ICFhcmdzLmxlbmd0aCkgcmV0dXJuIHN0cjtcblxuICAgICAgICByZXR1cm4gc3RyLnJlcGxhY2UoL3soW157fV0qKX0vZyxcbiAgICAgICAgICAgIChhLCBiKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHN0cmluZ2lmeShhcmdzW2JdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyBPcGluaW9uYXRlZCBhbnktdmFsdWUgdG8gc3RyaW5nIGNvbnZlcnRlclxuICAgIGZ1bmN0aW9uIHN0cmluZ2lmeSh2YWwpIHtcbiAgICAgICAgaWYgKHR5cGVvZiAodmFsKSA9PT0gJ3N0cmluZycpIHJldHVybiB2YWw7XG5cbiAgICAgICAgaWYgKHZhbCBpbnN0YW5jZW9mIEVycm9yKSB7IHJldHVybiBgJHt2YWwubWVzc2FnZX0gJHt2YWwuc3RhY2t9YDsgfVxuXG4gICAgICAgIGlmICh2YWwgaW5zdGFuY2VvZiBEYXRlKSB7IHJldHVybiB2YWwudG9JU09TdHJpbmcoKTsgfVxuXG4gICAgICAgIHJldHVybiBKU09OLnN0cmluZ2lmeSh2YWwpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldFRpbWVzdGFtcCgpIHtcbiAgICAgICAgY29uc3QgZCA9IG5ldyBEYXRlKCk7XG4gICAgICAgIHJldHVybiBgJHtwYWQoZC5nZXREYXRlKCkpXG4gICAgICAgICAgICB9LSR7cGFkKGQuZ2V0VVRDSG91cnMoKSl9OiR7cGFkKGQuZ2V0VVRDTWludXRlcygpKX06JHtwYWQoZC5nZXRVVENTZWNvbmRzKCkpXG4gICAgICAgICAgICB9LiR7cGFkMihkLmdldFVUQ01pbGxpc2Vjb25kcygpKX1gO1xuICAgIH1cblxuICAgIC8vIHBlcmZvcm1hbmNlIG92ZXIgZmFuY2luZXNzXG4gICAgZnVuY3Rpb24gcGFkKG4pIHtcbiAgICAgICAgY29uc3QgcmV0ID0gbi50b1N0cmluZygpO1xuICAgICAgICByZXR1cm4gcmV0Lmxlbmd0aCA9PT0gMiA/IHJldCA6IChgMCR7cmV0fWApO1xuICAgIH1cblxuICAgIC8vIHBlcmZvcm1hbmNlIG92ZXIgZmFuY2luZXNzXG4gICAgZnVuY3Rpb24gcGFkMihuKSB7XG4gICAgICAgIGNvbnN0IHJldCA9IG4udG9TdHJpbmcoKTtcbiAgICAgICAgcmV0dXJuIHJldC5sZW5ndGggPT09IDMgPyByZXQgOiAocmV0Lmxlbmd0aCA9PT0gMiA/IChgMCR7cmV0fWApIDogKGAwMCR7cmV0fWApKTtcbiAgICB9XG59KSh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyAmJiBtb2R1bGUuZXhwb3J0cyA/IG1vZHVsZS5leHBvcnRzIDogKHNlbGYuTCA9IHNlbGYuTCB8fCB7fSkpO1xuIiwiY29uc3QgVHJhbnNwb3J0ID0gcmVxdWlyZSgnLi90cmFuc3BvcnQnKTtcblxuY2xhc3MgQ2FjaGVUcmFuc3BvcnQgZXh0ZW5kcyBUcmFuc3BvcnQge1xuXG4gICAgY29uc3RydWN0b3IobGV2ZWwpIHtcbiAgICAgICAgc3VwZXIobGV2ZWwpO1xuICAgICAgICB0aGlzLmNhY2hlID0gW107XG4gICAgICAgIHRoaXMuY2FjaGVMaW1pdCA9IDEwMDA7IC8vIGFtb3VudCBvZiBsb2cgZW50cmllcyB0byBrZWVwIGluIEZJRk8gTC5jYWNoZSBxdWV1ZS4gU2V0IHRvIDAgdG8gZGlzYWJsZS5cbiAgICB9XG5cbiAgICB3cml0ZShtc2csIGxldmVsKSB7XG4gICAgICAgIHRoaXMuY2FjaGUudW5zaGlmdChtc2cpO1xuXG4gICAgICAgIGlmICh0aGlzLmNhY2hlLmxlbmd0aCA+IHRoaXMuY2FjaGVMaW1pdCkge1xuICAgICAgICAgICAgdGhpcy5jYWNoZS5sZW5ndGggPSB0aGlzLmNhY2hlTGltaXQ7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXNldENhY2hlKCkge1xuICAgICAgICB0aGlzLmNhY2hlID0gW107XG4gICAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IENhY2hlVHJhbnNwb3J0O1xuIiwiY29uc3QgVHJhbnNwb3J0ID0gcmVxdWlyZSgnLi90cmFuc3BvcnQnKTtcbmNvbnN0IGxldmVscyA9IHJlcXVpcmUoJy4vbGV2ZWxzJyk7XG5cbmNsYXNzIENvbnNvbGVUcmFuc3BvcnQgZXh0ZW5kcyBUcmFuc3BvcnQge1xuXG4gICAgIGNvbnN0cnVjdG9yKGxldmVsKSB7XG4gICAgICAgIHN1cGVyKGxldmVsKTtcbiAgICAgICAgdGhpcy5vcmlnaW5hbENvbnNvbGUgPSBudWxsO1xuICAgICB9XG5cbiAgICB3cml0ZShtc2csIGxldmVsKSB7XG4gICAgICAgIGlmIChtc2cgPT0gbnVsbCkgbXNnID0gJ251bGwnO1xuICAgICAgICBpZiAodGhpcy5vcmlnaW5hbENvbnNvbGUpIHtcbiAgICAgICAgICAgIGlmIChsZXZlbCA9PT0gbGV2ZWxzLm51bWVyaWMuRVJST1IpIHsgdGhpcy5vcmlnaW5hbENvbnNvbGUuZXJyb3IuY2FsbChnbG9iYWwuY29uc29sZSwgbXNnKTsgfSBlbHNlIHsgdGhpcy5vcmlnaW5hbENvbnNvbGUubG9nLmNhbGwoZ2xvYmFsLmNvbnNvbGUsIG1zZyk7IH1cbiAgICAgICAgfSBlbHNlIGlmIChsZXZlbCA9PT0gbGV2ZWxzLm51bWVyaWMuRVJST1IpIHsgZ2xvYmFsLmNvbnNvbGUuZXJyb3IobXNnKTsgfSBlbHNlIHsgZ2xvYmFsLmNvbnNvbGUubG9nKG1zZyk7IH1cbiAgICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gQ29uc29sZVRyYW5zcG9ydDtcbiIsIm1vZHVsZS5leHBvcnRzID0ge1xuICAgIG51bWVyaWM6IHsgRVJST1I6IDAsIElORk86IDEsIFZFUkJPU0U6IDIsIFNJTExZOiAzIH0sXG4gICAgbmFtZXM6IFsnRVJSJywgJ0lORicsICdWRVInLCAnU0lMJ11cbn07XG4iLCJjb25zdCBsZXZlbHMgPSByZXF1aXJlKCcuL2xldmVscycpO1xuXG5jbGFzcyBUcmFuc3BvcnQge1xuICAgIGdldCBsZXZlbCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubWF4TGV2ZWw7XG4gICAgfVxuXG4gICAgc2V0IGxldmVsKGwpIHtcbiAgICAgICAgaWYgKCFOdW1iZXIuaXNJbnRlZ2VyKGwpKSB0aHJvdyBuZXcgRXJyb3IoJ2xldmVsIG11c3QgYmUgYW4gaW50ZWdlcicpO1xuICAgICAgICB0aGlzLm1heExldmVsID0gbDtcbiAgICB9XG5cbiAgICBjbGVhckxldmVsKCkge1xuICAgICAgICB0aGlzLm1heExldmVsID0gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIGNvbnN0cnVjdG9yKGxldmVsKSB7XG4gICAgICAgIGlmIChsZXZlbCkgdGhpcy5sZXZlbCA9IGxldmVsO1xuICAgIH1cblxuICAgIGNvbmRpdGlvbmFsV3JpdGUobWVzc2FnZSwgbGV2ZWwsIGdlbmVyYWxNYXhMZXZlbCkge1xuICAgICAgICBpZiAobGV2ZWwgPiAodGhpcy5sZXZlbCA9PT0gdW5kZWZpbmVkID8gZ2VuZXJhbE1heExldmVsIDogdGhpcy5sZXZlbCkpIHJldHVybjtcbiAgICAgICAgdGhpcy53cml0ZShtZXNzYWdlKTtcbiAgICB9XG5cbiAgICB3cml0ZSgpIHt9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gVHJhbnNwb3J0O1xuIl19
