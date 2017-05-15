/**
 *  L.js
 *  ---------------------
 *  Opinionated, unobtrusive yet powerful logging library originally made for Peerio apps (http://peerio.com).
 *
 *  Features:
 *  - Logging
 *  - Benchmarking
 *  - Logging code and calls can be completely wiped out in production builds with regex replace.
 *
 *  / Peerio / Anri Asaturov / 2015 /
 */
const root = typeof (window) !== 'undefined' ? window : global;

let L = {};

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
        originalOnError = root.onerror;
        root.onerror = L.error;
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
        root.onerror = originalOnError;
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

        consoleTransport.originalConsole = {
            log: root.console.log,
            error: root.console.error,
            warn: root.console.warn
        };

        root.console.log = root.console.warn = L.info;

        root.console.error = L.error;

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
        root.console.log = consoleTransport.originalConsole.log;
        root.console.error = consoleTransport.originalConsole.error;
        root.console.warn = consoleTransport.originalConsole.warn;
        consoleTransport.originalConsole = null;
    } catch (e) {
        L.error(e);
    }
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
L.removeTransport = function (name) {
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
            timeoutId: root.setTimeout(L.B.stop.bind(this, name, true), (timeout || L.benchmarkTimeout) * 1000)
        };
    } catch (e) {
        L.error(e);
        // yes, we are not interested in handling exception
    }
};

L.B.stop = (name, timeout) => {
    try {
        if (!runningBenchmarks.hasOwnProperty(name)) {
            L.error(`Benchmark name ${name} not found`);
            return;
        }
        const b = runningBenchmarks[name];
        const time = Date.now() - b.ts;
        delete runningBenchmarks[name];
        log(-1, `${name}: ${timeout ? 'BENCHMARK TIMEOUT' : b.msg || ''} | ${time / 1000} s.`);
        root.clearTimeout(b.timeoutId);
    } catch (e) {
        L.error(e);
    }
};

// -- Private -------------------------------------------------------------------------------------------------------

function log(level) {
    let entry = `${getTimestamp()} ${levelNames[level]}`;
    for (let i = 1; i < arguments.length; i++) {
        let msg = arguments[i];
        const type = typeof (msg);
        if (type === 'function') {
            msg = _tryComputeLogMsg(msg);;
        } else if (type !== 'string') {
            msg = _tryStringifyLogMsg(msg);
        }
        entry += `: ${msg}`;
    }
    L.rawWrite(entry, level);
}

function _tryComputeLogMsg(msgFn) {
    try {
        return msgFn();
    } catch (err) {
        root.console.error(err);
        return 'L.js:[failed to compute message]';
    }
}

function _tryStringifyLogMsg(msg) {
    try {
        return JSON.stringify(msg, null, 1);
    } catch (err) {
        root.console.error(err);
        return 'L.js:[failed to stringify message]';
    }
}

function getTimestamp() {
    const d = new Date();
    return `${pad(d.getDate())}-${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())
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

module.exports = L;
