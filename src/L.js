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


const l = {};
const levels = require('./lib/levels');
const CacheTransport = require('./lib/cache');
const ConsoleTransport = require('./lib/console');
const cacheTransport = new CacheTransport();
const consoleTransport = new ConsoleTransport();

const levelNames = levels.names;
levelNames['-1'] = 'BNC';

// registered web workers
const workers = [];
// benchmarks in progress
const runningBenchmarks = {};

// export
l.Transport = require('./lib/transport');

l.LEVELS = levels.numeric;

let originalOnError;
let onErrorIsCaptured = false;

// -- default settings
// current log level
l.level = l.LEVELS.INFO;
// use benchmarks
l.benchmarkEnabled = true;
// by default benchmarks timeout after this number of seconds
l.benchmarkTimeout = 120;
// default writers
l.writers = {
    console: consoleTransport,
    cache: cacheTransport
};

l.error = log.bind(l, l.LEVELS.ERROR);
l.info = log.bind(l, l.LEVELS.INFO);
l.verbose = log.bind(l, l.LEVELS.VERBOSE);
l.silly = log.bind(l, l.LEVELS.SILLY);

/**
 * Writes message without any pre-processing
 * This is useful when writing pre-processed messages received from web worker
 * @param msg
 * @param [level]
 */
l.rawWrite = (msg, level) => {
    Object.keys(l.writers).forEach((k) => {
        l.writers[k].conditionalWrite(msg, level, l.level);
    });
};

// -- Capture global ------------------------------------------------------------------------------------------------------

/**
 * Capture global errors.
 */
l.captureGlobalErrors = () => {
    try {
        if (onErrorIsCaptured) return;
        onErrorIsCaptured = true;
        originalOnError = global.onerror;
        global.onerror = l.error;
    } catch (e) {
        l.error(e);
    }
};

/**
 * Stop capturing global errors.
 */
l.releaseglobalErrors = () => {
    try {
        if (!onErrorIsCaptured) return;
        onErrorIsCaptured = false;
        global.onerror = originalOnError;
    } catch (e) {
        l.error(e);
    }
};

/**
 * Overrides console.log, console.error and console.warn.
 * Reroutes overridden calls to self.
 * @param {String} workerName
 */
l.captureConsole = () => {
    try {
        if (consoleTransport.originalConsole) return;

        if (!global.console) global.console = {};

        consoleTransport.originalConsole = {
            log: global.console.log,
            error: global.console.error,
            warn: global.console.warn
        };

        global.console.log = global.console.warn = (...args) => {
            for (let i = 0; i < args.length; i++) {
                l.info(args[i]);
            }
        };
        global.console.error = (...args) => {
            for (let i = 0; i < args.length; i++) {
                l.error(args[i]);
            }
        };
    } catch (e) {
        l.error(e);
    }
};

/**
 * Brings back console functions to the state they were before capturing
 */
l.releaseConsole = () => {
    try {
        if (!consoleTransport.originalConsole) return;
        global.console.log = consoleTransport.originalConsole.log;
        global.console.error = consoleTransport.originalConsole.error;
        global.console.warn = consoleTransport.originalConsole.warn;
        consoleTransport.originalConsole = null;
    } catch (e) {
        l.error(e);
    }
};

// -- Worker mode ------------------------------------------------------------------------------------------------------

/**
 * Discard workers and just post to UI thread.
 */
l.switchToWorkerMode = (workerName) => {
    l.captureConsole();
    l.captureglobalErrors();
    l.workerName = workerName;
    l.cacheLimit = 0;
    l.writers = [postToUIThread];
};

/**
 * Updates L.js options with values provided in config object.
 * This function is supposed to be used when running in web worker,
 * so it ignores irrelevant options
 * @param options {{level: Number, benchmarkEnabled: Boolean, benchmarkTimeout: Number}}
 */
l.setOptions = (options) => {
    if (options.level) l.level = options.level;
    if (options.benchmarkEnabled) l.level = options.benchmarkEnabled;
    if (options.benchmarkTimeout) l.level = options.benchmarkTimeout;
};

l.setWorkersOptions = (options) => {
    workers.forEach((w) => {
        w.postMessage(options);
    });
};

l.addWorker = (worker) => {
    if (workers.indexOf(worker) >= 0) return;
    workers.push(worker);
};

l.removeWorker = (worker) => {
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
l.addTransport = (name, transport, maxLevel) => {
    if (maxLevel !== undefined) transport.level = maxLevel;
    l.writers[name] = transport;
};

/**
 * Remove a transport by name.
 *
 * @param {String} name
 */
l.removeTransport = function(name) {
    delete l.writers[name];
};

// -- Benchmarks ------------------------------------------------------------------------------------------------------

l.B = {};

l.B.start = (name, msg, timeout) => {
    try {
        if (!l.benchmarkEnabled) return;

        if (runningBenchmarks.hasOwnProperty(name)) {
            l.error('Duplicate benchmark name');
            return;
        }

        runningBenchmarks[name] = {
            ts: Date.now(),
            msg,
            timeoutId: global.setTimeout(l.B.stop.bind(this, name, true), (timeout || l.benchmarkTimeout) * 1000)
        };
    } catch (e) {
        l.error(e);
        // yes, we are not interested in handling exception
    }
};

l.B.stop = (name, timeout) => {
    try {
        if (!runningBenchmarks.hasOwnProperty(name)) {
            l.error('Benchmark name {0} not found', name);
            return;
        }
        const b = runningBenchmarks[name];
        const time = Date.now() - b.ts;
        delete runningBenchmarks[name];
        log(-1, '{0}: {1} | {2} s.', name, timeout ? 'BENCHMARK TIMEOUT' : b.msg || '', time / 1000);
        global.clearTimeout(b.timeoutId);
    } catch (e) {
        l.error(e);
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
            l.workerName
                ? interpolate('{0} {1}:{2} ', [getTimestamp(), levelNames[level], l.workerName])
                : interpolate('{0} {1}: ', [getTimestamp(), levelNames[level]]);

        const entry = head + interpolate(msg, getArguments(arguments));
        l.rawWrite(entry, level);
    } catch (e) {
        try {
            l.error(e);
        } catch (e) {
            // well.. we tried
        }
    }
}

// worker mode writer
function postToUIThread(msg, level) {
    global.postMessage({ ljsMessage: msg, level });
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

module.exports = l;
