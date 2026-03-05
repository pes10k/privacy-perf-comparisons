export class BaseMeasurer {
    logger;
    url;
    context;
    isContextClosed = false;
    instrumentedAt;
    closedAt;
    constructor(logger, url, context) {
        this.logger = logger;
        this.url = url;
        this.context = context;
    }
    logInfo(...msg) {
        this.#log(this.logger.info, ...msg);
    }
    logVerbose(...msg) {
        this.#log(this.logger.verbose, ...msg);
    }
    logError(...msg) {
        this.#log(this.logger.error, ...msg);
    }
    #log(logFunc, ...msg) {
        logFunc.call(this.logger, "MEASURER:", this.measurementType().toUpperCase(), ": ", ...msg);
    }
    instrumentContext() {
        this.context.on("close", () => {
            this.isContextClosed = true;
        });
        if (this.instrumentedAt) {
            throw new Error("Trying to instrument a measurer instance after it " +
                `was instrumented at "${this.instrumentedAt.toISOString()}"`);
        }
        this.instrumentedAt = new Date();
    }
    close() {
        if (this.closedAt) {
            this.logError("Tried to close measurement, but it was already " + "closed at ", this.closedAt.toISOString());
            return false;
        }
        this.closeIfOpen();
        return true;
    }
    closeIfOpen() {
        if (this.closedAt) {
            return false;
        }
        this.closedAt = new Date();
        this.logVerbose("Ending measurement at ", this.closedAt.toISOString());
        return true;
    }
}
//# sourceMappingURL=base.js.map