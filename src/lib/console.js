const Transport = require('./transport');
const levels = require('./levels');

class ConsoleTransport extends Transport {

     constructor(level) {
        super(level);
        this.originalConsole = null;
     }

    write(msg, level) {
        if (msg == null) msg = 'null';
        if (this.originalConsole) {
            if (level === levels.numeric.ERROR) { this.originalConsole.error.call(global.console, msg); } else { this.originalConsole.log.call(global.console, msg); }
        } else if (level === levels.numeric.ERROR) { global.console.error(msg); } else { global.console.log(msg); }
    }
}

module.exports = ConsoleTransport;
