(function(exports) {
    const LEVELS = {
        any: -2,
        debug: -1,
        info: 0,
        warn: 1,
        error: 2,
        none: 3,
    }

    class LogInstance {
        constructor(opts={}) {
            this.timestampFormat = opts.timestampFormat || 'YYYYMMDD HH:mm:ss';
            this.level = opts.level || "info";
            this.lastDebug = undefined;
            this.lastInfo = undefined;
            this.lastWarn = undefined;
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

        warn(...args) {
            if (LEVELS[this.level] <= LEVELS.warn) {
                this.lastWarn = [this.timestamp(), 'WARN', ...args];
                console.log.apply(undefined, this.lastWarn);
            }
        }

        error(...args) {
            if (LEVELS[this.level] <= LEVELS.error) {
                this.lastError = [this.timestamp(), 'ERROR', ...args];
                console.error.apply(undefined, this.lastError);
            }
        }

        logInstance(inst, opts={}) {
            var that = this;
            let logLevel = opts.hasOwnProperty("logLevel")
                ? opts.logLevel 
                : 'info';
            let addName = opts.addName !== false;
            Object.defineProperty(inst, "logLevel", {
                enumerable: false,
                writable: true,
                value: logLevel,
            });
            Object.defineProperty(inst, 'logger', {
                value: that,
            });
            Object.defineProperty(inst, 'log', {
                value: (...args)=>{
                    let name = inst.name || inst.constructor.name;
                    let level = inst.logLevel;
                    args = args.slice();
                    addName && (args[0] = `${name}: ${args[0]}`);
                    that.info.apply(that, args);
                },
                /*
                value: (...args) => {
                    let name = inst.name || inst.constructor.name;
                    let level = inst.logLevel;
                    args = args.slice();
                    addName && (args[0] = `${name}: ${args[0]}`);
                    level && _logger[level] .apply(_logger, args);
                    return level;
                },
                */
            });
        }
    } 

    module.exports = exports.LogInstance = LogInstance;
})(typeof exports === "object" ? exports : (exports = {}));

