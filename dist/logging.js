export var LoggingLevel;
(function (LoggingLevel) {
    LoggingLevel["None"] = "none";
    LoggingLevel["Error"] = "error";
    LoggingLevel["Info"] = "info";
    LoggingLevel["Verbose"] = "verbose";
    LoggingLevel["Debug"] = "debug";
})(LoggingLevel || (LoggingLevel = {}));
const nullLogFunc = () => {
    // pass
};
const baseLogFunc = (isError, prefix, ...msg) => {
    const messageParts = [prefix];
    for (const aMsgPart of msg) {
        if (aMsgPart === null || aMsgPart === undefined) {
            continue;
        }
        else if (Array.isArray(aMsgPart)) {
            for (const aMsg of aMsgPart) {
                messageParts.push(String(aMsg));
            }
        }
        else if (typeof aMsgPart === "string") {
            messageParts.push(aMsgPart);
        }
        else if (typeof aMsgPart === "number") {
            messageParts.push(String(aMsgPart));
        }
        else if (typeof aMsgPart === "object") {
            messageParts.push(JSON.stringify(aMsgPart));
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            messageParts.push(String(aMsgPart));
        }
    }
    const finalMessage = messageParts.join("");
    if (isError) {
        console.error(finalMessage);
    }
    else {
        console.log(finalMessage);
    }
};
const levelToIntMap = {
    [LoggingLevel.None]: 0,
    [LoggingLevel.Error]: 1,
    [LoggingLevel.Info]: 2,
    [LoggingLevel.Verbose]: 3,
    [LoggingLevel.Debug]: 4,
};
class BaseLogger {
    #prefix;
    constructor(prefix) {
        if (prefix) {
            this.#prefix = prefix;
        }
    }
    prefixedLogger(prefix) {
        return new this.constructor(prefix);
    }
    willLogFor(level) {
        const thisLoggingLevelNum = levelToIntMap[this.level];
        const thatLoggingLevelNum = levelToIntMap[level];
        return thatLoggingLevelNum <= thisLoggingLevelNum;
    }
    error(...msg) {
        baseLogFunc(true, "ERROR:", this.#prefix, ...msg);
    }
    info(...msg) {
        baseLogFunc(false, "INFO:", this.#prefix, ...msg);
    }
    verbose(...msg) {
        baseLogFunc(false, "VERBOSE:", this.#prefix, ...msg);
    }
    debug(...msg) {
        baseLogFunc(false, "DEBUG:", this.#prefix, ...msg);
    }
}
class NullLogger extends BaseLogger {
    level = LoggingLevel.None;
    info = nullLogFunc;
    verbose = nullLogFunc;
    error = nullLogFunc;
    debug = nullLogFunc;
}
class ErrorLogger extends BaseLogger {
    level = LoggingLevel.Error;
    info = nullLogFunc;
    verbose = nullLogFunc;
    debug = nullLogFunc;
}
class InfoLogger extends BaseLogger {
    level = LoggingLevel.Info;
    verbose = nullLogFunc;
    debug = nullLogFunc;
}
class VerboseLogger extends BaseLogger {
    level = LoggingLevel.Verbose;
    debug = nullLogFunc;
}
class DebugLogger extends BaseLogger {
    level = LoggingLevel.Debug;
}
const logLevelToLoggerMap = {
    [LoggingLevel.None]: new NullLogger(),
    [LoggingLevel.Error]: new ErrorLogger(),
    [LoggingLevel.Info]: new InfoLogger(),
    [LoggingLevel.Verbose]: new VerboseLogger(),
    [LoggingLevel.Debug]: new DebugLogger(),
};
export const getLogger = (level) => {
    return logLevelToLoggerMap[level];
};
//# sourceMappingURL=logging.js.map