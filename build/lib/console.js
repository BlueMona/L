'use strict';var _createClass=function(){function defineProperties(target,props){for(var i=0;i<props.length;i++){var descriptor=props[i];descriptor.enumerable=descriptor.enumerable||false;descriptor.configurable=true;if("value"in descriptor)descriptor.writable=true;Object.defineProperty(target,descriptor.key,descriptor);}}return function(Constructor,protoProps,staticProps){if(protoProps)defineProperties(Constructor.prototype,protoProps);if(staticProps)defineProperties(Constructor,staticProps);return Constructor;};}();function _classCallCheck(instance,Constructor){if(!(instance instanceof Constructor)){throw new TypeError("Cannot call a class as a function");}}function _possibleConstructorReturn(self,call){if(!self){throw new ReferenceError("this hasn't been initialised - super() hasn't been called");}return call&&(typeof call==="object"||typeof call==="function")?call:self;}function _inherits(subClass,superClass){if(typeof superClass!=="function"&&superClass!==null){throw new TypeError("Super expression must either be null or a function, not "+typeof superClass);}subClass.prototype=Object.create(superClass&&superClass.prototype,{constructor:{value:subClass,enumerable:false,writable:true,configurable:true}});if(superClass)Object.setPrototypeOf?Object.setPrototypeOf(subClass,superClass):subClass.__proto__=superClass;}var Transport=require('./transport');var ConsoleTransport=function(_Transport){_inherits(ConsoleTransport,_Transport);function ConsoleTransport(){_classCallCheck(this,ConsoleTransport);return _possibleConstructorReturn(this,(ConsoleTransport.__proto__||Object.getPrototypeOf(ConsoleTransport)).apply(this,arguments));}_createClass(ConsoleTransport,[{key:'write',value:function write(msg,level){if(msg==null)msg='null';if(originalConsole){if(level===l.LEVELS.ERROR)originalConsole.error.call(root.console,msg);else originalConsole.log.call(root.console,msg);}else{if(level===l.LEVELS.ERROR)root.console.error(msg);else root.console.log(msg);}}}]);return ConsoleTransport;}(Transport);// /**
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
module.exports=ConsoleTransport;