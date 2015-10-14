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


(function (root) {
  'use strict';
  var l = root.L = {};

  //-- constants
  // log message levels
  l.LEVELS = {ERROR: 0, INFO: 1, VERBOSE: 2, SILLY: 3};
  var levelNames = ['ERR', 'INF', 'VER', 'SIL'];
  var originalConsole, originalOnError, onErrorIsCaptured = false;
  //-- settings
  // current log level
  l.level = l.LEVELS.VERBOSE;
  // amount of log entries to keep in FIFO L.cache queue. Set to 0 to disable.
  l.cacheLimit = 1000;

  l.benchmarkEnabled = true;
  // by default benchmarks timeout after this number of seconds
  l.benchmarkTimeout = 120;
  // cached log entries
  l.cache = [];

  // benchmarks in progress
  var runningBenchmarks = {};

  // todo remove console writer from release
  var writers = [console.log.bind(console), addToCache];

  l.error = log.bind(l, l.LEVELS.ERROR);
  l.info = log.bind(l, l.LEVELS.INFO);
  l.verbose = log.bind(l, l.LEVELS.VERBOSE);
  l.silly = log.bind(l, l.LEVELS.SILLY);

  /**
   * Writes message without any pre-processing
   * This is useful when writing pre-processed messages received from web worker
   * @param msg
   */
  l.rawWrite = function (msg) {
    for (var i = 0; i < writers.length; i++)
      writers[i](msg);
  };
  /**
   * Overrides console.log, console.error and console.warn.
   * Reroutes overridden calls to self.
   */
  l.captureConsole = function () {
    try {
      if (originalConsole) return;

      if (!root.console) root.console = {};

      originalConsole = {
        log: root.console.log,
        error: root.console.error,
        warn: root.console.warn
      };

      root.console.log = root.console.warn = function () {
        l.info(Array.prototype.join.call(arguments, ' '));
      };
      root.console.error = function () {
        l.error(Array.prototype.join.call(arguments, ' '));
      };
    } catch (e) {
      l.error(e);
    }
  };

  /**
   * Brings back console functions to the state they were before capturing
   */
  l.releaseConsole = function () {
    try {
      if (!originalConsole) return;
      root.console.log = originalConsole.log;
      root.console.error = originalConsole.error;
      root.console.warn = originalConsole.warn;
      originalConsole = null;
    } catch (e) {
      l.error(e);
    }
  };

  l.captureRootErrors = function () {
    try {
      if (onErrorIsCaptured) return;
      onErrorIsCaptured = true;
      originalOnError = root.onerror;
      root.onerror = l.error;
    } catch (e) {
      l.error(e);
    }
  };

  l.releaseRootErrors = function () {
    try {
      if (!onErrorIsCaptured) return;
      onErrorIsCaptured = false;
      root.onerror = originalOnError;
    } catch (e) {
      l.error(e);
    }
  };

  l.switchToWorkerMode = function (workerName) {
    l.captureConsole();
    l.captureRootErrors();
    l.workerName = workerName;
    l.cacheLimit = 0;
    writers = [postToUIThread];
  };

  /**
   * Updates L.js options with values provided in config object.
   * This function is supposed to be used when running in web worker,
   * so it ignores irrelevant options
   * @param options {{level: Number, benchmarkEnabled: Boolean, benchmarkTimeout: Number}}
   */
  l.setOptions = function (options) {
    if (options.level) l.level = options.level;
    if (options.benchmarkEnabled) l.level = options.benchmarkEnabled;
    if (options.benchmarkTimeout) l.level = options.benchmarkTimeout;
  };

  //-- Benchmarks ------------------------------------------------------------------------------------------------------

  l.B = {};

  l.B.start = function (name, msg, timeout) {
    try {
      if (!l.benchmarkEnabled) return;

      if (runningBenchmarks.hasOwnProperty(name)) {
        l.error('Duplicate benchmark name');
        return;
      }

      runningBenchmarks[name] = {
        ts: Date.now(),
        msg: msg,
        timeoutId: root.setTimeout(l.B.stop.bind(this, name, true), (timeout || l.benchmarkTimeout) * 1000)
      };
    } catch (e) {
      l.error(e);
      // yes, we are not interested in handling exception
    }
  };

  l.B.stop = function (name, timeout) {
    try {
      if (!runningBenchmarks.hasOwnProperty(name)) {
        l.error('Benchmark name {0} not found', name);
        return;
      }
      var b = runningBenchmarks[name];
      var time = Date.now() - b.ts;
      delete runningBenchmarks[name];
      l.info('{0}: {1} | {2} s.', name, timeout ? 'BENCHMARK TIMEOUT' : b.msg, time / 1000);
      root.clearTimeout(b.timeoutId);
    } catch (e) {
      l.error(e);
      // yes, we are not interested in handling exception
    }
  };

  //-- Private -------------------------------------------------------------------------------------------------------

  function log(level, msg) {
    try {

      if (level > l.level || writers.length === 0) return;
      if (typeof(msg) === 'function') msg = msg();

      msg = stringify(msg);

      var head =
        l.workerName
          ? interpolate('{0} {1}:{2} ', [getTimestamp(), levelNames[level], l.workerName])
          : interpolate('{0} {1}: ', [getTimestamp(), levelNames[level]]);

      var entry = head + interpolate(msg, getArguments(arguments));
      l.rawWrite(entry);

    } catch (e) {
      try {
        l.error(e);
      } catch (e) {
        // well.. we tried
      }
    }
  }

  // cache writer
  function addToCache(msg) {
    l.cache.unshift(msg);

    if (l.cache.length > l.cacheLimit)
      l.cache.length = l.cacheLimit;
  }

  // worker mode writer
  function postToUIThread(msg) {
    root.postMessage({ljsMessage: msg});
  }

  /**
   * Extracts meaningful arguments from arguments object
   * @param args
   */
  function getArguments(args) {
    if (args.length <= 2) return null;

    // splice on arguments prevents js optimisation, so we do it a bit longer way
    var arg = [];
    for (var i = 2; i < args.length; i++)
      arg.push(args[i]);

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
      function (a, b) {
        return stringify(args[b]);
      }
    );
  }

  // Opinionated any-value to string converter
  function stringify(val) {
    if (typeof(val) === 'string') return val;

    if (val instanceof Error)
      return val.message + ' ' + val.stack;

    if (val instanceof Date)
      return val.toISOString();

    return JSON.stringify(val);
  }

  function getTimestamp() {
    var d = new Date();
    return pad(d.getDate())
      + '.' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds())
      + '.' + pad2(d.getMilliseconds());
  }

  // performance over fanciness
  function pad(n) {
    var ret = n.toString();
    return ret.length === 2 ? ret : ('0' + ret);
  }

  // performance over fanciness
  function pad2(n) {
    var ret = n.toString();
    return ret.length === 3 ? ret : ( ret.length === 2 ? ('0' + ret) : ('00' + ret));
  }

}(this));