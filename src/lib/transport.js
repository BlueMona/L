const levels = require('./levels');

class Transport {
    get level() {
        return this.maxLevel;
    }

    set level(l) {
        this.maxLevel = l;
    }

    constructor(level) {
        this.level = level || levels.numeric.INFO;
    }

    conditionalWrite(message, level) {
        if (level > this.level) return;
        write();
    }

    write() {

    }
}

module.exports = Transport;