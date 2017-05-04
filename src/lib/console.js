const Transport = require('./transport');
const levels = require('./levels');

class ConsoleTransport extends Transport {
    write (msg, level) {
        if (msg == null) msg = 'null';
        // if (originalConsole) {
        //     if (level === l.LEVELS.ERROR)
        //         originalConsole.error.call(root.console, msg);
        //     else
        //         originalConsole.log.call(root.console, msg);
        // } else {
            if (level === levels.numeric.ERROR)
                root.console.error(msg);
            else
                root.console.log(msg);
        // }
    }
}

// /**
//  * Overrides console.log, console.error and console.warn.
//  * Reroutes overridden calls to self.
//  */
// l.captureConsole = function () {
//     try {
//         if (originalConsole) return;

//         if (!global.console) global.console = {};

//         originalConsole = {
//             log: global.console.log,
//             error: global.console.error,
//             warn: global.console.warn
//         };

//         global.console.log = global.console.warn = function () {
//             for (var i = 0; i < arguments.length; i++)
//                 l.info(arguments[i]);
//         };
//         global.console.error = function () {
//             for (var i = 0; i < arguments.length; i++)
//                 l.error(arguments[i]);
//         };
//     } catch (e) {
//         l.error(e);
//     }
// };

// /**
//  * Brings back console functions to the state they were before capturing
//  */
// l.releaseConsole = function () {
//     try {
//         if (!originalConsole) return;
//         global.console.log = originalConsole.log;
//         global.console.error = originalConsole.error;
//         global.console.warn = originalConsole.warn;
//         originalConsole = null;
//     } catch (e) {
//         l.error(e);
//     }
// };

module.exports = ConsoleTransport;