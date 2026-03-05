import assert from "node:assert/strict";
import { BaseMeasurer } from "./base.js";
import { LoggingLevel } from "../logging.js";
import { MeasurementType } from "../types.js";
const approxLengthOfHeaders = (headers) => {
    // Silly fudge factor, adding 4 bytes for each header; two bytes
    // to account for the ": " in each header row like "<key>: <value>",
    // and two bytes for the "\r\n" after each header.
    const headersFormattingSize = headers.length * 4;
    // And then use the Blob class to get the memory size for each string
    // in the headers array. Note that we can't just use String.prototype.length
    // because this won't account for stuff like different unicode characters
    // using different numbers of bytes (e.g., consider a smile-y emoji with a
    // skin tone "accent", vs the single byte needed for a string like "1").
    //
    // Also, bummer that typescript isn't clever enough to realize the below two
    // lines are the same type-wise as headers.map(Object.values).flat(),
    // but, oh well.
    const headersStrings = headers.map((x) => Object.values(x)).flat();
    const headersStringSize = new Blob(headersStrings).size;
    return headersFormattingSize + headersStringSize;
};
const logSize = (logger, url, desc, method, bodySize, headerSize) => {
    if (!logger.willLogFor(LoggingLevel.Verbose)) {
        return;
    }
    const totalSize = bodySize + headerSize;
    const msg = [
        `method=${method}`,
        `size=${totalSize.toString()}`,
        `(body=${bodySize.toString()}, headers=${headerSize.toString()})`,
        `url=${url}`,
    ].join(", ");
    logger.verbose(desc, ": ", msg);
};
const logSizeError = (logger, url, desc, method, error) => {
    if (!logger.willLogFor(LoggingLevel.Error)) {
        return;
    }
    const errMsg = error instanceof Error ? error.toString() : String(error);
    const msg = `method=${method}, error=${errMsg}, url=${url}`;
    logger.error(desc, ": ", msg);
};
const getRequestSize = async (logger, request) => {
    const url = request.url();
    const vLog = logSize.bind(undefined, logger, url, "getRequestSize");
    const eLog = logSizeError.bind(undefined, logger, url, "getRequestSize");
    try {
        const sizes = await request.sizes();
        const bodySize = sizes.requestBodySize;
        const headerSize = sizes.requestHeadersSize;
        const totalSize = bodySize + headerSize;
        vLog("Request.sizes()", bodySize, headerSize);
        return totalSize;
    }
    catch (err) {
        eLog("Request.sizes()", err);
    }
    try {
        const bodySize = request.postDataBuffer()?.length ?? 0;
        const headerSize = approxLengthOfHeaders(await request.headersArray());
        const totalSize = bodySize + headerSize;
        vLog("Request.postDataBuffer().length", bodySize, headerSize);
        return totalSize;
    }
    catch (err) {
        eLog("Request.postDataBuffer().length", err);
    }
    return null;
};
const getResponseSize = async (logger, response) => {
    const url = response.url();
    const vLog = logSize.bind(undefined, logger, url, "getResponseSize");
    const eLog = logSizeError.bind(undefined, logger, url, "getResponseSize");
    try {
        const request = response.request();
        const sizes = await request.sizes();
        const bodySize = sizes.responseBodySize;
        const headerSize = sizes.responseHeadersSize;
        const totalSize = bodySize + headerSize;
        vLog("Request.sizes()", bodySize, headerSize);
        return totalSize;
    }
    catch (err) {
        eLog("Request.sizes()", err);
    }
    try {
        const bodySize = (await response.body()).length;
        const headerSize = approxLengthOfHeaders(await response.headersArray());
        const totalSize = bodySize + headerSize;
        vLog("response.body().length", bodySize, headerSize);
        return totalSize;
    }
    catch (err) {
        eLog("response.body().length", err);
    }
    return null;
};
class PageNetworkLogger {
    #owner;
    #requests = [];
    #responses = [];
    #pageURL;
    #logger;
    #startTime;
    constructor(owner, logger, pageURL) {
        this.#owner = owner;
        this.#pageURL = pageURL;
        this.#logger = logger;
        this.#startTime = Date.now();
    }
    toJSON() {
        return {
            meta: {
                startTime: this.#startTime,
                url: this.#pageURL,
            },
            requests: this.#requests,
            responses: this.#responses,
        };
    }
    isClosed() {
        return this.#owner.isClosed();
    }
    logErrorIfClosed(msg, url) {
        if (this.isClosed()) {
            this.#logger.error(`tried to record "${msg}" but measurements are ` +
                `closed. url=$"${url}"`);
            return true;
        }
        return false;
    }
    addWebSocketRequest(url, data) {
        if (this.logErrorIfClosed("ws request", url)) {
            return null;
        }
        const datapoint = {
            size: data.length,
            time: Date.now(),
            type: "websocket",
            url: url,
        };
        this.#requests.push(datapoint);
        this.#logger.verbose("Network (Sent): ", datapoint);
        return datapoint;
    }
    addWebSocketResponse(url, data) {
        if (this.logErrorIfClosed("ws response", url)) {
            return null;
        }
        const datapoint = {
            size: data.length,
            time: Date.now(),
            type: "websocket",
            url: url,
        };
        this.#responses.push(datapoint);
        this.#logger.verbose("Network (Received): ", datapoint);
        return datapoint;
    }
    async addRequest(request) {
        if (this.logErrorIfClosed("request", request.url())) {
            return null;
        }
        const datapoint = {
            size: (await getRequestSize(this.#logger, request)) ?? -1,
            time: request.timing().requestStart,
            type: request.resourceType(),
            url: request.url(),
        };
        this.#logger.verbose("Network (Sent): ", datapoint);
        this.#requests.push(datapoint);
        return datapoint;
    }
    async addResponse(response) {
        if (this.logErrorIfClosed("response", response.url())) {
            return null;
        }
        let request = response.request();
        const datapoint = {
            size: (await getResponseSize(this.#logger, response)) ?? -1,
            time: request.timing().responseEnd,
            type: request.resourceType(),
            url: response.url(),
        };
        this.#responses.push(datapoint);
        this.#logger.verbose("Network (Received): ", datapoint);
        // And now see if this response was a result of a redirection chain,
        // in which case we need to add all the intermediate requests too
        // (since we'll have already recorded the initial request).
        while (request.redirectedFrom()) {
            await this.addRequest(request);
            const nextRequest = request.redirectedFrom();
            assert(nextRequest);
            request = nextRequest;
        }
        return datapoint;
    }
}
class ContextNetworkLogger {
    #pageLoggers = [];
    #pageToLoggerMap;
    #logger;
    #startTime;
    #isClosed = false;
    #endTime;
    constructor(logger) {
        this.#startTime = Date.now();
        this.#pageToLoggerMap = new WeakMap();
        this.#logger = logger;
    }
    addWSRequest(page, url, data) {
        const pageForRequest = this.#pageToLoggerMap.get(page);
        assert(pageForRequest);
        return pageForRequest.addWebSocketRequest(url, data);
    }
    addWSResponse(page, url, data) {
        const pageForResponse = this.#pageToLoggerMap.get(page);
        assert(pageForResponse);
        return pageForResponse.addWebSocketResponse(url, data);
    }
    async addRequest(page, request) {
        const pageForRequest = this.#pageToLoggerMap.get(page);
        assert(pageForRequest);
        return await pageForRequest.addRequest(request);
    }
    async addResponse(page, response) {
        const pageForResponse = this.#pageToLoggerMap.get(page);
        assert(pageForResponse);
        return await pageForResponse.addResponse(response);
    }
    // Notes that the top level frame in the page has navigated, and so
    // any future requests that happen on the page are happening on a different
    // top level document.
    notePage(page) {
        if (this.isClosed()) {
            this.#logger.error("trying to add measurements for new top frame " +
                "but measurements have been closed. " +
                `page url="${page.url()}"`);
            return null;
        }
        const pageLogger = new PageNetworkLogger(this, this.#logger, page.url());
        this.#pageLoggers.push(pageLogger);
        this.#pageToLoggerMap.set(page, pageLogger);
        return pageLogger;
    }
    isClosed() {
        return this.#isClosed;
    }
    toJSON() {
        const pageReports = [];
        for (const aLogger of this.#pageLoggers) {
            pageReports.push(aLogger.toJSON());
        }
        return {
            meta: {
                startTime: this.#startTime,
                endTime: this.#endTime,
            },
            pages: pageReports,
        };
    }
    close() {
        if (this.isClosed()) {
            this.#logger.error("trying to close already closed network measurements");
            return false;
        }
        this.#endTime = Date.now();
        this.#isClosed = true;
        this.#logger.verbose("closing network measurements");
        return true;
    }
}
export class NetworkMeasurer extends BaseMeasurer {
    #netLogger;
    constructor(logger, url, context) {
        super(logger, url, context);
        this.#netLogger = new ContextNetworkLogger(logger);
    }
    measurementType() {
        return MeasurementType.Network;
    }
    #instrumentPage(page) {
        this.#netLogger.notePage(page);
        page.on("websocket", (webSocket) => {
            const wsUrl = webSocket.url();
            webSocket.on("framesent", (data) => {
                this.#netLogger.addWSRequest(page, wsUrl, data.payload);
            });
            webSocket.on("framereceived", (data) => {
                this.#netLogger.addWSResponse(page, wsUrl, data.payload);
            });
        });
        page.on("request", async (request) => {
            return await this.#netLogger.addRequest(page, request);
        });
        page.on("response", async (response) => {
            return await this.#netLogger.addResponse(page, response);
        });
        page.on("framenavigated", (frame) => {
            // If any frame other than the top level frame is navigating,
            // we don't care about it (since requests and other behaviors
            // from the child frames will be captured by the corresponding
            // top level frame).
            if (page.mainFrame() !== frame) {
                return;
            }
        });
    }
    instrumentContext() {
        super.instrumentContext();
        this.context.on("page", (page) => {
            this.#instrumentPage(page);
        });
    }
    // Disabling the linter here because this method is async, so that
    // other classes implementations can await/async if needed.
    //
    // eslint-disable-next-line @typescript-eslint/require-await
    async collect() {
        this.closeIfOpen();
        return {
            type: this.measurementType(),
            data: this.#netLogger.toJSON(),
        };
    }
}
//# sourceMappingURL=network.js.map