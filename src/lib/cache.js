const Transport = require('./transport');

class CacheTransport extends Transport {

    constructor(level) {
        super(level);
        this.cache = [];
        this.cacheLimit = 1000; // amount of log entries to keep in FIFO L.cache queue. Set to 0 to disable.
    }

    write(msg, level) {
        this.cache.unshift(msg);

        if (this.cache.length > this.cacheLimit) {
            this.cache.length = this.cacheLimit;
        }
    }

    resetCache() {
        this.cache = [];
    }

    print() {
        return this.cache.join('\n');
    }
}

module.exports = CacheTransport;
