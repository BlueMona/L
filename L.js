/**
 *  L.js
 *  ---------------------
 *  Opinionated, unobtrusive yet powerful logging library originally made for Peerio apps (http://peerio.com).
 *
 *  Features:
 *  - string interpolation: log message can contain repeatable placeholders `{0}{1}{2}{1}`
 *  - 2 logging modes
 *    - Regular logging
 *    - High frequency/heavy log mode that can be enabled or disabled
 *  - Benchmarking
 *  - Logging code and calls can be completely wiped out in production builds with regex replace.
 *
 *  Anri Asaturov | 2015
 */


(function (root) {
  'use strict';
  var l = root.L = {};

  // time function to use for benchmarks
  var time = root.performance || root.Date;
  // log message levels
  l.LEVELS = {ERROR: 0, INFO: 1, VERBOSE: 2, SILLY: 3};
  var levelNames = ['ERR', 'INF', 'VER', 'SIL'];
  // by default benchmarks timeout after this number of seconds
  l.benchmarkTimeout = 120;
  // current log level
  l.level = l.LEVELS.VERBOSE;
  // amount of log entries to keep in FIFO L.cache queue. Set to 0 to disable.
  l.cacheLimit = 1000;
  l.cache = [];

  // todo remove console writer from release
  var writers = [console.log.bind(console), addToCache];

  function log(level, msg) {
    if (level > l.level || writers.length === 0) return;
    var entry = interpolate('{0} {1}: ', [(new Date()).toJSON(), levelNames[level]]) + interpolate(msg, getArguments(arguments));
    for (var i = 0; i < writers.length; i++)
      writers[i](entry);
  }

  l.error = function () {};
  //-- Benchmarks ------------------------------------------------------------------------------------------------------
  // benchmarks in progress
  var runningBenchmarks = {};

  l.B = {};
  l.B.enabled = true;

  l.B.start = function (name, msg, timeout) {
    if (!l.B.enabled) return;
    if (runningBenchmarks.hasOwnProperty(name)) throw 'Duplicate benchmark name';

    runningBenchmarks[name] = {
      ts: time.now(),
      msg: msg,
      timeoutId: root.setTimeout(l.B.stop.bind(this, name, true), (timeout || l.benchmarkTimeout) * 1000)
    };
  };

  l.B.stop = function (name, timeout) {
    if (!runningBenchmarks.hasOwnProperty(name)) return;
    var b = runningBenchmarks[name];
    delete runningBenchmarks[name];
    l.info('{0}: {1} | {2} ms.', name, timeout ? 'BENCHMARK TIMEOUT' : b.msg, time.now() - b.ts);
    root.clearTimeout(b.timeoutId);
  };

  //-- Utilities -------------------------------------------------------------------------------------------------------
  function addToCache(msg) {
    if (l.cache.length >= l.cacheLimit)
      l.cache.splice(0, 1, msg);
    else
      l.cache.push(msg);
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
   *  @param {string | function} str - template string with placeholders in format {0} {1} {2}
   *                                   where number is argument array index.
   *                                   Numbers also can be replaced with property names or argument object.
   *  @param {Array | Object} args - argument array or object
   *  @returns {string} interpolated string
   */
  function interpolate(str, args) {
    if (typeof str === 'function') str = str();

    if (!args || !args.length) return str;

    return str.replace(/{([^{}]*)}/g,
      function (a, b) {
        return args[b];
      }
    );
  }

}(this));