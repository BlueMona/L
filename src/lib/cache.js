const Transport = require('./transport');

class CacheTransport extends Transport {
    cache = [];
    cacheLimit = 1000; // amount of log entries to keep in FIFO L.cache queue. Set to 0 to disable.

    write(msg, level) {
        this.cache.unshift(msg);

        if (this.cache.length > this.cacheLimit)
            this.cache.length = this.cacheLimit;
    }
}

module.exports = CacheTransport;