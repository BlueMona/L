'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var Transport = require('./transport');
var levels = require('./levels');

var ConsoleTransport = function (_Transport) {
    _inherits(ConsoleTransport, _Transport);

    function ConsoleTransport() {
        var _ref;

        var _temp, _this, _ret;

        _classCallCheck(this, ConsoleTransport);

        for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
            args[_key] = arguments[_key];
        }

        return _ret = (_temp = (_this = _possibleConstructorReturn(this, (_ref = ConsoleTransport.__proto__ || Object.getPrototypeOf(ConsoleTransport)).call.apply(_ref, [this].concat(args))), _this), _this.originalConsole = null, _temp), _possibleConstructorReturn(_this, _ret);
    }

    _createClass(ConsoleTransport, [{
        key: 'write',
        value: function write(msg, level) {
            if (msg == null) msg = 'null';
            if (this.originalConsole) {
                if (level === levels.numeric.ERROR) {
                    this.originalConsole.error.call(global.console, msg);
                } else {
                    this.originalConsole.log.call(global.console, msg);
                }
            } else if (level === levels.numeric.ERROR) {
                global.console.error(msg);
            } else {
                global.console.log(msg);
            }
        }
    }]);

    return ConsoleTransport;
}(Transport);

module.exports = ConsoleTransport;