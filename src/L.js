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

;(function(L) {
    'use strict';
    const levels = require('./lib/levels');
    const CacheTransport = require('./lib/cache');
    const ConsoleTransport = require('./lib/console');
    const cacheTransport = new CacheTransport();
    const consoleTransport = new ConsoleTransport();

    const globalish = (typeof self === 'object' && self.self === self && self) ||
                        (typeof global === 'object' && global.global === global && global) ||
                        this;

    const levelNames = levels.names;
    levelNames['-1'] = 'BNC';

    // registered web workers
    const workers = [];
    // benchmarks in progress
    const runningBenchmarks = {};

    // export
    L.Transport = require('./lib/transport');

    L.LEVELS = levels.numeric;

    let originalOnError;
    let onErrorIsCaptured = false;

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
    L.rawWrite = (msg, level) => {
        Object.keys(L.writers).forEach((k) => {
            L.writers[k].conditionalWrite(msg, level, L.level);
        });
    };

    // -- Capture global ------------------------------------------------------------------------------------------------------

    /**
     * Capture global errors.
     */
    L.captureGlobalErrors = () => {
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
    L.releaseglobalErrors = () => {
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
    L.captureConsole = () => {
        try {
            if (consoleTransport.originalConsole) return;

            if (!globalish.console) globalish.console = {};

            consoleTransport.originalConsole = {
                log: globalish.console.log,
                error: globalish.console.error,
                warn: globalish.console.warn
            };

            globalish.console.log = globalish.console.warn = (...args) => {
                for (let i = 0; i < args.length; i++) {
                    L.info(args[i]);
                }
            };
            globalish.console.error = (...args) => {
                for (let i = 0; i < args.length; i++) {
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
    L.releaseConsole = () => {
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
    L.switchToWorkerMode = (workerName) => {
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
    L.setOptions = (options) => {
        if (options.level) L.level = options.level;
        if (options.benchmarkEnabled) L.level = options.benchmarkEnabled;
        if (options.benchmarkTimeout) L.level = options.benchmarkTimeout;
    };

    L.setWorkersOptions = (options) => {
        workers.forEach((w) => {
            w.postMessage(options);
        });
    };

    L.addWorker = (worker) => {
        if (workers.indexOf(worker) >= 0) return;
        workers.push(worker);
    };

    L.removeWorker = (worker) => {
        const ind = workers.indexOf(worker);
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
    L.addTransport = (name, transport, maxLevel) => {
        if (maxLevel !== undefined) transport.level = maxLevel;
        L.writers[name] = transport;
    };

    /**
     * Remove a transport by name.
     *
     * @param {String} name
     */
    L.removeTransport = function(name) {
        delete L.writers[name];
    };

    // -- Benchmarks ------------------------------------------------------------------------------------------------------

    L.B = {};

    L.B.start = (name, msg, timeout) => {
        try {
            if (!L.benchmarkEnabled) return;

            if (runningBenchmarks.hasOwnProperty(name)) {
                L.error('Duplicate benchmark name');
                return;
            }

            runningBenchmarks[name] = {
                ts: Date.now(),
                msg,
                timeoutId: globalish.setTimeout(L.B.stop.bind(this, name, true), (timeout || L.benchmarkTimeout) * 1000)
            };
        } catch (e) {
            L.error(e);
            // yes, we are not interested in handling exception
        }
    };

    L.B.stop = (name, timeout) => {
        try {
            if (!runningBenchmarks.hasOwnProperty(name)) {
                L.error('Benchmark name {0} not found', name);
                return;
            }
            const b = runningBenchmarks[name];
            const time = Date.now() - b.ts;
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
        let msg = msgArg;
        try {
            if (typeof ms === 'function') msg = msg();

            msg = stringify(msg);

            const head =
                L.workerName
                    ? interpolate('{0} {1}:{2} ', [getTimestamp(), levelNames[level], L.workerName])
                    : interpolate('{0} {1}: ', [getTimestamp(), levelNames[level]]);

            const entry = head + interpolate(msg, getArguments(arguments));
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
        globalish.postMessage({ ljsMessage: msg, level });
    }

    /**
     * Extracts meaningful arguments from arguments object
     * @param args
     */
    function getArguments(args) {
        if (args.length <= 2) return null;

        // splice on arguments prevents js optimisation, so we do it a bit longer way
        const arg = [];
        for (let i = 2; i < args.length; i++) { arg.push(args[i]); }

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

        return str.replace(/{([^{}]*)}/g,
            (a, b) => {
                return stringify(args[b]);
            }
        );
    }

    // Opinionated any-value to string converter
    function stringify(val) {
        if (typeof (val) === 'string') return val;

        if (val instanceof Error) { return `${val.message} ${val.stack}`; }

        if (val instanceof Date) { return val.toISOString(); }

        return JSON.stringify(val);
    }

    function getTimestamp() {
        const d = new Date();
        return `${pad(d.getDate())
            }-${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())
            }.${pad2(d.getUTCMilliseconds())}`;
    }

    // performance over fanciness
    function pad(n) {
        const ret = n.toString();
        return ret.length === 2 ? ret : (`0${ret}`);
    }

    // performance over fanciness
    function pad2(n) {
        const ret = n.toString();
        return ret.length === 3 ? ret : (ret.length === 2 ? (`0${ret}`) : (`00${ret}`));
    }
})(typeof module !== 'undefined' && module.exports ? module.exports : (self.L = self.L || {}));
