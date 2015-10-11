describe('L.js', function () {

  // assumes levels have values according to index 0-3,
  var levels = [
    {level: L.LEVELS.ERROR, fn: 'error', abbr: 'ERR: '},
    {level: L.LEVELS.INFO, fn: 'info', abbr: 'INF: '},
    {level: L.LEVELS.VERBOSE, fn: 'verbose', abbr: 'VER: '},
    {level: L.LEVELS.SILLY, fn: 'silly', abbr: 'SIL: '}
  ];

  // checks if last log message is the one that is expected,
  // while taking output format into account.
  function checkLastMessage(message, level) {
    var logEntry = L.cache[0].substr(-message.length - 5)
    expect(logEntry).toBe(levels[level].abbr + message);
  }

  beforeEach(function () {
    L.cache = [];
  });

  it('caches log for each level', function () {
    L.level = L.LEVELS.SILLY;
    L.cacheLimit = 10;

    levels.forEach(function (level) {
      var msg = 'test ' + level.fn;
      // logging a message
      L[level.fn](msg);
      checkLastMessage(msg, level.level);
    });
  });

  it('ignores logs with severity above L.level', function () {
    L.cacheLimit = 10;
    L.cache = [];
    // expectation matrix
    var matrix = {
      error: [true, true, true, true],   // L.error always outputs
      info: [false, true, true, true],  // L.info is expected to output on info level and above
      verbose: [false, false, true, true], // L.verbose
      silly: [false, false, false, true] // L.silly
    };

    for (var fnInd = 0; fnInd < levels.length; fnInd++) {
      for (var lvl = 0; lvl < levels.length; lvl++) {
        L.cache = [];
        L.level = lvl;
        var fn = levels[fnInd].fn;
        L[fn]('blah');
        // cache should contain 1 or 0 entries according to matrix
        expect(L.cache.length).toBe(matrix[fn][lvl] ? 1 : 0);
      }
    }
  });

  it('properly rolls the cache over', function () {
    L.cacheLimit = 3;
    L.cache = [];

    for (var i = 1; i < L.cacheLimit * 3; i++) {
      L.error(i);
      expect(L.cache.length).toBe(Math.min(L.cacheLimit, i))
      checkLastMessage(i.toString(), L.LEVELS.ERROR);
    }
  });

  it('captures and releases console', function () {
    L.level = L.LEVELS.SILLY;
    L.cacheLimit = 10;
    L.cache = [];

    L.captureConsole();

    var msg = 'hola, hola. soy la consola.';
    console.log(msg);
    checkLastMessage(msg, L.LEVELS.INFO);
    console.error(msg);
    checkLastMessage(msg, L.LEVELS.ERROR);
    console.warn(msg);
    checkLastMessage(msg, L.LEVELS.INFO);

    L.releaseConsole();

    console.log(msg);
    console.error(msg);
    console.warn(msg);

    expect(L.cache.length).toBe(3);
  });

  it('interpolates strings', function () {
    L.cacheLimit = 10;
    L.cache = [];
    var cases = [
      {args: ['{0}', 111], expected: '111'},
      {args: ['{0}{1}{2}', 1, 1, 1], expected: '111'},
      {args: ['interpolate {0} the {1}', 'all', 'things'], expected: 'interpolate all the things'},
      {args: ['{2}{2}{0}{1}', 1, 2, 3], expected: '3312'}
    ];

    cases.forEach(function (c) {
      L.error.apply(L, c.args);
      checkLastMessage(c.expected, L.LEVELS.ERROR);
    });
  });

  describe('benchmarks', function () {

    beforeEach(function () {
      L.cacheLimit = 10;
      L.cache = [];
    });

    it('success with default timeout', function () {
      L.benchmarkTimeout = 3;
      L.B.start('default timeout success', 'benchmark');
      L.B.stop('default timeout success');
      expect(L.cache.length).toBe(1);
      expectBenchmarkSuccess();
    });

    it('success with specific timeout', function (done) {
      L.benchmarkTimeout = .1;
      L.B.start('specific timeout success', 'benchmark', 10);
      setTimeout(function () {
        L.B.stop('specific timeout success');
        expectBenchmarkSuccess();
        done();
      }, 150);
    });

    it('fail with default timeout', function (done) {
      L.benchmarkTimeout = .1;
      L.B.start('default timeout fail', 'benchmark');
      setTimeout(function () {
        expectBenchmarkTimeout();
        done();
      }, 100);
    });

    it('fail with specific timeout', function (done) {
      L.benchmarkTimeout = 10;
      L.B.start('specific timeout fail', 'benchmark', .1);
      setTimeout(function () {
        expectBenchmarkTimeout();
        done();
      }, 150);
    });

    var timeoutMsg = 'BENCHMARK TIMEOUT';

    function expectBenchmarkSuccess() {
      var res = L.cache[0].indexOf(timeoutMsg) < 0;
      expect(res).toBe(true);
 }

    function expectBenchmarkTimeout() {
      var res = L.cache[0].indexOf(timeoutMsg) > 0;
      expect(res).toBe(true);
    }

  });

});