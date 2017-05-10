const L = require('../src/L');
const sinon = require('sinon');

describe('L', () => {
    it('has levels', () => {
        L.LEVELS.should.be.an('Object');
    });

    it('has default writers', () => {
        L.writers.cache.should.be.an('Object');
        L.writers.console.should.be.an('Object');
    });

    // assumes levels have values according to index 0-3,
    const levels = [
        { level: L.LEVELS.ERROR, fn: 'error', abbr: 'ERR: ' },
        { level: L.LEVELS.INFO, fn: 'info', abbr: 'INF: ' },
        { level: L.LEVELS.VERBOSE, fn: 'verbose', abbr: 'VER: ' },
        { level: L.LEVELS.SILLY, fn: 'silly', abbr: 'SIL: ' }
    ];

    // checks if last log message is the one that is expected,
    // while taking output format into account.
    function checkLastMessage(message, level) {
        const logEntry = L.writers.cache.cache[0].substr(-message.length - 5);
        logEntry.should.equal(levels[level].abbr + message);
    }

    it('caches log for each level', () => {
        L.level = L.LEVELS.SILLY;
        L.writers.cache.cacheLimit = 10;

        levels.forEach((level) => {
            const msg = `test ${level.fn}`;
            // logging a message
            L[level.fn](msg);
            console.log('cache', L.writers.cache.cache);
            checkLastMessage(msg, level.level);
        });
    });

    it('ignores logs with severity above L.level', () => {
        const consoleWriteSpy = sinon.spy(L.writers.console, 'write');

        L.level = L.LEVELS.SILLY;
        L.writers.cache.cacheLimit = 10;
        L.writers.cache.resetCache();

        // expectation matrix
        const matrix = {
            error: [true, true, true, true],   // L.error always outputs
            info: [false, true, true, true],  // L.info is expected to output on info level and above
            verbose: [false, false, true, true], // L.verbose
            silly: [false, false, false, true] // L.silly
        };

        for (let fnInd = 0; fnInd < levels.length; fnInd++) {
            for (let lvl = 0; lvl < levels.length; lvl++) {
                consoleWriteSpy.reset();
                L.writers.cache.resetCache();
                L.level = lvl;
                const fn = levels[fnInd].fn;
                L[fn]('blah');
                // cache should contain 1 or 0 entries according to matrix
                L.writers.cache.cache.length.should.equal(matrix[fn][lvl] ? 1 : 0);
                // console write method should have been called
                consoleWriteSpy.callCount.should.equal(matrix[fn][lvl] ? 1 : 0);
            }
        }
        consoleWriteSpy.restore();
    });

    it('overrides severity for specific transport', () => {
        const consoleWriteSpy = sinon.spy(L.writers.console, 'write');

        L.writers.cache.cacheLimit = 10;
        L.writers.cache.resetCache();

        // same as above
        L.level = L.LEVELS.SILLY;
        const cacheMatrix = {
            error: [true, true, true, true],   // L.error always outputs
            info: [false, true, true, true],  // L.info is expected to output on info level and above
            verbose: [false, false, true, true], // L.verbose
            silly: [false, false, false, true] // L.silly
        };
        // override for console
        L.writers.console.level = L.LEVELS.INFO;
        const consoleMatrix = {
            error: [true, true, true, true],
            info: [true, true, true, true],
            verbose: [false, false, false, false],
            silly: [false, false, false, false]
        };

        for (let fnInd = 0; fnInd < levels.length; fnInd++) {
            for (let lvl = 0; lvl < levels.length; lvl++) {
                consoleWriteSpy.reset();
                L.writers.cache.resetCache();
                L.level = lvl;
                const fn = levels[fnInd].fn;
                L[fn]('blah');
                // cache should contain 1 or 0 entries according to matrix
                L.writers.cache.cache.length.should.equal(cacheMatrix[fn][lvl] ? 1 : 0);
                // console is called according to console expectations
                consoleWriteSpy.callCount.should.equal(consoleMatrix[fn][lvl] ? 1 : 0);
            }
        }
        consoleWriteSpy.restore();
    });

    it('properly rolls the cache over', () => {
        L.writers.cache.cacheLimit = 3;
        L.writers.cache.cache = [];

        for (let i = 1; i < L.writers.cache.cacheLimit * 3; i++) {
            L.error(i);
            L.writers.cache.cache.length.should.equal(Math.min(L.writers.cache.cacheLimit, i));
            checkLastMessage(i.toString(), L.LEVELS.ERROR);
        }
    });

    it('captures and releases console', () => {
        L.level = L.LEVELS.SILLY;
        L.writers.cache.cacheLimit = 10;
        L.writers.cache.cache = [];

        L.captureConsole();
        const msg = 'hola, hola. soy la consola.';
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

        L.writers.cache.cache.length.should.equal(3);
    });

    it('interpolates strings', () => {
        L.writers.cache.cacheLimit = 10;
        L.writers.cache.cache = [];

        const cases = [
            { args: ['{0}', 111], expected: '111' },
            { args: ['{0}{1}{2}', 1, 1, 1], expected: '111' },
            { args: ['interpolate {0} the {1}', 'all', 'things'], expected: 'interpolate all the things' },
            { args: ['{2}{2}{0}{1}', 1, 2, 3], expected: '3312' }
        ];

        cases.forEach((c) => {
            console.log('what');
            L.error(...c.args);
            checkLastMessage(c.expected, L.LEVELS.ERROR);
        });
    });
});
