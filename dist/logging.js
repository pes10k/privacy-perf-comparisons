export var LoggingLevel;
(function (LoggingLevel) {
    LoggingLevel["None"] = "none";
    LoggingLevel["Error"] = "error";
    LoggingLevel["Info"] = "info";
    LoggingLevel["Verbose"] = "verbose";
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
class BaseLogger {
    #prefix;
    constructor(prefix) {
        if (prefix) {
            this.#prefix = prefix;
        }
    }
    #getPrefix() {
        return this.#prefix;
    }
    prefixedLogger(prefix) {
        return new this.constructor(prefix);
    }
    willLogFor(level) {
        switch (level) {
            case LoggingLevel.None:
                return false;
            case LoggingLevel.Error:
                return this.level === LoggingLevel.Error;
            case LoggingLevel.Info:
                return (this.level === LoggingLevel.Error || this.level === LoggingLevel.Info);
            case LoggingLevel.Verbose:
                return true;
        }
    }
    info = baseLogFunc.bind(undefined, false, "INFO:", this.#getPrefix());
    verbose = baseLogFunc.bind(undefined, false, "VERBOSE:", this.#getPrefix());
    error = baseLogFunc.bind(undefined, true, "ERROR:", this.#getPrefix());
}
class NullLogger extends BaseLogger {
    level = LoggingLevel.None;
    info = nullLogFunc;
    verbose = nullLogFunc;
    error = nullLogFunc;
}
class ErrorLogger extends BaseLogger {
    level = LoggingLevel.Error;
    info = nullLogFunc;
    verbose = nullLogFunc;
}
class InfoLogger extends BaseLogger {
    level = LoggingLevel.Info;
    verbose = nullLogFunc;
}
class VerboseLogger extends BaseLogger {
    level = LoggingLevel.Verbose;
}
const logLevelToLoggerMap = {
    [LoggingLevel.Error]: new ErrorLogger(),
    [LoggingLevel.None]: new NullLogger(),
    [LoggingLevel.Info]: new InfoLogger(),
    [LoggingLevel.Verbose]: new VerboseLogger(),
};
export const getLogger = (level) => {
    return logLevelToLoggerMap[level];
};
//# sourceMappingURL=logging.js.map