const levels = require('./levels');

class Transport {
    get level() {
        return this.maxLevel;
    }

    set level(l) {
        if (!Number.isInteger(l)) throw new Error('level must be an integer');
        this.maxLevel = l;
    }

    clearLevel() {
        this.maxLevel = undefined;
    }

    constructor(level) {
        if (level) this.level = level;
    }

    conditionalWrite(message, level, generalMaxLevel) {
        console.log(`my level is ${this.level} and general level is ${generalMaxLevel}`)
        if (level > (this.level === undefined ? generalMaxLevel : this.level)) return;
        this.write(message);
    }

    write() {}
}

module.exports = Transport;
