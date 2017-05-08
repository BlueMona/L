const L = require('../src/L');
const sinon = require('sinon');

describe('benchmarks', () => {

    beforeEach(() => {
        L.writers.cache.cacheLimit = 10;
        L.writers.cache.cache = [];
    });

    it('success with default timeout', () => {
        L.benchmarkTimeout = 3;
        L.B.start('default timeout success', 'benchmark');
        L.B.stop('default timeout success');
        L.writers.cache.cache.length.should.equal(1);
        expectBenchmarkSuccess();
    });

    it('success with specific timeout', (done) => {
        L.benchmarkTimeout = 0.1;
        L.B.start('specific timeout success', 'benchmark', 10);
        setTimeout(() =>  {
            L.B.stop('specific timeout success');
            expectBenchmarkSuccess();
            done();
        }, 150);
    });

    it('fail with default timeout', (done) => {
        L.benchmarkTimeout = 0.1;
        L.B.start('default timeout fail', 'benchmark');
        setTimeout(() =>  {
            expectBenchmarkTimeout();
            done();
        }, 100);
    });

    it('fail with specific timeout', (done) => {
        L.benchmarkTimeout = 10;
        L.B.start('specific timeout fail', 'benchmark', 0.1);
        setTimeout(() => {
            expectBenchmarkTimeout();
            done();
        }, 150);
    });

    const timeoutMsg = 'BENCHMARK TIMEOUT';

    function expectBenchmarkSuccess() {
        const res = L.writers.cache.cache[0].indexOf(timeoutMsg) < 0;
        res.should.equal(true);
    }

    function expectBenchmarkTimeout() {
        const res = L.writers.cache.cache[0].indexOf(timeoutMsg) > 0;
        res.should.equal(true);
    }

});
