'use strict';var _createClass=function(){function defineProperties(target,props){for(var i=0;i<props.length;i++){var descriptor=props[i];descriptor.enumerable=descriptor.enumerable||false;descriptor.configurable=true;if("value"in descriptor)descriptor.writable=true;Object.defineProperty(target,descriptor.key,descriptor);}}return function(Constructor,protoProps,staticProps){if(protoProps)defineProperties(Constructor.prototype,protoProps);if(staticProps)defineProperties(Constructor,staticProps);return Constructor;};}();function _classCallCheck(instance,Constructor){if(!(instance instanceof Constructor)){throw new TypeError("Cannot call a class as a function");}}var levels=require('./levels');var Transport=function(){_createClass(Transport,[{key:'level',get:function get(){return this.maxLevel;},set:function set(l){this.maxLevel=l;}}]);function Transport(level){_classCallCheck(this,Transport);this.level=level||l.LEVELS.INFO;}_createClass(Transport,[{key:'conditionalWrite',value:function conditionalWrite(message,level){if(level>this.level)return;write();}},{key:'write',value:function write(){}}]);return Transport;}();module.exports=Transport;