(function(exports) {
    const LEVELS = {
        any: -2,
        debug: -1,
        info: 0,
        error: 1,
        none: 2,
    }

    class LogInstance {
        constructor(opts={}) {
            this.timestampFormat = opts.timestampFormat || 'YYYYMMDD HH:mm:ss';
            this.level = opts.level || "info";
            this.lastDebug = undefined;
            this.lastInfo = undefined;
            this.lastError = undefined;
        }

        timestamp() {
            var now = new Date();
            return this.timestampFormat
                .replace(/YYYY/g, now.getFullYear())
                .replace(/MM/g, `0${now.getMonth()+1}`.slice(-2))
                .replace(/DD/g, `0${now.getDate()}`.slice(-2))
                .replace(/HH/g, `0${now.getHours()}`.slice(-2))
                .replace(/mm/g, `0${now.getMinutes()}`.slice(-2))
                .replace(/ss/g, `0${now.getSeconds()}`.slice(-2))
                ;
        }

        debug(...args) {
            if (LEVELS[this.level] <= LEVELS.debug) {
                this.lastDebug = [this.timestamp(), 'D', ...args];
                console.debug.apply(undefined, this.lastDebug);
            }
        }

        info(...args) {
            if (LEVELS[this.level] <= LEVELS.info) {
                this.lastInfo = [this.timestamp(), 'I', ...args];
                console.log.apply(undefined, this.lastInfo);
            }
        }

        error(...args) {
            if (LEVELS[this.level] <= LEVELS.error) {
                this.lastError = [this.timestamp(), 'ERROR', ...args];
                console.error.apply(undefined, this.lastError);
            }
        }

        logInstance(obj) {
            var that = this;
            Object.defineProperty(obj, 'logger', {
                value: that,
            });
            Object.defineProperty(obj, 'log', {
                value: function(...args) {
                    that.info.apply(that, args);
                }
            });
        }
    } 

    module.exports = exports.LogInstance = LogInstance;
})(typeof exports === "object" ? exports : (exports = {}));

