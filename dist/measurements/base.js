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
        logFunc.call(this.logger, "MEASURER:", this.type.toUpperCase(), ": ", ...msg);
    }
    // Method thats called on all base classes after the browser is setup
    // and prepared an its initial state, meaning its its loaded, and (unless
    // --preserve-page has been specified) all tabs and pages have been closed.
    // Child classes can implement this if there is some behavior they need
    // to do *before* we start loading the target URL for the page measurement.
    async beforeStart() {
        // pass
    }
    // Method thats called on all base classes indicating that we've started
    // loading the target page. Everything that happens between this method
    // being called, and the "close" method being called is happening
    // while the target webpage is being loaded and executed.
    start() {
        // pass
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
            this.logError("Tried to close measurement, but it was already closed at ", this.closedAt.toISOString());
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