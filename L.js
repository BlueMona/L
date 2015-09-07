/**
 *  L.js
 *  ---------------------
 *  Unobtrusive yet powerful debug logging library originally made for Peerio apps (http://peerio.com).
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


(function (self) {
  'use strict';

  /**
   *  LOG
   *  Use this for regular log messages.
   *  This function supports interpolation: `L("abc{0}{1}{2}",'d','f','g') => "abcdefg"`
   *  @param {string | function} msg - string or function returning string
   */
  self.L = function (msg) {
    console.log(interpolate(msg, getArguments(arguments)));
  };

  /**
   *  TRACE
   *  Use this for high frequency log messages.
   *  Set `T.enabled = false` to disable output when it affects performance or clutters output.
   *  This function supports interpolation: `T("abc{0}{1}{2}",'d','f','g') => "abcdefg"`
   *  @param {string | function} msg - string or function returning string
   */
  self.T = function (msg) {
    if (!T.enabled) return;
    console.log(interpolate(msg, getArguments(arguments)));
  };

  /**
   * Enables and disables trace messages
   * @type {boolean}
   */
  self.T.enabled = true;

  var runningBenchmarks = {};
  self.B = {};
  self.B.start = function (id, msg) {
    if (runningBenchmarks.hasOwnProperty(id)) throw 'Duplicate benchmark id';

    runningBenchmarks[id] = {
      ts: Date.now(),
      msg: msg
    };
  };

  self.B.stop = function (id) {
    if (!runningBenchmarks.hasOwnProperty(id)) throw 'Benchmark id not found';
    var b = runningBenchmarks[id];
    self.L('{0} | {1} ms.', b.msg, Date.now() - b.ts);
  };

  /**
   * Extracts meaningful arguments from arguments object
   * @param args
   */
  function getArguments(args) {
    if (args.length <= 1) return null;

    // splice on arguments prevents js optimisation, so we do it a bit longer way
    var arg = [];
    for (var i = 1; i < args.length; i++)
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
    if (typeof str === 'function')
      str = str();
    if (!args || !args.length) return str;
    return str.replace(/{([^{}]*)}/g,
      function (a, b) {
        return args[b];
      }
    );
  }

}(this));